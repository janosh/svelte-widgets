import { CopyButton } from '$lib'
import { Alert, Check, Copy } from '$lib/icons'
import { COPY_BUTTON_LABELS } from '$lib/labels'
import type { ComponentProps } from 'svelte'
import { mount, tick, unmount } from 'svelte'
import { fromStore, get, writable } from 'svelte/store'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'
import TestCopyButtonGlobalUpdate from './TestCopyButtonGlobalUpdate.svelte'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const mock_write_text = vi.fn()
vi.stubGlobal(`navigator`, { clipboard: { writeText: mock_write_text } })

const default_labels = { ready: `ready`, success: `success`, error: `error` } as const
const default_icons = { ready: Copy, success: Check, error: Alert } as const
const mount_copy_button = (props: Partial<ComponentProps<typeof CopyButton>> = {}) => {
  const copy_button_component = mount(CopyButton, {
    target: document.body,
    props: {
      content: `test`,
      as: `div`,
      labels: default_labels,
      icons: default_icons,
      ...props,
    },
  })
  const copy_button = doc_query(`[data-sms-copy]`)
  return { copy_button_component, copy_button }
}

const click_copy_button = async (copy_button: HTMLElement): Promise<void> => {
  copy_button.click()
  await tick()
}

const create_pre_with_code = (
  code_text: string,
  class_name = ``,
): { pre: HTMLPreElement; code: HTMLElement } => {
  const [pre, code] = [document.createElement(`pre`), document.createElement(`code`)]
  code.className = class_name
  code.textContent = code_text
  pre.append(code)
  document.body.append(pre)
  return { pre, code }
}

const icon_path = (copy_button: HTMLElement): string | null =>
  copy_button.querySelector(`[data-sms-action-content] svg path`)?.getAttribute(`d`) ??
  null

const copy_text = (copy_button: HTMLElement): string =>
  copy_button.querySelector(`[data-sms-action-content]`)?.textContent ?? ``

const get_single_mounted_button = (pre: HTMLPreElement): HTMLButtonElement => {
  const btns = pre.querySelectorAll<HTMLButtonElement>(`[data-sms-copy]`)
  expect(btns).toHaveLength(1)
  return btns.item(0)
}

// global/global_selector mounts scan the document one tick after mounting
const mount_global = async (props: Partial<ComponentProps<typeof CopyButton>>) => {
  const component = mount(CopyButton, { target: document.body, props })
  await tick()
  return component
}

// only the initial scan is sync; later ones ride the MutationObserver, coalesced per frame
const flush_rescan = async () => {
  await tick()
  await new Promise(requestAnimationFrame)
}

beforeEach(() => {
  mock_write_text.mockReset()
  mock_write_text.mockResolvedValue(undefined)
})

afterEach(() => vi.useRealTimers())

test.each([`Enter`, ` `, `Escape`, `Tab`, `ArrowUp`, `a`, `1`])(
  `handles %j key`,
  (key) => {
    const activates = key === `Enter` || key === ` `
    const onkeydown = vi.fn()
    const { copy_button } = mount_copy_button({ content: `test content`, onkeydown })
    const event = new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true })

    copy_button.dispatchEvent(event)

    expect(mock_write_text.mock.calls).toEqual(activates ? [[`test content`]] : [])
    expect(event.defaultPrevented).toBe(activates)
    expect(onkeydown).toHaveBeenCalledOnce()
    if (!activates) expect(copy_text(copy_button)).toContain(`ready`)
  },
)

test.each([
  [`div`, false, `0`, null],
  [`div`, true, `-1`, `true`],
  [`button`, true, `-1`, `true`],
  [`button`, false, `0`, null],
] as const)(
  `accessibility attrs for as=%s disabled=%s`,
  (as, disabled, expected_tabindex, expected_aria) => {
    const { copy_button } = mount_copy_button({ as, disabled })
    expect(copy_button.localName).toBe(as)
    expect(copy_button.getAttribute(`role`)).toBe(`button`)
    expect(copy_button.getAttribute(`tabindex`)).toBe(expected_tabindex)
    expect(copy_button.getAttribute(`aria-disabled`)).toBe(expected_aria)
    // the native disabled attribute is only valid on a real <button>
    expect(copy_button.hasAttribute(`disabled`)).toBe(as === `button` && disabled)
  },
)

test.each([
  [``, 0],
  [`Copy me`, 1],
] as const)(`text label %j renders %d text span(s)`, (text, expected_spans) => {
  const { copy_button } = mount_copy_button({
    labels: { ready: text, success: text, error: text },
  })
  const wrapper = doc_query(`[data-sms-action-content]`)
  expect(getComputedStyle(copy_button).whiteSpace).toBe(`nowrap`)
  expect(wrapper.querySelectorAll(`span`)).toHaveLength(expected_spans)
  expect(icon_path(copy_button)).toBe(Copy.d)
  // an empty label must render no text at all, not a stray placeholder
  expect(copy_text(copy_button).trim()).toBe(text)
})

