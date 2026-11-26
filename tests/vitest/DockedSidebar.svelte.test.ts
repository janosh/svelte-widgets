import { DockedSidebar } from '#lib'
import { flushSync, mount, tick, unmount } from 'svelte'
import { beforeEach, expect, onTestFinished, test } from 'vite-plus/test'
import {
  doc_query,
  pointer_event,
  raw_snippet,
  resize_observers,
  stub_resize_observer,
} from './index'

// observers report each new target a microtask after observe(), as browsers do
beforeEach(() => {
  stub_resize_observer((target, observer) => queueMicrotask(() => observer.fire(target)))
})
// happy-dom lays nothing out: give an element the width the row/sidebar/divider measure
const set_width = (element: Element, width: number): void => {
  Object.defineProperty(element, `clientWidth`, { value: width, configurable: true })
  const rect = DOMRect.fromRect({ x: 0, y: 0, width, height: 600 })
  Object.defineProperty(element, `getBoundingClientRect`, {
    value: () => rect,
    configurable: true,
  })
}
const resize = async (element: Element, width: number): Promise<void> => {
  set_width(element, width)
  resize_observers.resize(element)
  await tick()
}
const mount_sidebar = async (row_width: number) => {
  const row = document.createElement(`div`)
  row.className = `docked-sidebar-row`
  set_width(row, row_width)
  document.body.append(row)
  const bound = $state({ width: -1 })
  const sidebar = mount(DockedSidebar, {
    target: row,
    props: {
      label: `site table`,
      header: raw_snippet(`<span>Sites</span>`),
      children: raw_snippet(`<p>rows</p>`),
      get width() {
        return bound.width
      },
      set width(width) {
        bound.width = width
      },
    },
  })
  onTestFinished(() => row.remove())
  // effects first (they start the ResizeObservers), then their initial measurements
  flushSync()
  await tick()
  const [aside, divider] = [doc_query(`.docked-sidebar`), doc_query(`.pane-divider`)]
  return { row, sidebar, bound, aside, divider }
}
// Every class/style attribute write to the row, as the viewer's theme observers see them.
// happy-dom re-sets the style attribute on any setProperty/removeProperty, even unchanged.
const watch_row = (row: HTMLElement) => {
  const seen: (string | null)[] = []
  const record = (records: MutationRecord[]) =>
    seen.push(...records.map(({ attributeName }) => attributeName))
  // happy-dom delivers records in a microtask, so collect those and any still queued
  const observer = new MutationObserver(record)
  observer.observe(row, { attributes: true, attributeFilter: [`class`, `style`] })
  onTestFinished(() => observer.disconnect())
  const writes = () => {
    record(observer.takeRecords())
    return seen.splice(0)
  }
  // a probe write proves the observer sees style writes, so an empty list is not vacuous
  const assert_sees_writes = () => {
    row.style.setProperty(`--probe`, `1`)
    row.style.removeProperty(`--probe`)
    expect(writes()).toEqual([`style`, `style`])
  }
  return { writes, assert_sees_writes }
}

// The row holds the viewer, so every class/style write to it re-runs style observers of its
// descendants (e.g. theme-color resolvers): a row resize around a content-fit sidebar writes nothing
// to it, while a focused divider still tracks the drawn place for its arrow keys and value
test(`DockedSidebar leaves the row alone on resize unless its divider has focus`, async () => {
  const { row, aside, divider } = await mount_sidebar(1000)
  await resize(aside, 300)
  expect(divider.style.getPropertyValue(`--docked-sidebar-width`)).toBe(`300px`)
  expect(aside.classList.contains(`fit-content`)).toBe(true)

  const { writes, assert_sees_writes } = watch_row(row)
  for (const row_width of [1200, 900, 1000]) await resize(row, row_width)
  expect(writes()).toEqual([])
  // unfocused, the divider keeps its initial share instead of chasing the row
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`50`)
  assert_sees_writes()

  // focus syncs the share to the drawn place (300 px sidebar in a 1000 px row) and follows
  // row resizes while focused, then stops again on blur
  divider.dispatchEvent(new FocusEvent(`focus`))
  await tick()
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`70`)
  await resize(row, 1200)
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`75`)
  divider.dispatchEvent(new FocusEvent(`blur`))
  await tick()
  writes()
  await resize(row, 1100)
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`75`)
  expect(writes()).toEqual([])
  // refocused, the arrow key steps 5% from the drawn place (1 - 300/1100 = 72.7%), not from
  // the stale 75% or the initial 50%
  divider.dispatchEvent(new FocusEvent(`focus`))
  await tick()
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`73`)
  divider.dispatchEvent(new KeyboardEvent(`keydown`, { key: `ArrowLeft`, bubbles: true }))
  await tick()
  expect(aside.classList.contains(`fit-content`)).toBe(false)
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`68`)
  expect(row.style.getPropertyValue(`--split-pane-size`)).toMatch(/^67\.7\d*%$/)
})

// Once dragged, the divider sits at the ratio and nothing reads --docked-sidebar-width: it
// leaves the row and later sidebar resizes don't put it back
test(`a divider drag removes --docked-sidebar-width for good`, async () => {
  const { row, aside, divider } = await mount_sidebar(1000)
  await resize(aside, 300)
  expect(divider.style.getPropertyValue(`--docked-sidebar-width`)).toBe(`300px`)
  const pointer = (type: string, client_x: number) => {
    divider.dispatchEvent(
      pointer_event(type, client_x, 0, { cancelable: true, pointerId: 1 }),
    )
    flushSync()
  }
  pointer(`pointerdown`, 700)
  pointer(`pointermove`, 600)
  await tick()
  expect(aside.classList.contains(`fit-content`)).toBe(false)
  expect(row.style.getPropertyValue(`--split-pane-size`)).toBe(`60%`)
  expect(divider.style.getPropertyValue(`--docked-sidebar-width`)).toBe(``)

  pointer(`pointermove`, 500)
  pointer(`pointerup`, 500)
  await tick()
  expect(row.style.getPropertyValue(`--split-pane-size`)).toBe(`50%`)
  expect(divider.style.getPropertyValue(`--docked-sidebar-width`)).toBe(``)
  // a resized sidebar no longer touches the row at all
  const { writes, assert_sees_writes } = watch_row(row)
  await resize(aside, 450)
  expect(writes()).toEqual([])
  expect(divider.style.getPropertyValue(`--docked-sidebar-width`)).toBe(``)
  assert_sees_writes()
})

test(`DockedSidebar stacks in a narrow row and hands the row back clean on unmount`, async () => {
  const { row, sidebar, divider, aside, bound } = await mount_sidebar(375) // too narrow for both
  expect(row.classList.contains(`docked-sidebar-stacked`)).toBe(true)
  expect(divider.style.getPropertyValue(`--docked-sidebar-width`)).toMatch(/^\d+px$/)
  await resize(row, 600)
  expect(row.classList.contains(`docked-sidebar-stacked`)).toBe(false)
  await resize(row, 360)
  expect(row.classList.contains(`docked-sidebar-stacked`)).toBe(true)

  await resize(aside, 300)
  expect(bound.width).toBe(300)

  // a host summing viewer and sidebar widths must not count a sidebar that is gone
  await unmount(sidebar)
  expect(bound.width).toBe(0)
  expect(row.classList.contains(`docked-sidebar-stacked`)).toBe(false)
  expect(divider.isConnected).toBe(false)
  expect(row.style.getPropertyValue(`--docked-sidebar-width`)).toBe(``)
  expect(row.style.getPropertyValue(`--split-pane-size`)).toBe(``)
})
