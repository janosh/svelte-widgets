import Toast from '$lib/Toast.svelte'
import {
  activate_toast_action,
  create_toast_queue,
  DEFAULT_TOAST_DURATION_MS,
  dismiss_toast,
  enqueue_toast,
  expire_toasts,
  TOAST_PRIORITIES,
  ToastStore,
} from '$lib/toast-queue.svelte.ts'
import type {
  ToastCloseHandler,
  ToastItem,
  ToastLifecycleEffect,
  ToastPriority,
  ToastQueue,
  ToastRequest,
} from '$lib/toast-queue.svelte.ts'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query, escape_key } from './index'

const undo = { label: `Undo` }
// The ladder this queue was extracted from: `action` for undo prompts, `watch` for
// file-watch notices. Neither name exists on the default five, which ranked them -1.
const custom_ladder = [`progress`, `info`, `action`, `watch`, `error`] as const

// Insertion helper: every reducer case builds its queue by enqueueing at a known clock
const add = <Priority extends string>(
  queue: ToastQueue<Priority>,
  message: string,
  request: Partial<ToastRequest<NoInfer<Priority>>> = {},
  now_ms = 0,
) => enqueue_toast(queue, { message, ...request }, now_ms)

const messages = (toasts: readonly ToastItem<string>[]) =>
  toasts.map((toast) => toast.message)

const fake_clock = () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
}

