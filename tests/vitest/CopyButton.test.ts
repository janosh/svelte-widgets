import { CopyButton } from '$lib'
import { Alert, Check, Copy } from '$lib/icons'
import { COPY_BUTTON_LABELS } from '$lib/labels'
import type { ComponentProps } from 'svelte'
import { tick } from 'svelte'
import { fromStore, get, writable } from 'svelte/store'
import { beforeEach, expect, test, vi } from 'vitest'
import { click, doc_query, render, press_key } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const mock_write_text = vi.fn()
vi.stubGlobal(`navigator`, { clipboard: { writeText: mock_write_text } })

const default_labels = { ready: `ready`, success: `success`, error: `error` } as const
const default_icons = { ready: Copy, success: Check, error: Alert } as const
const mount_copy_button = (props: Partial<ComponentProps<typeof CopyButton>> = {}) => {
  const unmount_button = render(CopyButton, {
    content: `test`,
    as: `div`,
    labels: default_labels,
    icons: default_icons,
    ...props,
  })
  return { unmount_button, copy_button: doc_query(`[data-sms-copy]`) }
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
  render(CopyButton, props)
  await tick()
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

test.each([`Enter`, ` `, `Escape`, `a`])(`handles %j key`, (key) => {
  const activates = key === `Enter` || key === ` `
  const onkeydown = vi.fn()
  const { copy_button } = mount_copy_button({ content: `test content`, onkeydown })
  const event = press_key(copy_button, key)

  expect(mock_write_text.mock.calls).toEqual(activates ? [[`test content`]] : [])
  expect(event.defaultPrevented).toBe(activates)
  expect(onkeydown).toHaveBeenCalledOnce()
  if (!activates) expect(copy_text(copy_button)).toContain(`ready`)
})

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
    render(TestSnippetHarness, { component: `copy-button`, content: `test`, disabled })
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
  await click(copy_button)
  expect(mock_write_text).not.toHaveBeenCalled()
  expect(copy_text(copy_button)).toContain(`ready`)
})

// on_copy_success throws: the write already succeeded, so that must not become an error
test.each([`success`, `error`] as const)(
  `reports %s with the attempted content`,
  async (state) => {
    const content_proxy = fromStore(writable(`copied text`))
    const [onclick, on_copy_error] = [vi.fn(), vi.fn()]
    const on_copy_success = vi.fn((_content: string) => {
      throw new Error(`analytics hook blew up`)
    })
    vi.spyOn(console, `error`).mockImplementation(() => void 0)
    const copy_error = new Error(`clipboard failed`)
    const pending = Promise.withResolvers<undefined>()
    mock_write_text.mockReturnValue(pending.promise)
    render(CopyButton, {
      get content() {
        return content_proxy.current
      },
      on_copy_success,
      on_copy_error,
      onclick,
    })
    const copy_button = doc_query(`[data-sms-copy]`)
    await click(copy_button)
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
  },
)

// state holds until the step before `hold_ms` elapses, then shows `final_state`
test.each([
  [`default reset_ms`, undefined, 2000, `ready`],
  [`reset_ms=0`, 0, 5000, `success`],
  [`reset_ms=-1`, -1, 5000, `success`],
] as const)(`%s: success -> %s`, async (_desc, reset_ms, hold_ms, final_state) => {
  vi.useFakeTimers()
  const { copy_button } = mount_copy_button({ reset_ms })
  await click(copy_button)

  await vi.advanceTimersByTimeAsync(hold_ms - 1)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(1)
  expect(copy_text(copy_button)).toContain(final_state)
})

test(`second click clears previous reset timer`, async () => {
  vi.useFakeTimers()
  const { copy_button } = mount_copy_button({ reset_ms: 100 })
  await click(copy_button)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(50)
  await click(copy_button)

  await vi.advanceTimersByTimeAsync(60)
  expect(copy_text(copy_button)).toContain(`success`)

  await vi.advanceTimersByTimeAsync(40)
  expect(copy_text(copy_button)).toContain(`ready`)
})

test(`unmount clears outstanding reset timer`, async () => {
  vi.useFakeTimers()
  const set_timeout_spy = vi.spyOn(globalThis, `setTimeout`)
  const clear_timeout_spy = vi.spyOn(globalThis, `clearTimeout`)
  const { unmount_button, copy_button } = mount_copy_button({ reset_ms: 100 })
  await click(copy_button)
  // pick the reset timer out of any others Svelte scheduled
  const reset_idx = set_timeout_spy.mock.calls.findIndex((call) => call[1] === 100)
  expect(reset_idx).not.toBe(-1)
  const reset_timer_id = set_timeout_spy.mock.results[reset_idx].value

  void unmount_button()
  // identity match: toHaveBeenCalledWith's deep equality would accept any Timeout object
  expect(clear_timeout_spy.mock.calls.map((call) => call[0])).toContain(reset_timer_id)
})

// $state is unavailable here (file isn't Svelte-compiled), so a fromStore getter/setter
// pair stands in for a parent's bind:state
type CopyState = `ready` | `success` | `error`

const mount_bound_copy_button = () => {
  const state_store = writable<CopyState>(`ready`)
  const state_proxy = fromStore(state_store)
  render(CopyButton, {
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
  })
  return { copy_button: doc_query(`[data-sms-copy]`), state_store }
}

