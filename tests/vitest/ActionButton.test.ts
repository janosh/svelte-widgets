import { ActionButton, type ActionState } from '$lib'
import { mount, tick, type ComponentProps, unmount } from 'svelte'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const labels = {
  ready: { text: `Save` },
  pending: { text: `Saving…` },
  success: { text: `Saved` },
  error: { text: `Failed` },
} satisfies Record<ActionState, { text: string }>

afterEach(() => vi.useRealTimers())

const flush_action = async (): Promise<void> => {
  await Promise.resolve()
  await tick()
}

const mount_action_button = (
  props: Partial<ComponentProps<typeof ActionButton>>,
): HTMLButtonElement => {
  mount(ActionButton, {
    target: document.body,
    props: { action: () => `saved`, labels, reset_ms: 0, ...props },
  })
  return doc_query(`[data-sms-action]`)
}

const action_text = (button: HTMLElement): string =>
  button.querySelector(`[data-sms-action-content]`)?.textContent ?? ``

test(`reserves width and renders every state label as text`, () => {
  const text_labels = { ...labels, ready: { text: `<b>Save</b>` } }
  const button = mount_action_button({ labels: text_labels })
  const content = doc_query(`[data-sms-action-content]`)
  const width_sizer = doc_query(`[data-sms-action-width]`)
  expect(getComputedStyle(button).width).toBe(`fit-content`)
  expect(getComputedStyle(button).display).toBe(`inline-grid`)
  expect(getComputedStyle(content).justifyContent).toBe(`center`)
  expect(Array.from(width_sizer.children, (child) => child.textContent?.trim())).toEqual(
    Object.values(text_labels).map(({ text }) => text),
  )
  expect(action_text(button).trim()).toBe(`<b>Save</b>`)
  expect(button.querySelector(`b`)).toBeNull()
})

test(`blocks duplicate actions while pending and resets after success`, async () => {
  vi.useFakeTimers()
  let resolve_action: ((result: string) => void) | undefined
  const action = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolve_action = resolve
      }),
  )
  const on_success = vi.fn()
  const button = mount_action_button({ action, reset_ms: 100, on_success })

  button.click()
  await tick()
  expect(button.dataset.state).toBe(`pending`)
  expect(button.disabled).toBe(true)
  expect(button.getAttribute(`aria-busy`)).toBe(`true`)
  expect(action_text(button)).toContain(`Saving…`)

  button.click()
  expect(action).toHaveBeenCalledOnce()

  if (!resolve_action) throw new Error(`Action promise resolver was not initialized`)
  resolve_action(`saved-result`)
  await flush_action()
  expect(button.dataset.state).toBe(`success`)
  expect(button.disabled).toBe(false)
  expect(action_text(button)).toContain(`Saved`)
  expect(on_success).toHaveBeenCalledWith(`saved-result`)

  await vi.advanceTimersByTimeAsync(99)
  expect(button.dataset.state).toBe(`success`)
  await vi.advanceTimersByTimeAsync(1)
  expect(button.dataset.state).toBe(`ready`)
})

test.each([
  [`click`, new MouseEvent(`click`, { bubbles: true, cancelable: true })],
  [
    `Enter`,
    new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true, cancelable: true }),
  ],
  [`Space`, new KeyboardEvent(`keydown`, { key: ` `, bubbles: true, cancelable: true })],
] as const)(
  `disabled custom elements suppress %s activation and consumer handlers`,
  (_name, event) => {
    const action = vi.fn()
    const onclick = vi.fn()
    const onkeydown = vi.fn()
    const props = { action, as: `a`, disabled: true, onclick, onkeydown }
    Reflect.set(props, `href`, `#should-not-navigate`)
    mount_action_button(props)

    doc_query<HTMLAnchorElement>(`a[data-sms-action]`).dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(action).not.toHaveBeenCalled()
    expect(onclick).not.toHaveBeenCalled()
    expect(onkeydown).not.toHaveBeenCalled()
  },
)

test(`enabled custom elements run the action without following href`, () => {
  const action = vi.fn(() => `saved`)
  const props = { action, as: `a` }
  Reflect.set(props, `href`, `#should-not-navigate`)
  const click = new MouseEvent(`click`, { bubbles: true, cancelable: true })

  mount_action_button(props).dispatchEvent(click)

  expect(click.defaultPrevented).toBe(true)
  expect(action).toHaveBeenCalledOnce()
})

test(`reports action errors without throwing from the event handler`, async () => {
  const action_error = new Error(`save failed`)
  const on_error = vi.fn()
  const console_error_spy = vi.spyOn(console, `error`).mockImplementation(() => void 0)
  const button = mount_action_button({
    action: () => Promise.reject(action_error),
    on_error,
  })

  button.click()
  await flush_action()
  expect(button.dataset.state).toBe(`error`)
  expect(action_text(button)).toContain(`Failed`)
  expect(on_error).toHaveBeenCalledWith(action_error)
  expect(console_error_spy).toHaveBeenCalledWith(
    `ActionButton action failed`,
    action_error,
  )
})

test(`keeps success state when its success callback throws`, async () => {
  const callback_error = new Error(`analytics failed`)
  const console_error_spy = vi.spyOn(console, `error`).mockImplementation(() => void 0)
  const button = mount_action_button({
    on_success: () => {
      throw callback_error
    },
  })

  button.click()
  await flush_action()
  expect(button.dataset.state).toBe(`success`)
  expect(console_error_spy).toHaveBeenCalledWith(
    `ActionButton on_success callback failed`,
    callback_error,
  )
})

test(`does not schedule a reset after its success callback unmounts it`, async () => {
  vi.useFakeTimers()
  type MountedActionButton = Parameters<typeof unmount>[0]
  let component: MountedActionButton | undefined
  component = mount(ActionButton, {
    target: document.body,
    props: {
      action: () => `saved`,
      labels,
      reset_ms: 100,
      on_success: async () => {
        if (!component) throw new Error(`ActionButton component was not mounted`)
        await unmount(component)
      },
    },
  })

  doc_query<HTMLButtonElement>(`[data-sms-action]`).click()
  await flush_action()

  expect(vi.getTimerCount()).toBe(0)
})

test(`children receive the generic action result`, async () => {
  mount(TestSnippetHarness, {
    target: document.body,
    props: {
      component: `action-button`,
      action: () => `saved-result`,
      reset_ms: 0,
    },
  })
  const button = doc_query<HTMLButtonElement>(`[data-sms-action]`)

  button.click()
  await flush_action()
  const snippet = doc_query(`[data-testid="action-snippet"]`)
  expect(snippet.dataset.state).toBe(`success`)
  expect(snippet.dataset.result).toBe(`saved-result`)
  expect(snippet.dataset.disabled).toBe(`false`)
})