describe(`toast queue reducer`, () => {
  test.each([
    [`error`, true],
    [`warning`, true],
    [`info`, false],
    [`progress`, false],
  ] as const)(`a %s arrival preempts an active info toast: %s`, (priority, preempts) => {
    const first = add(create_toast_queue(), `first`).queue
    const { queue } = add(first, `second`, { priority })

    expect(queue.active_toast?.message).toBe(preempts ? `second` : `first`)
    expect(messages(queue.pending)).toEqual([preempts ? `first` : `second`])
  })

  test(`a demoted toast keeps its unspent visibility budget`, () => {
    // `a` is seen for 200 ms of its 1000 ms budget before `b` interrupts it, so it must
    // come back with 800 ms left rather than a fresh 1000 or the 800 it never spends
    const first = add(create_toast_queue(), `a`, { visible_duration_ms: 1000 }).queue
    expect(first.active_toast?.expires_at_ms).toBe(1000)

    const interrupted = add(
      first,
      `b`,
      { priority: `error`, visible_duration_ms: 500 },
      200,
    ).queue
    expect(interrupted.active_toast?.message).toBe(`b`)
    expect(interrupted.active_toast?.expires_at_ms).toBe(700)
    // paused: no deadline runs while the toast is off screen
    expect(interrupted.pending[0].expires_at_ms).toBeNull()
    expect(interrupted.pending[0].visible_duration_ms).toBe(800)

    const resumed = expire_toasts(interrupted, 700)
    expect(resumed.effects).toEqual([
      { reason: `timeout`, toast: interrupted.active_toast },
    ])
    expect(resumed.queue.active_toast?.message).toBe(`a`)
    expect(resumed.queue.active_toast?.expires_at_ms).toBe(1500) // 700 + the banked 800
  })

  test.each([
    // A bare deadline is a wall-clock contract and keeps running off screen. Pair it with
    // a visibility budget and the budget wins: the deadline is banked rather than left
    // running on a toast nobody has seen yet.
    [`an absolute deadline keeps running while the toast waits`, {}, 1000, true],
    [
      `a visibility budget banks the deadline instead`,
      { visible_duration_ms: 300 },
      null,
      false,
    ],
  ] as const)(`%s`, (_desc, budget, banked_deadline, expires_while_pending) => {
    const first = add(create_toast_queue(), `a`).queue
    const { queue } = add(first, `b`, { expires_at_ms: 1000, ...budget }, 200)

    expect(queue.pending[0].expires_at_ms).toBe(banked_deadline)
    expect(expire_toasts(queue, 1000).queue.pending).toEqual(
      expires_while_pending ? [] : queue.pending,
    )
  })

  describe(`overflow`, () => {
    // 1 active + 4 pending with max_pending 3, so exactly one toast has to go
    const overflow_case = (has_action: readonly boolean[]) => {
      let queue = create_toast_queue()
      let effects: readonly ToastLifecycleEffect[] = []
      queue = add(queue, `active`).queue
      for (const [idx, action] of has_action.entries()) {
        const transition = add(queue, `p${idx}`, action ? { action: undo } : {})
        queue = transition.queue
        effects = transition.effects
      }
      return { queue, effects }
    }

    test.each([
      // [description, pending actions, dropped, kept]
      [
        `drops the newest when none carry an action`,
        [false, false, false, false],
        [`p3`],
        [`p0`, `p1`, `p2`],
      ],
      [
        `skips past actions to the newest plain notice`,
        [false, true, true, false],
        [`p3`],
        [`p0`, `p1`, `p2`],
      ],
      [
        `drops the only actionless toast, wherever it sits`,
        [false, true, true, true],
        [`p0`],
        [`p1`, `p2`, `p3`],
      ],
      [
        `overflows nothing when every pending toast has an action`,
        [true, true, true, true],
        [],
        [`p0`, `p1`, `p2`, `p3`],
      ],
    ] as const)(`%s`, (_desc, has_action, dropped, kept) => {
      const { queue, effects } = overflow_case(has_action)

      expect(effects.map((effect) => effect.toast.message)).toEqual(dropped)
      expect(effects.every((effect) => effect.reason === `overflow`)).toBe(true)
      expect(messages(queue.pending)).toEqual(kept)
    })
  })

  describe(`dedupe`, () => {
    test(`a repeat updates in place, on screen or in the queue`, () => {
      const first = add(create_toast_queue(), `saving`).queue
      const repeat = add(first, `saving`)

      expect(repeat.deduplicated).toBe(true)
      expect(repeat.toast_id).toBe(first.active_toast?.id)
      expect(repeat.queue.pending).toEqual([])

      // a match further back is updated where it sits and re-ranked from there, so a
      // repeat that arrives louder promotes past the toast currently on screen
      let queue = add(create_toast_queue(), `on screen`).queue
      queue = add(queue, `queued`, { dedupe_key: `job` }).queue
      const louder = add(queue, `louder`, { dedupe_key: `job`, priority: `error` })

      expect(louder.queue.active_toast?.message).toBe(`louder`)
      expect(messages(louder.queue.pending)).toEqual([`on screen`])
    })

    // What a repeat does to the toast it matches turns on the two priorities. Each case
    // starts from the same `warning` toast carrying an action and a 900 ms budget, and
    // the repeat is the same text with only its priority and `supplies` changed.
    const original = {
      priority: `warning`,
      dedupe_key: `job`,
      action: undo,
      visible_duration_ms: 900,
    } as const
    const retry = { label: `Retry` }

    test.each([
      // [repeat's priority, what it does, what it supplies, priority/action/budget/deadline after]
      [`lower`, `refreshes the text only`, {}, [`warning`, undo, 900, 900]],
      // omitting a field is not an instruction to clear it: dropping the budget here
      // left the toast on screen for good
      [`equal`, `keeps what it leaves out`, {}, [`warning`, undo, 900, 1000]],
      [`higher`, `clears what it leaves out`, {}, [`error`, undefined, undefined, null]],
      [
        `higher`,
        `installs what it supplies`,
        { action: retry, visible_duration_ms: 500 },
        [`error`, retry, 500, 600],
      ],
    ] as const)(
      `%s-priority repeat %s`,
      (relation, _desc, supplies, [rank, action, budget, deadline]) => {
        const priority = ({ lower: `info`, equal: `warning`, higher: `error` } as const)[
          relation
        ]
        const first = add(create_toast_queue(), `first text`, original).queue
        const { queue } = add(
          first,
          `second text`,
          { priority, dedupe_key: `job`, ...supplies },
          100,
        )

        expect(queue.active_toast?.message).toBe(`second text`)
        expect(queue.active_toast?.priority).toBe(rank)
        expect(queue.active_toast?.action).toEqual(action)
        expect(queue.active_toast?.visible_duration_ms).toBe(budget)
        expect(queue.active_toast?.expires_at_ms).toBe(deadline)
      },
    )

    test(`a repeat that arrives already expired times out rather than lingering`, () => {
      const first = add(create_toast_queue(), `a`, { dedupe_key: `job` }).queue
      const { queue, effects } = add(
        first,
        `a`,
        { dedupe_key: `job`, expires_at_ms: 50 },
        100,
      )

      expect(queue.active_toast).toBeNull()
      expect(effects.map((effect) => effect.reason)).toEqual([`timeout`])
    })
  })

  test(`an already-expired request never reaches the queue`, () => {
    const { queue, effects } = add(create_toast_queue(), `stale`, {
      expires_at_ms: -1,
    })

    expect(queue.active_toast).toBeNull()
    expect(effects.map((effect) => effect.reason)).toEqual([`timeout`])
    expect(queue.next_id).toBe(2) // the id is still spent, so seq stays monotonic
  })

  test(`dismissing an unknown id changes nothing`, () => {
    const queue = add(create_toast_queue(), `a`).queue
    const transition = dismiss_toast(queue, `toast-404`, 0)

    expect(transition.queue).toEqual(queue)
    expect(transition.effects).toEqual([])
  })

  test(`activating an action removes the toast and reports it first`, () => {
    let queue = add(create_toast_queue(), `a`, { action: undo }).queue
    queue = add(queue, `b`, { action: undo }).queue
    const transition = activate_toast_action(queue, `toast-1`, 0)

    expect(transition.effects.map((effect) => effect.reason)).toEqual([`action`])
    expect(transition.effects[0].toast.message).toBe(`a`)
    expect(transition.queue.active_toast?.message).toBe(`b`)

    // a queued toast's action fires too: `show` hands back an id that outlives the wait
    const queued = activate_toast_action(queue, `toast-2`, 0)
    expect(queued.effects[0].toast.message).toBe(`b`)
    expect(queued.queue.active_toast?.message).toBe(`a`)

    // without an action the id is inert — dismiss is the only way out
    const plain = add(create_toast_queue(), `plain`).queue
    expect(activate_toast_action(plain, `toast-1`, 0)).toEqual({
      queue: plain,
      effects: [],
    })
  })

  describe(`custom priority ladder`, () => {
    test(`ranks by the supplied order`, () => {
      let queue = create_toast_queue({ priorities: custom_ladder })
      expect(queue.priorities).toEqual(custom_ladder)

      // each arrival outranks the visible one and pushes it back into the queue
      for (const priority of [`info`, `action`, `watch`] as const) {
        queue = add(queue, priority, { priority }).queue
      }
      expect(queue.active_toast?.message).toBe(`watch`)
      expect(messages(queue.pending)).toEqual([`action`, `info`])

      // and the bottom rung stays at the bottom rather than sinking below nothing
      queue = add(queue, `progress`, { priority: `progress` }).queue
      expect(queue.active_toast?.message).toBe(`watch`)
      expect(messages(queue.pending)).toEqual([`action`, `info`, `progress`])
    })

    test(`unprioritized requests land on default_priority`, () => {
      expect(create_toast_queue().priorities).toEqual(TOAST_PRIORITIES)
      expect(create_toast_queue().default_priority).toBe(`info`)

      // a ladder without an `info` rung has to name its own
      const queue = create_toast_queue({
        priorities: [`low`, `high`],
        default_priority: `low`,
      })
      expect(add(queue, `plain`).queue.active_toast?.priority).toBe(`low`)
    })

    test.each([
      [
        `an unknown priority, which would otherwise rank below everything`,
        () =>
          add<ToastPriority>(create_toast_queue(), `mystery`, {
            // @ts-expect-error off-ladder priorities are a type error first; the throw is
            // the backstop for callers who reach the queue from untyped JS or JSON
            priority: `action`,
          }),
        `Unknown toast priority \`action\`, expected one of [progress, info, success, warning, error]`,
      ],
      [
        `a ladder with no \`info\` rung and no default_priority`,
        () => create_toast_queue({ priorities: [`low`, `high`] }),
        `Toast ladder [low, high] has no \`info\` rung`,
      ],
      [
        `a default_priority off the ladder`,
        () =>
          create_toast_queue({
            priorities: [`low`, `high`],
            // @ts-expect-error NoInfer pins the ladder, so `mid` cannot widen it
            default_priority: `mid`,
          }),
        `Toast default_priority \`mid\` is not in the ladder [low, high]`,
      ],
      [
        `a repeated rung, whose rank would be ambiguous`,
        () => create_toast_queue({ priorities: [`low`, `high`, `low`] }),
        `Toast priority \`low\` is listed twice in [low, high, low]`,
      ],
    ])(`%s is rejected`, (_desc, act, message) => {
      expect(act).toThrow(message)
    })
  })
})