test.each([true, false])(
  `custom children snippet renders and receives disabled=%s`,
  (disabled) => {
    mount(TestSnippetHarness, {
      target: document.body,
      props: { component: `copy-button`, content: `test`, disabled },
    })
    const copy_button = doc_query(`[data-sms-copy]`)
    expect(copy_button.querySelector(`[data-sms-action-content] svg`)).toBeNull()
    const snippet = copy_button.querySelector<HTMLElement>(`[data-testid="copy-snippet"]`)
    expect(snippet?.dataset.disabled).toBe(`${disabled}`)
    expect(snippet?.dataset.state).toBe(`ready`)
  },
)

test.each([
  [`disabled=true`, { disabled: true, content: `disabled content` }],
  [`empty content`, { content: `` }],
] as const)(`%s blocks copy and preserves ready state`, async (_label, props) => {
  const { copy_button } = mount_copy_button(props)
  await click_copy_button(copy_button)
  expect(mock_write_text).not.toHaveBeenCalled()
  expect(copy_text(copy_button)).toContain(`ready`)
})

test.each([`success`, `error`] as const)(
  `reports %s with the attempted content`,
  async (state) => {
    const content_proxy = fromStore(writable(`copied text`))
    const [onclick, on_copy_success, on_copy_error] = [vi.fn(), vi.fn(), vi.fn()]
    const console_error_spy = vi.spyOn(console, `error`).mockImplementation(() => void 0)
    const copy_error = new Error(`clipboard failed`)
    const pending = Promise.withResolvers<undefined>()
    mock_write_text.mockReturnValue(pending.promise)
    mount(CopyButton, {
      target: document.body,
      props: {
        get content() {
          return content_proxy.current
        },
        on_copy_success,
        on_copy_error,
        onclick,
      },
    })
    const copy_button = doc_query(`[data-sms-copy]`)
    await click_copy_button(copy_button)
    content_proxy.current = `changed while copying`
    if (state === `success`) pending.resolve(undefined)
    else pending.reject(copy_error)
    await Promise.resolve()
    await tick()
    expect(mock_write_text).toHaveBeenCalledExactlyOnceWith(`copied text`)
    expect(on_copy_success.mock.calls).toEqual(
      state === `success` ? [[`copied text`]] : [],
    )
    expect(on_copy_error.mock.calls).toEqual(
      state === `error` ? [[copy_error, `copied text`]] : [],
    )
    expect(copy_button.dataset.state).toBe(state)
    expect(onclick).toHaveBeenCalledOnce()
    console_error_spy.mockRestore()
  },
)

test(`a throwing on_copy_success is not reported as a copy failure`, async () => {
  // the write already succeeded, so its catch must not flip this into the error state
  const on_copy_error = vi.fn()
  const on_copy_success = vi.fn(() => {
    throw new Error(`analytics hook blew up`)
  })
  const console_error_spy = vi.spyOn(console, `error`).mockImplementation(() => void 0)
  const { copy_button } = mount_copy_button({
    content: `hello`,
    on_copy_success,
    on_copy_error,
  })
  await click_copy_button(copy_button)
  expect(on_copy_error).not.toHaveBeenCalled()
  expect(copy_text(copy_button)).toContain(`success`)
  expect(console_error_spy).toHaveBeenCalledOnce()
  console_error_spy.mockRestore()
})

test.each([
  [`default reset_ms`, { content: `default reset` }, 2000],
  [`custom reset_ms`, { content: `half sec`, reset_ms: 500 }, 500],
] as const)(`%s resets on time`, async (_desc, props, expected_delay_ms) => {
  vi.useFakeTimers()
  const { copy_button } = mount_copy_button(props)
  await click_copy_button(copy_button)

  await vi.advanceTimersByTimeAsync(expected_delay_ms - 1)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(1)
  expect(copy_text(copy_button)).toContain(`ready`)
})

test.each([0, -1])(`reset_ms=%s does not auto-reset`, async (reset_ms: number) => {
  vi.useFakeTimers()
  const { copy_button } = mount_copy_button({ content: `sticky`, reset_ms })
  await click_copy_button(copy_button)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(5000)
  expect(copy_text(copy_button)).toContain(`success`)
})