test.each([
  [`success`, null, Check],
  [`error`, new Error(`clipboard failed`), Alert],
] as const)(
  `bound state: click propagates %s outward, external writes update rendering`,
  async (expected_state, rejection, icon) => {
    vi.spyOn(console, `error`).mockImplementation(() => void 0)
    if (rejection) mock_write_text.mockRejectedValue(rejection)

    const { copy_button, state_store } = mount_bound_copy_button()
    await click(copy_button)
    expect(get(state_store)).toBe(expected_state)
    expect(icon_path(copy_button)).toBe(icon.d)

    // external write back to idle flows into the component and restores the Copy icon
    state_store.set(`ready`)
    await tick()
    expect(icon_path(copy_button)).toBe(Copy.d)
  },
)

// callback or disabled changes rerun the global effect, whose teardown must release the old
// buttons so the remounted ones carry the new props
test(`global_selector remounts buttons when callbacks or disabled change`, async () => {
  const [on_success_initial, on_success_next] = [vi.fn(), vi.fn()]
  const callback = fromStore(writable(on_success_initial))
  const disabled = fromStore(writable(false))
  const { pre } = create_pre_with_code(`selector content`, `copy-target`)
  await mount_global({
    global_selector: `.copy-target`,
    get on_copy_success() {
      return callback.current
    },
    get disabled() {
      return disabled.current
    },
  })

  await click(get_single_mounted_button(pre))
  expect(on_success_initial.mock.calls).toEqual([[`selector content`]])

  callback.current = on_success_next
  await tick()
  await click(get_single_mounted_button(pre))
  expect(on_success_next.mock.calls).toEqual([[`selector content`]])
  expect(on_success_initial).toHaveBeenCalledOnce()

  disabled.current = true
  await tick()
  await click(get_single_mounted_button(pre))
  expect(get_single_mounted_button(pre).disabled).toBe(true)
  expect(mock_write_text).toHaveBeenCalledTimes(2)
})

// two global instances must not swap each other's buttons in an endless observer loop
test(`global mode leaves a pre that already has a copy button alone`, async () => {
  const { pre } = create_pre_with_code(`shared content`)
  await mount_global({ global: true, as: `a` })
  await mount_global({ global: true })
  await tick()

  expect(pre.querySelectorAll(`[data-sms-copy]`)).toHaveLength(1)
  expect(pre.querySelector(`[data-sms-copy]`)?.localName).toBe(`a`)
})

test.each([`replace`, `edit`] as const)(
  `global mode copies current text after %s`,
  async (change) => {
    const { pre, code } = create_pre_with_code(`before`)
    await mount_global({ global: true })
    // Drain mount mutations so they cannot incidentally rescan an unobserved text edit.
    await flush_rescan()
    if (change === `replace`) code.textContent = `after`
    else if (code.firstChild) code.firstChild.nodeValue = `after`
    await flush_rescan()

    await click(get_single_mounted_button(pre))
    expect(mock_write_text).toHaveBeenCalledWith(`after`)
  },
)

test(`global mode unmounts buttons whose pre left the document`, async () => {
  const { pre } = create_pre_with_code(`transient`)
  await mount_global({ global: true })
  const button = get_single_mounted_button(pre)
  pre.remove()
  document.body.append(document.createElement(`div`)) // a mutation after the removal
  await tick()

  expect(button.isConnected).toBe(false)
})

test.each([
  [`button`, undefined, `button`, 0],
  [`a`, undefined, `button`, 0],
  [`button`, `.never-skip`, `button`, 1],
  [`a`, null, `a`, 0], // null skips `pre` blocks already holding an `as` element
] as const)(
  `global as=%s with skip_selector=%j and an existing %s adds %i buttons`,
  async (as, skip_selector, existing, count) => {
    const { pre } = create_pre_with_code(`code with an existing control`)
    pre.append(document.createElement(existing))
    await mount_global({ global: true, as, skip_selector })

    expect(pre.querySelectorAll(`[data-sms-copy]`)).toHaveLength(count)
  },
)

// initial scan only sees nodes present at mount; later pre>code must ride the observer
// mounting into a pre is itself a childList mutation; as=a must not stack a second anchor
test.each([`button`, `a`])(
  `global mode mounts one %s on dynamically added code`,
  async (as) => {
    await mount_global({ global: true, as })
    const { pre } = create_pre_with_code(`test code`)
    await flush_rescan()

    const button = get_single_mounted_button(pre)
    expect(button.localName).toBe(as)

    document.body.append(document.createElement(`div`))
    await flush_rescan()

    expect(get_single_mounted_button(pre)).toBe(button)
  },
)

test(`partial labels retain the exported icon-only success default`, async () => {
  expect(COPY_BUTTON_LABELS).toEqual({ ready: ``, success: ``, error: `` })

  const { copy_button } = mount_copy_button({ labels: { ready: `Kopieren` } })
  expect(copy_text(copy_button).trim()).toBe(`Kopieren`)

  await click(copy_button)
  expect(copy_button.dataset.state).toBe(`success`)
  expect(copy_text(copy_button).trim()).toBe(``)
  expect(icon_path(copy_button)).toBe(Check.d)
})