describe(`ToastStore`, () => {
  const stores: ToastStore<string>[] = []
  const track = <Priority extends string>(created: ToastStore<Priority>) => (
    stores.push(created),
    created
  )
  afterEach(() => {
    for (const created of stores.splice(0)) created.destroy()
    vi.useRealTimers()
  })

  test(`show returns an id and exposes active_toast, pending and items`, () => {
    const store = track(new ToastStore())
    const first_id = store.show(`a`)
    store.show(`b`)
    store.show(`c`)

    expect(store.active_toast?.id).toBe(first_id)
    expect(store.active_toast?.seq).toBe(1)
    expect(messages(store.pending)).toEqual([`b`, `c`])
    expect(messages(store.items)).toEqual([`a`, `b`, `c`])

    store.dismiss(first_id)
    expect(store.active_toast?.message).toBe(`b`)
    expect(messages(store.pending)).toEqual([`c`])
  })

  // The top two rungs of whichever ladder the store was built with are sticky; anything
  // below times out on its own. Read off the ladder, so a custom one moves the line.
  test.each([
    [`the default ladder`, {}, `error`, `info`],
    [`a custom ladder`, { priorities: custom_ladder }, `watch`, `action`],
  ] as const)(`stickiness follows %s`, (_desc, options, sticky, fleeting) => {
    fake_clock()
    const store = track(new ToastStore(options))
    store.show(`sticky`, { priority: sticky })
    store.show(`fleeting`, { priority: fleeting })

    expect(store.active_toast?.message).toBe(`sticky`)
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 3)
    expect(messages(store.items)).toEqual([`sticky`, `fleeting`]) // neither clock ran

    store.dismiss(`toast-1`)
    expect(store.active_toast?.message).toBe(`fleeting`)
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS - 1)
    expect(store.active_toast?.message).toBe(`fleeting`)
    vi.advanceTimersByTime(1)
    expect(store.active_toast).toBeNull()
  })

  test(`pause banks the remainder and resume spends exactly that, never more`, () => {
    fake_clock()
    const store = track(new ToastStore())
    store.show(`a`, { duration_ms: 1000 })

    vi.advanceTimersByTime(300)
    store.pause()
    vi.advanceTimersByTime(10_000)
    expect(store.active_toast?.message).toBe(`a`) // paused toasts outlive their duration

    store.resume()
    vi.advanceTimersByTime(699)
    expect(store.active_toast?.message).toBe(`a`)
    vi.advanceTimersByTime(1)
    expect(store.active_toast).toBeNull()

    // resuming one that was never paused is a no-op, not a second full duration
    store.show(`b`, { duration_ms: 1000 })
    vi.advanceTimersByTime(300)
    store.resume()
    vi.advanceTimersByTime(700)
    expect(store.active_toast).toBeNull()
  })

  test.each([
    [`dismiss`, (store: ToastStore) => store.dismiss(`toast-1`)],
    [`action`, (store: ToastStore) => store.run_action(`toast-1`)],
    [`timeout`, () => vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS)],
  ] as const)(`on_close reports reason=%s`, (reason, act) => {
    fake_clock()
    const store = track(new ToastStore())
    const on_close = vi.fn<ToastCloseHandler>()
    const on_click = vi.fn()
    store.show(`a`, { on_close, action: { label: `Undo`, on_click } })

    act(store)

    expect(on_close).toHaveBeenCalledOnce()
    expect(on_close.mock.calls[0][1]).toBe(reason)
    expect(on_click).toHaveBeenCalledTimes(reason === `action` ? 1 : 0)
  })

  test(`an overflowed toast reports on_close too`, () => {
    const store = track(new ToastStore({ max_pending: 1 }))
    const on_close = vi.fn<ToastCloseHandler>()
    store.show(`active`)
    store.show(`kept`)
    store.show(`dropped`, { on_close })

    expect(on_close.mock.calls[0][1]).toBe(`overflow`)
    expect(messages(store.items)).toEqual([`active`, `kept`])
  })

  test(`clear takes a predicate and defaults to everything`, () => {
    const store = track(new ToastStore())
    store.show(`keep`, { priority: `error` })
    store.show(`drop`)

    store.clear((toast) => toast.priority === `info`)
    expect(messages(store.items)).toEqual([`keep`])

    store.clear()
    expect(store.items).toEqual([])
  })

  test(`destroy drops the queue and its timer but keeps the ladder and ids`, () => {
    fake_clock()
    const store = track(new ToastStore({ priorities: custom_ladder }))
    // construction stays inert, which is what makes the module-scoped `toast` safe to
    // import during SSR: nothing is scheduled until something is shown
    expect(vi.getTimerCount()).toBe(0)
    const stale_id = store.show(`a`)
    store.destroy()

    expect(store.items).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(store.priorities).toEqual(custom_ladder)

    // ids stay monotonic across teardown, so a stale one can't hit a fresh toast
    expect(store.show(`b`)).not.toBe(stale_id)
    store.dismiss(stale_id)
    expect(messages(store.items)).toEqual([`b`])
  })
})