test(`second click clears previous reset timer`, async () => {
  vi.useFakeTimers()
  const { copy_button } = mount_copy_button({ content: `multi click`, reset_ms: 100 })
  await click_copy_button(copy_button)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(50)
  await click_copy_button(copy_button)

  await vi.advanceTimersByTimeAsync(60)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(40)
  expect(copy_text(copy_button)).toContain(`ready`)
})

test(`unmount clears outstanding reset timer`, async () => {
  vi.useFakeTimers()
  const set_timeout_spy = vi.spyOn(globalThis, `setTimeout`)
  const clear_timeout_spy = vi.spyOn(globalThis, `clearTimeout`)
  const { copy_button_component, copy_button } = mount_copy_button({
    content: `cleanup`,
    reset_ms: 100,
  })
  await click_copy_button(copy_button)
  // pick the reset timer out of any others Svelte scheduled
  const reset_idx = set_timeout_spy.mock.calls.findIndex((call) => call[1] === 100)
  expect(reset_idx).not.toBe(-1)
  const reset_timer_id = set_timeout_spy.mock.results[reset_idx].value

  void unmount(copy_button_component)
  // identity match: toHaveBeenCalledWith's deep equality would accept any Timeout object
  expect(clear_timeout_spy.mock.calls.map((call) => call[0])).toContain(reset_timer_id)
})

// $state is unavailable here (file isn't Svelte-compiled), so a fromStore getter/setter
// pair stands in for a parent's bind:state
type CopyState = `ready` | `success` | `error`

const mount_bound_copy_button = () => {
  const state_store = writable<CopyState>(`ready`)
  const state_proxy = fromStore(state_store)
  mount(CopyButton, {
    target: document.body,
    props: {
      content: `bound content`,
      as: `div`,
      labels: default_labels,
      icons: default_icons,
      reset_ms: 0,
      get state() {
        return state_proxy.current
      },
      set state(new_state: CopyState) {
        state_store.set(new_state)
      },
    },
  })
  return { copy_button: doc_query(`[data-sms-copy]`), state_store }
}

test.each([
  [`success`, null, Check],
  [`error`, new Error(`clipboard failed`), Alert],
] as const)(
  `bound state: click propagates %s outward, external writes update rendering`,
  async (expected_state, rejection, icon) => {
    const console_error_spy = vi.spyOn(console, `error`).mockImplementation(() => void 0)
    if (rejection) mock_write_text.mockRejectedValue(rejection)

    const { copy_button, state_store } = mount_bound_copy_button()
    await click_copy_button(copy_button)
    expect(get(state_store)).toBe(expected_state)
    expect(icon_path(copy_button)).toBe(icon.d)

    // external write back to idle flows into the component and restores the Copy icon
    state_store.set(`ready`)
    await tick()
    expect(icon_path(copy_button)).toBe(Copy.d)

    console_error_spy.mockRestore()
  },
)

test(`global=true propagates disabled prop to mounted buttons`, async () => {
  const on_copy_success = vi.fn()
  const { pre } = create_pre_with_code(`global content`)

  const component = await mount_global({ global: true, disabled: true, on_copy_success })

  await click_copy_button(get_single_mounted_button(pre))

  expect(mock_write_text).not.toHaveBeenCalled()
  expect(on_copy_success).not.toHaveBeenCalled()
  expect(get_single_mounted_button(pre).disabled).toBe(true)

  void unmount(component)
})

test(`global_selector updates mounted button props when callbacks change`, async () => {
  const [on_copy_success_initial, on_copy_success_next] = [vi.fn(), vi.fn()]
  const { pre } = create_pre_with_code(`selector content`, `copy-target`)

  const copy_button_component = mount(TestCopyButtonGlobalUpdate, {
    target: document.body,
    props: {
      on_success_initial: on_copy_success_initial,
      on_success_next: on_copy_success_next,
    },
  })
  await tick()

  await click_copy_button(get_single_mounted_button(pre))
  expect(on_copy_success_initial).toHaveBeenCalledWith(`selector content`)
  expect(on_copy_success_initial).toHaveBeenCalledTimes(1)
  expect(on_copy_success_next).not.toHaveBeenCalled()

  doc_query<HTMLButtonElement>(`[data-test-use-next-callback]`).click()
  await tick()

  await click_copy_button(get_single_mounted_button(pre))
  expect(on_copy_success_next).toHaveBeenCalledWith(`selector content`)
  expect(on_copy_success_next).toHaveBeenCalledTimes(1)
  expect(on_copy_success_initial).toHaveBeenCalledTimes(1)

  doc_query<HTMLButtonElement>(`[data-test-toggle-global-disabled]`).click()
  await tick()

  await click_copy_button(get_single_mounted_button(pre))
  expect(on_copy_success_initial).toHaveBeenCalledTimes(1)
  expect(on_copy_success_next).toHaveBeenCalledTimes(1)

  void unmount(copy_button_component)
})

