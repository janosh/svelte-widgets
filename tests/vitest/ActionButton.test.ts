import { ActionButton, type ActionState } from '$lib'
import { mount, tick, type ComponentProps, unmount } from 'svelte'
import { expect, test, vi } from 'vitest'
import { doc_query, render } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const labels = {
  ready: `Save`,
  pending: `Saving…`,
  success: `Saved`,
  error: `Failed`,
} satisfies Record<ActionState, string>

const flush_action = async (): Promise<void> => {
  await Promise.resolve()
  await tick()
}

const mount_action_button = (
  props: Partial<ComponentProps<typeof ActionButton>>,
): HTMLButtonElement => {
  render(ActionButton, { action: () => `saved`, labels, reset_ms: 0, ...props })
  return doc_query(`[data-sms-action]`)
}

const action_text = (button: HTMLElement): string =>
  button.querySelector(`[data-sms-action-content]`)?.textContent ?? ``

test(`reserves width and renders every state label as text`, () => {
  const text_labels = { ...labels, ready: `<b>Save</b>` }
  const button = mount_action_button({ labels: text_labels })
  const content = doc_query(`[data-sms-action-content]`)
  const width_sizer = doc_query(`[data-sms-action-width]`)
  expect(getComputedStyle(button).width).toBe(`fit-content`)
  expect(getComputedStyle(button).display).toBe(`inline-grid`)
  expect(getComputedStyle(content).justifyContent).toBe(`center`)
  expect(Array.from(width_sizer.children, (child) => child.textContent?.trim())).toEqual(
    Object.values(text_labels),
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

const click = () => new MouseEvent(`click`, { bubbles: true, cancelable: true })
const keydown = (key: string) => () =>
  new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true })

// custom elements never follow href; disabled ones also swallow consumer handlers
test.each([
  [`click`, click, true, [0, 0]],
  [`Enter`, keydown(`Enter`), true, [0, 0]],
  [`Space`, keydown(` `), true, [0, 0]],
  [`click`, click, false, [1, 0]],
  [`Enter`, keydown(`Enter`), false, [0, 1]],
] as const)(
  `custom element %s with disabled=%s`,
  (_name, make_event, disabled, [onclick_calls, onkeydown_calls]) => {
    const [action, onclick, onkeydown] = [vi.fn(), vi.fn(), vi.fn()]
    const props = { action, as: `a`, disabled, onclick, onkeydown }
    Reflect.set(props, `href`, `#should-not-navigate`)
    const event = make_event()
    mount_action_button(props).dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(action).toHaveBeenCalledTimes(disabled ? 0 : 1)
    expect(onclick).toHaveBeenCalledTimes(onclick_calls)
    expect(onkeydown).toHaveBeenCalledTimes(onkeydown_calls)
  },
)

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
  const component: ReturnType<typeof mount> = mount(ActionButton, {
    target: document.body,
    props: {
      action: () => `saved`,
      labels,
      reset_ms: 100,
      on_success: () => unmount(component),
    },
  })

  doc_query<HTMLButtonElement>(`[data-sms-action]`).click()
  await flush_action()

  expect(vi.getTimerCount()).toBe(0)
})

test(`children receive the generic action result`, async () => {
  render(TestSnippetHarness, {
    component: `action-button`,
    action: () => `saved-result`,
    reset_ms: 0,
  })
  const button = doc_query<HTMLButtonElement>(`[data-sms-action]`)

  button.click()
  await flush_action()
  const snippet = doc_query(`[data-testid="action-snippet"]`)
  expect(snippet.dataset.state).toBe(`success`)
  expect(snippet.dataset.result).toBe(`saved-result`)
  expect(snippet.dataset.disabled).toBe(`false`)
})