describe(`<Toast />`, () => {
  const mounted: Record<string, unknown>[] = []
  const stores: ToastStore<string>[] = []
  const helper_nodes: Element[] = []
  afterEach(() => {
    for (const app of mounted.splice(0)) void unmount(app)
    for (const store of stores.splice(0)) store.destroy()
    for (const node of helper_nodes.splice(0)) node.remove()
    vi.useRealTimers()
  })

  const track = <Priority extends string>(store: ToastStore<Priority>, props = {}) => {
    mounted.push(mount(Toast, { target: document.body, props: { ...props, store } }))
    stores.push(store)
    return store
  }
  const render = (props: Record<string, unknown> = {}) => {
    const { store, ...rest } = props
    return track((store as ToastStore | undefined) ?? new ToastStore(), rest)
  }
  const polite = () => doc_query(`[aria-live="polite"]`)
  const assertive = () => doc_query(`[aria-live="assertive"]`)
  const press_focus_hotkey = () =>
    document.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `t`, altKey: true, bubbles: true }),
    )

  test(`both live regions are mounted before any toast exists`, () => {
    render()

    // a region created together with its first message goes unannounced in several
    // screen readers, so neither may be conditional on there being a toast
    expect(polite().getAttribute(`role`)).toBe(`status`)
    expect(assertive().getAttribute(`role`)).toBe(`alert`)
    // the whole toast is read, not just the changed word
    expect(polite().getAttribute(`aria-atomic`)).toBe(`true`)
    expect(assertive().getAttribute(`aria-atomic`)).toBe(`true`)
    expect(polite().textContent?.trim()).toBe(``)
    expect(document.querySelector(`.toast`)).toBeNull()
  })

  // One non-sticky rung plus both sticky ones: the polite path is shared, but each sticky
  // priority must interrupt on its own or a notice that never leaves can go unread.
  test.each([
    [`info`, `polite`],
    [`warning`, `assertive`],
    [`error`, `assertive`],
  ] as const)(`a %s toast renders into the %s region`, async (priority, region) => {
    const store = render()
    store.show(`hello`, { priority })
    await tick()

    const [used, empty] =
      region === `polite` ? [polite(), assertive()] : [assertive(), polite()]
    expect(used.textContent).toContain(`hello`)
    expect(empty.textContent?.trim()).toBe(``)
    expect(doc_query(`.toast`).dataset.priority).toBe(priority)
  })

  test(`a store built on a custom ladder drives the component`, async () => {
    // mounted with typed props rather than through `render`, so this also pins that a
    // narrowly-typed ToastStore is accepted where the component declares any ladder
    const store = track(new ToastStore({ priorities: custom_ladder }))
    store.show(`watching src/`, { priority: `watch` })
    await tick()

    expect(doc_query(`.toast`).dataset.priority).toBe(`watch`)
    // `watch` is the ladder's second-highest rung, so it is sticky — and urgency has to
    // agree with that: announcing it politely would let a notice that never leaves the
    // screen go unread. Both rules read the top two off the store's own ladder.
    expect(assertive().textContent).toContain(`watching src/`)
    expect(polite().textContent).not.toContain(`watching src/`)
  })

  test(`a custom sticky_priorities decides urgency too`, async () => {
    // `action` is sticky here but not one of the ladder's top two, so the two rules only
    // agree if urgency reads the store's sticky set rather than recomputing slice(-2)
    const store = track(
      new ToastStore({ priorities: custom_ladder, sticky_priorities: [`action`] }),
    )
    store.show(`rebase needed`, { priority: `action` })
    await tick()

    expect(assertive().textContent).toContain(`rebase needed`)
    expect(polite().textContent).not.toContain(`rebase needed`)
  })

  test(`the waiting count is rendered with a spelled-out label`, async () => {
    const store = render()
    store.show(`a`)
    store.show(`b`)
    await tick()

    // the badge itself is hidden: aria-atomic reads the whole card, so an aria-label on
    // the badge would splice its wording into the message instead of adding to it
    const badge = doc_query(`.toast-pending`)
    expect(badge.getAttribute(`aria-hidden`)).toBe(`true`)
    expect(badge.getAttribute(`aria-label`)).toBeNull()
    expect(badge.textContent).toBe(`+1`)
    expect(doc_query(`.toast .sr-only`).textContent?.trim()).toBe(
      `1 more notification pending`,
    )

    store.show(`c`)
    await tick()
    expect(doc_query(`.toast-pending`).textContent).toBe(`+2`)
    expect(doc_query(`.toast .sr-only`).textContent?.trim()).toBe(
      `2 more notifications pending`,
    )
  })

  test(`the action button runs the action and closes the toast`, async () => {
    const store = render()
    const on_click = vi.fn()
    store.show(`deleted`, { action: { label: `Undo`, on_click } })
    await tick()

    const button = doc_query<HTMLButtonElement>(`.toast-action`)
    expect(button.textContent?.trim()).toBe(`Undo`)
    button.click()
    await tick()

    expect(on_click).toHaveBeenCalledOnce()
    expect(store.active_toast).toBeNull()
    expect(document.querySelector(`.toast`)).toBeNull()
  })

  test(`the dismiss button is labeled and removes the toast`, async () => {
    const store = render({ dismiss_label: `Close` })
    store.show(`a`)
    await tick()

    const button = doc_query<HTMLButtonElement>(`.toast-dismiss`)
    expect(button.getAttribute(`aria-label`)).toBe(`Close`)
    button.click()
    await tick()
    expect(store.active_toast).toBeNull()
  })

  // removing the focused button fires no focusout, so the focus pause must be re-derived
  // or the promoted toast would sit paused until the pointer or keyboard came back
  test(`dismissing a focused toast does not leave the next one paused`, async () => {
    fake_clock()
    const store = render()
    store.show(`a`, { duration_ms: 1000 })
    store.show(`b`, { duration_ms: 1000 })
    await tick()

    const button = doc_query<HTMLButtonElement>(`.toast-dismiss`)
    button.focus()
    button.click()
    await tick()
    expect(store.active_toast?.message).toBe(`b`)
    expect(document.activeElement).toBe(document.body)

    vi.advanceTimersByTime(1500)
    expect(store.active_toast).toBeNull()
  })

  test(`a children snippet replaces the message markup`, async () => {
    const children = createRawSnippet<[ToastItem]>((item) => ({
      render: () => `<em class="custom">${item().message}!</em>`,
    }))
    const store = render({ children })
    store.show(`hi`)
    await tick()

    expect(doc_query(`.custom`).textContent).toBe(`hi!`)
    expect(document.querySelector(`.toast-message`)).toBeNull()
  })

  test(`consumer attributes survive alongside the component's own`, async () => {
    fake_clock()
    const onpointerenter = vi.fn()
    // Svelte 5 accepts objects and arrays here; interpolating `class` into a string
    // instead of merging the ClassValue flattens this one to `[object Object]`
    const consumer_class = [`mine`, { flagged: true }]
    // position is a data attribute so consumers can restyle placement in CSS without the
    // component writing inline styles they can't beat
    const store = render({
      class: consumer_class,
      id: `notifications`,
      position: `top-center`,
      onpointerenter,
    })

    const stack = doc_query(`.toast-stack`)
    expect(stack.id).toBe(`notifications`)
    expect(stack.dataset.position).toBe(`top-center`)
    const classes = [...stack.classList].filter((name) => !name.startsWith(`svelte-`))
    expect(classes.toSorted()).toEqual([`flagged`, `mine`, `toast-stack`])

    // the spread lands before our own pointer handlers, so without chaining theirs is
    // dropped — and ours must still pause the countdown
    store.show(`a`, { duration_ms: 1000 })
    await tick()
    stack.dispatchEvent(new PointerEvent(`pointerenter`))
    expect(onpointerenter).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(5000)
    expect(store.active_toast?.message).toBe(`a`)
  })

  // Suspensions bank the unspent remainder rather than restarting the clock. Focus pauses
  // on its own; hover is policy (`pause_on_hover`) applied on top of pointer state.
  test.each([
    [
      `hovering the stack suspends the countdown`,
      {},
      `pointerenter`,
      `pointerleave`,
      true,
    ],
    [
      `focus suspends even with pause_on_hover off`,
      { pause_on_hover: false },
      `focusin`,
      `focusout`,
      true,
    ],
    [
      `hovering with pause_on_hover off leaves the clock running`,
      { pause_on_hover: false },
      `pointerenter`,
      `pointerleave`,
      false,
    ],
  ] as const)(`%s`, async (_desc, props, suspend, release, suspends) => {
    fake_clock()
    const store = render(props)
    store.show(`a`, { duration_ms: 1000, action: { label: `Undo` } })
    await tick()

    const stack = doc_query(`.toast-stack`)
    const fire = (type: string) =>
      stack.dispatchEvent(
        type.startsWith(`focus`)
          ? new FocusEvent(type, { bubbles: true })
          : new PointerEvent(type),
      )

    vi.advanceTimersByTime(400)
    fire(suspend)
    if (!suspends) {
      vi.advanceTimersByTime(600)
      expect(store.active_toast).toBeNull()
      return
    }
    vi.advanceTimersByTime(5000)
    expect(store.active_toast?.message).toBe(`a`)

    fire(release)
    vi.advanceTimersByTime(599)
    expect(store.active_toast?.message).toBe(`a`) // 600 ms was left, not a fresh 1000
    vi.advanceTimersByTime(1)
    expect(store.active_toast).toBeNull()
  })

  test(`a toast promoted under the pointer starts out paused`, async () => {
    fake_clock()
    const store = render()
    store.show(`first`, { duration_ms: 1000 })
    await tick()
    doc_query(`.toast-stack`).dispatchEvent(new PointerEvent(`pointerenter`))

    store.show(`urgent`, { priority: `error` })
    store.dismiss(`toast-2`) // back to `first`, promoted with the pointer never moving
    await tick()

    expect(store.active_toast?.message).toBe(`first`)
    vi.advanceTimersByTime(5000)
    expect(store.active_toast?.message).toBe(`first`)
  })

  test.each([
    [
      `moves the keyboard to the toast's first control`,
      {},
      { action: { label: `Undo` } },
    ],
    // nothing focusable in the card, so the hotkey leaves the keyboard where it is
    [`is inert when the toast has no controls`, { dismissible: false }, {}],
  ] as const)(`the focus hotkey %s`, async (_desc, props, request) => {
    const store = render(props)
    store.show(`a`, request)
    await tick()
    const before = document.activeElement
    const target = document.querySelector(`.toast-action`)

    press_focus_hotkey()
    expect(document.activeElement).toBe(target ?? before)
  })

  // every route out of the toast unmounts the button holding focus, so each one has to
  // hand the user's place back rather than dropping it on <body> — unless the user got
  // there first, when reclaiming the origin would yank them out of where they went
  test.each<[string, (store: ToastStore) => void, boolean?]>([
    [`the action button`, () => doc_query<HTMLButtonElement>(`.toast-action`).click()],
    [`the dismiss button`, () => doc_query<HTMLButtonElement>(`.toast-dismiss`).click()],
    [`Escape`, () => doc_query(`.toast-dismiss`).dispatchEvent(escape_key())],
    // no click to hang the restore off: the queue empties from under the toast
    [`a store-driven clear`, (store: ToastStore) => store.clear()],
    [`a clear after the user tabbed away`, (store: ToastStore) => store.clear(), true],
  ])(`%s leaves focus where the user expects it`, async (_label, close, moved_on) => {
    const opener = document.createElement(`button`)
    const elsewhere = document.createElement(`button`)
    document.body.append(opener, elsewhere)
    helper_nodes.push(opener, elsewhere)
    const store = render()
    store.show(`a`, { action: { label: `Undo` } })
    await tick()

    opener.focus()
    press_focus_hotkey()
    expect(document.activeElement).not.toBe(opener)
    if (moved_on) elsewhere.focus()

    close(store)
    await tick()
    await tick() // restore_focus waits a tick for the toast to leave the DOM

    expect(store.active_toast).toBeNull()
    expect(document.activeElement).toBe(moved_on ? elsewhere : opener)
  })

  // Escape is scoped to the stack, so a press anywhere else on the page is none of the
  // toast's business, and gated on `dismissible` — with no close button rendered it
  // would otherwise be the one way left to shut a toast declared undismissable.
  test.each([
    [true, undefined],
    [false, `a`],
  ] as const)(
    `Escape inside the toast dismisses when dismissible=%s`,
    async (dismissible, left_on_screen) => {
      const store = render({ dismissible })
      store.show(`a`)
      await tick()

      document.body.dispatchEvent(escape_key())
      await tick()
      expect(store.active_toast?.message).toBe(`a`)

      doc_query(`.toast`).dispatchEvent(escape_key())
      await tick()
      expect(store.active_toast?.message).toBe(left_on_screen)
    },
  )

  // Reactive props rather than `track`: the pointer is already inside the stack when the
  // flag flips, so the pause has to come from the prop change and not a fresh pointerenter
  test(`flipping pause_on_hover acts on an already-hovered stack`, async () => {
    fake_clock()
    const store = new ToastStore()
    const props = $state({ store, pause_on_hover: false })
    mounted.push(mount(Toast, { target: document.body, props }))
    stores.push(store)
    store.show(`a`, { duration_ms: 1000 })
    await tick()
    vi.advanceTimersByTime(400)
    doc_query(`.toast-stack`).dispatchEvent(new PointerEvent(`pointerenter`))

    props.pause_on_hover = true
    await tick()
    vi.advanceTimersByTime(5000)
    expect(store.active_toast?.message).toBe(`a`) // paused without the pointer re-entering

    props.pause_on_hover = false
    await tick()
    vi.advanceTimersByTime(599)
    expect(store.active_toast?.message).toBe(`a`) // 600 ms was banked at the flip, not a fresh 1000
    vi.advanceTimersByTime(1)
    expect(store.active_toast).toBeNull()
  })
})