test(`global_selector remount uses latest callback after parent remount`, async () => {
  const [on_copy_success_initial, on_copy_success_next] = [vi.fn(), vi.fn()]
  const { pre } = create_pre_with_code(`selector content`, `copy-target`)
  const global_props = { global_selector: `.copy-target`, reset_ms: 1000 }

  const initial = await mount_global({
    ...global_props,
    on_copy_success: on_copy_success_initial,
  })

  await click_copy_button(get_single_mounted_button(pre))
  expect(on_copy_success_initial).toHaveBeenCalledTimes(1)
  expect(on_copy_success_next).not.toHaveBeenCalled()

  void unmount(initial)
  const remounted = await mount_global({
    ...global_props,
    on_copy_success: on_copy_success_next,
  })

  await click_copy_button(get_single_mounted_button(pre))
  expect(on_copy_success_initial).toHaveBeenCalledTimes(1)
  expect(on_copy_success_next).toHaveBeenCalledTimes(1)

  void unmount(remounted)
})

// two global instances must not swap each other's buttons in an endless observer loop
test(`global mode leaves a pre that already has a copy button alone`, async () => {
  const { pre } = create_pre_with_code(`shared content`)
  const first = await mount_global({ global: true, as: `a`, skip_selector: null })
  const second = await mount_global({ global: true, skip_selector: null })
  await tick()

  expect(pre.querySelectorAll(`[data-sms-copy]`)).toHaveLength(1)
  expect(pre.querySelector(`[data-sms-copy]`)?.localName).toBe(`a`)

  void unmount(first)
  void unmount(second)
})

test.each([`replace`, `edit`] as const)(
  `global mode copies current text after %s`,
  async (change) => {
    const { pre, code } = create_pre_with_code(`before`)
    const component = await mount_global({ global: true })
    // Drain mount mutations so they cannot incidentally rescan an unobserved text edit.
    await flush_rescan()
    if (change === `replace`) code.textContent = `after`
    else if (code.firstChild) code.firstChild.nodeValue = `after`
    await flush_rescan()

    await click_copy_button(get_single_mounted_button(pre))
    expect(mock_write_text).toHaveBeenCalledWith(`after`)
    void unmount(component)
  },
)

test(`global mode unmounts buttons whose pre left the document`, async () => {
  const { pre } = create_pre_with_code(`transient`)
  const component = await mount_global({ global: true })
  const button = get_single_mounted_button(pre)
  pre.remove()
  document.body.append(document.createElement(`div`)) // a mutation after the removal
  await tick()

  expect(button.isConnected).toBe(false)
  void unmount(component)
})

test.each([
  [`button`, `.never-skip`, 2],
  [`a`, null, 1],
] as const)(
  `global as=%s respects skip_selector=%j`,
  async (as, skip_selector, count) => {
    const { pre } = create_pre_with_code(`code with an existing control`)
    const existing = document.createElement(as)
    existing.textContent = `existing`
    pre.append(existing)
    const component = await mount_global({ global: true, as, skip_selector })

    expect(pre.querySelectorAll(as)).toHaveLength(count)
    expect(existing.hasAttribute(`data-sms-copy`)).toBe(false)
    if (count === 1) expect(pre.querySelector(`[data-sms-copy]`)).toBeNull()
    else {
      await click_copy_button(get_single_mounted_button(pre))
      expect(mock_write_text).toHaveBeenCalledWith(`code with an existing control`)
    }
    void unmount(component)
  },
)

// initial scan only sees nodes present at mount; later pre>code must ride the observer
// mounting into a pre is itself a childList mutation; as=a must not stack a second anchor
test.each([`button`, `a`])(
  `global mode mounts one %s on dynamically added code`,
  async (as) => {
    const component = await mount_global({ global: true, as })
    const { pre } = create_pre_with_code(`test code`)
    await flush_rescan()

    const button = get_single_mounted_button(pre)
    expect(button.localName).toBe(as)

    document.body.append(document.createElement(`div`))
    await flush_rescan()

    expect(get_single_mounted_button(pre)).toBe(button)

    void unmount(component)
  },
)

test(`partial labels retain the exported icon-only success default`, async () => {
  expect(COPY_BUTTON_LABELS).toEqual({ ready: ``, success: ``, error: `` })

  const { copy_button } = mount_copy_button({ labels: { ready: `Kopieren` } })
  expect(copy_text(copy_button).trim()).toBe(`Kopieren`)

  await click_copy_button(copy_button)
  expect(copy_button.dataset.state).toBe(`success`)
  expect(copy_text(copy_button).trim()).toBe(``)
  expect(icon_path(copy_button)).toBe(Check.d)
})
