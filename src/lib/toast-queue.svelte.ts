// Toast notifications: a pure queue reducer plus the reactive store Toast.svelte reads.
// Only one toast is visible at a time; the rest wait their turn ranked by priority, so a
// burst of notices cannot bury the one that matters or scroll past before it is read.

export const TOAST_PRIORITIES = [
  `progress`,
  `info`,
  `success`,
  `warning`,
  `error`,
] as const

export type ToastPriority = (typeof TOAST_PRIORITIES)[number]
export type ToastLifecycleReason = `action` | `dismiss` | `overflow` | `timeout`
export type ToastPosition =
  | `top-left`
  | `top-center`
  | `top-right`
  | `bottom-left`
  | `bottom-center`
  | `bottom-right`

// Rank is array position: a later priority outranks an earlier one and preempts it. The
// ladder is per queue and every type here is generic over it, so a consumer can name
// their own tiers and still have them type-check. An unlisted name would rank -1, below
// every real tier, silently inverting the queue — a bug to surface, not a lowest rung.
const priority_rank = <Priority extends string>(
  priorities: readonly Priority[],
  priority: Priority,
): number => {
  const rank = priorities.indexOf(priority)
  if (rank === -1) {
    const ladder = priorities.join(`, `)
    throw new Error(`Unknown toast priority \`${priority}\`, expected one of [${ladder}]`)
  }
  return rank
}

// Soft cap on waiting toasts. Soft because an unactioned action is never dropped.
const DEFAULT_MAX_PENDING = 3
export const DEFAULT_TOAST_DURATION_MS = 5000
// Where a request that names no priority lands, on any ladder that has this rung
const DEFAULT_TOAST_PRIORITY = `info`

// Both callbacks take the widened item rather than the queue's own ladder, which keeps
// ToastItem covariant in its priority type: a parameter typed to the narrow ladder makes
// ToastItem<'watch' | ...> unassignable to ToastItem<string> and would pin <Toast /> and
// every other consumer of a toast to a single ladder.
export interface ToastAction {
  label: string
  on_click?: (toast: ToastItem<string>) => void
}

export type ToastCloseHandler = (
  toast: ToastItem<string>,
  reason: ToastLifecycleReason,
) => void

export interface ToastRequest<Priority extends string = ToastPriority> {
  message: string
  priority?: Priority
  // Absolute wall-clock deadline. Keeps counting down while the toast waits its turn,
  // for notices that go stale on their own schedule rather than after N seconds seen.
  expires_at_ms?: number | null
  // Visible-only budget; pauses on demotion and overrides expires_at_ms when both are set.
  visible_duration_ms?: number
  // Repeats of the same key update the existing toast instead of queueing behind it.
  // Defaults to the message, so identical text collapses without any bookkeeping.
  dedupe_key?: string
  action?: ToastAction
  on_close?: ToastCloseHandler
}

export interface ToastItem<Priority extends string = ToastPriority> {
  id: string
  // Insertion order, breaking ties between toasts created in the same millisecond
  seq: number
  message: string
  priority: Priority
  created_at_ms: number
  expires_at_ms: number | null
  visible_duration_ms?: number
  dedupe_key: string
  action?: ToastAction
  on_close?: ToastCloseHandler
}

export interface ToastQueue<Priority extends string = ToastPriority> {
  active_toast: ToastItem<Priority> | null
  pending: readonly ToastItem<Priority>[]
  next_id: number
  max_pending: number
  // Carried on the queue rather than passed to each call, so every transition ranks by
  // the same ladder and a queue stays self-describing when handed around.
  priorities: readonly Priority[]
  default_priority: Priority
}

export interface ToastQueueOptions<Priority extends string = ToastPriority> {
  max_pending?: number
  // Ordered lowest rank first. Defaults to TOAST_PRIORITIES.
  priorities?: readonly Priority[]
  // NoInfer so a stray name is rejected against the ladder instead of widening it
  default_priority?: NoInfer<Priority>
}

export interface ToastLifecycleEffect<Priority extends string = ToastPriority> {
  reason: ToastLifecycleReason
  toast: ToastItem<Priority>
}

export interface ToastQueueTransition<Priority extends string = ToastPriority> {
  queue: ToastQueue<Priority>
  effects: readonly ToastLifecycleEffect<Priority>[]
}

export interface EnqueueToastTransition<
  Priority extends string = ToastPriority,
> extends ToastQueueTransition<Priority> {
  toast_id: string
  deduplicated: boolean
}

const is_expired = (toast: ToastItem<string>, now_ms: number): boolean =>
  toast.expires_at_ms !== null && toast.expires_at_ms <= now_ms

const queued_toasts = <Priority extends string>(queue: ToastQueue<Priority>) =>
  queue.active_toast ? [queue.active_toast, ...queue.pending] : queue.pending

// Bank the unspent part of a visibility budget. A toast pushed back into the queue has
// not been read, so its clock stops until it is on screen again.
const pause_visibility_timeout = <Priority extends string>(
  toast: ToastItem<Priority>,
  now_ms: number,
): ToastItem<Priority> =>
  toast.visible_duration_ms === undefined
    ? toast
    : {
        ...toast,
        expires_at_ms: null,
        visible_duration_ms:
          toast.expires_at_ms === null
            ? toast.visible_duration_ms
            : Math.max(0, toast.expires_at_ms - now_ms),
      }

// A budget beats a deadline (see ToastRequest.visible_duration_ms), so a queued toast
// carrying both stops running its wall clock. The budget itself is untouched: nothing has
// been spent yet, and banking here would mistake the caller's deadline for one this queue
// had derived and adopt the distance to it as the budget.
const drop_unseen_deadline = <Priority extends string>(
  toast: ToastItem<Priority>,
): ToastItem<Priority> =>
  toast.visible_duration_ms === undefined || toast.expires_at_ms === null
    ? toast
    : { ...toast, expires_at_ms: null }

const start_visibility_timeout = <Priority extends string>(
  toast: ToastItem<Priority>,
  now_ms: number,
): ToastItem<Priority> =>
  toast.visible_duration_ms === undefined
    ? toast
    : { ...toast, expires_at_ms: now_ms + toast.visible_duration_ms }

const rebalance_queue = <Priority extends string>(
  queue: ToastQueue<Priority>,
  now_ms: number,
): ToastQueueTransition<Priority> => {
  let { active_toast } = queue
  const rank = (toast: ToastItem<Priority>) =>
    priority_rank(queue.priorities, toast.priority)
  const highest_first = (left: ToastItem<Priority>, right: ToastItem<Priority>) =>
    rank(right) - rank(left) ||
    left.created_at_ms - right.created_at_ms ||
    left.seq - right.seq
  const pending = queue.pending.map(drop_unseen_deadline)
  pending.sort(highest_first)
  if (!active_toast) {
    const promoted = pending.shift()
    active_toast = promoted ? start_visibility_timeout(promoted, now_ms) : null
  } else if (pending[0] && rank(pending[0]) > rank(active_toast)) {
    const [next_up] = pending.splice(0, 1)
    pending.push(pause_visibility_timeout(active_toast, now_ms))
    pending.sort(highest_first)
    active_toast = start_visibility_timeout(next_up, now_ms)
  }

  const overflow: ToastItem<Priority>[] = []
  while (pending.length > queue.max_pending) {
    // An unseen action must remain available even if actions temporarily push
    // the queue above the soft cap; only non-destructive notices may overflow.
    const overflow_idx = pending.findLastIndex((toast) => !toast.action)
    if (overflow_idx === -1) break
    overflow.push(...pending.splice(overflow_idx, 1))
  }
  return {
    queue: { ...queue, active_toast, pending },
    effects: overflow.map((toast) => ({ reason: `overflow`, toast })),
  }
}

const remove_toast = <Priority extends string>(
  queue: ToastQueue<Priority>,
  toast_id: string,
  now_ms: number,
): [ToastQueue<Priority>, ToastItem<Priority> | null] => {
  const { active_toast } = queue
  if (active_toast?.id === toast_id) {
    return [rebalance_queue({ ...queue, active_toast: null }, now_ms).queue, active_toast]
  }
  const pending_idx = queue.pending.findIndex((toast) => toast.id === toast_id)
  if (pending_idx === -1) return [queue, null]
  const pending = [...queue.pending]
  const [toast] = pending.splice(pending_idx, 1)
  return [{ ...queue, pending }, toast]
}

export const create_toast_queue = <const Priority extends string = ToastPriority>(
  options: ToastQueueOptions<Priority> = {},
): ToastQueue<Priority> => {
  const { max_pending = DEFAULT_MAX_PENDING } = options
  // Priority defaults to exactly the element type of TOAST_PRIORITIES, but that
  // correlation is invisible from inside a generic body, hence the widen-then-narrow
  const priorities: readonly Priority[] =
    options.priorities ?? (TOAST_PRIORITIES as readonly string[] as readonly Priority[])
  const ladder = priorities.join(`, `)
  const duplicate = priorities.find((entry, idx) => priorities.indexOf(entry) !== idx)
  if (duplicate !== undefined) {
    throw new Error(`Toast priority \`${duplicate}\` is listed twice in [${ladder}]`)
  }
  const default_priority =
    options.default_priority ??
    priorities.find((entry) => entry === DEFAULT_TOAST_PRIORITY)
  if (default_priority === undefined) {
    throw new Error(
      `Toast ladder [${ladder}] has no \`${DEFAULT_TOAST_PRIORITY}\` rung, so create_toast_queue needs an explicit default_priority`,
    )
  }
  if (!priorities.includes(default_priority)) {
    throw new Error(
      `Toast default_priority \`${default_priority}\` is not in the ladder [${ladder}]`,
    )
  }
  return {
    active_toast: null,
    pending: [],
    next_id: 1,
    max_pending,
    priorities,
    default_priority,
  }
}

export const expire_toasts = <Priority extends string>(
  queue: ToastQueue<Priority>,
  now_ms: number,
): ToastQueueTransition<Priority> => {
  const expired = queued_toasts(queue).filter((toast) => is_expired(toast, now_ms))
  if (expired.length === 0) return { queue, effects: [] }

  const active_toast =
    queue.active_toast && !is_expired(queue.active_toast, now_ms)
      ? queue.active_toast
      : null
  const pending = queue.pending.filter((toast) => !is_expired(toast, now_ms))
  return {
    queue: rebalance_queue({ ...queue, active_toast, pending }, now_ms).queue,
    effects: expired.map((toast) => ({ reason: `timeout`, toast })),
  }
}

export const enqueue_toast = <Priority extends string>(
  queue: ToastQueue<Priority>,
  // NoInfer so the queue's ladder types the request rather than the request widening
  // the ladder, which would let an off-ladder priority past the compiler
  request: ToastRequest<NoInfer<Priority>>,
  now_ms: number,
): EnqueueToastTransition<Priority> => {
  const expired_transition = expire_toasts(queue, now_ms)
  queue = expired_transition.queue
  const effects = [...expired_transition.effects]
  const priority = request.priority ?? queue.default_priority
  // Rank eagerly: a lone toast is promoted without ever being compared, so an unknown
  // priority would otherwise sit in the queue until a second toast exposed it.
  const rank = priority_rank(queue.priorities, priority)
  const expires_at_ms = request.expires_at_ms ?? null
  const dedupe_key = request.dedupe_key ?? request.message
  const existing = queued_toasts(queue).find((toast) => toast.dedupe_key === dedupe_key)

  if (existing) {
    const existing_rank = priority_rank(queue.priorities, existing.priority)
    const request_is_lower_priority = rank < existing_rank
    // An equal-priority repeat escalates nothing, so an omitted field means "leave this
    // as it was" rather than "clear it" — a plain repeat of a toast carrying a duration
    // used to wipe it and strand the toast on screen for good. Only a louder repeat
    // replaces the original's timing and action outright.
    const carried: Partial<ToastItem<Priority>> = rank === existing_rank ? existing : {}

    // A lower-priority repeat only refreshes the text; the higher-priority
    // original keeps its priority, timing, and action.
    const updated: ToastItem<Priority> = request_is_lower_priority
      ? { ...existing, message: request.message }
      : {
          ...existing,
          message: request.message,
          priority,
          expires_at_ms: expires_at_ms ?? carried.expires_at_ms ?? null,
          action: request.action ?? carried.action,
          visible_duration_ms: request.visible_duration_ms ?? carried.visible_duration_ms,
          on_close: request.on_close ?? carried.on_close,
        }
    let transition: ToastQueueTransition<Priority>
    if (is_expired(updated, now_ms)) {
      const [without_existing] = remove_toast(queue, existing.id, now_ms)
      transition = {
        queue: without_existing,
        effects: [{ reason: `timeout`, toast: updated }],
      }
    } else if (queue.active_toast?.id === existing.id) {
      const active_toast = request_is_lower_priority
        ? updated
        : start_visibility_timeout(updated, now_ms)
      transition = { queue: { ...queue, active_toast }, effects: [] }
    } else {
      const pending = queue.pending.map((toast) =>
        toast.id === existing.id ? updated : toast,
      )
      transition = rebalance_queue({ ...queue, pending }, now_ms)
    }
    return {
      queue: transition.queue,
      effects: [...effects, ...transition.effects],
      toast_id: existing.id,
      deduplicated: true,
    }
  }

  const toast: ToastItem<Priority> = {
    id: `toast-${queue.next_id}`,
    seq: queue.next_id,
    message: request.message,
    priority,
    created_at_ms: now_ms,
    expires_at_ms,
    visible_duration_ms: request.visible_duration_ms,
    dedupe_key,
    action: request.action,
    on_close: request.on_close,
  }
  const next_id = queue.next_id + 1
  const transition: ToastQueueTransition<Priority> = is_expired(toast, now_ms)
    ? { queue: { ...queue, next_id }, effects: [{ reason: `timeout`, toast }] }
    : rebalance_queue({ ...queue, next_id, pending: [...queue.pending, toast] }, now_ms)
  return {
    queue: transition.queue,
    effects: [...effects, ...transition.effects],
    toast_id: toast.id,
    deduplicated: false,
  }
}

export const dismiss_toast = <Priority extends string>(
  queue: ToastQueue<Priority>,
  toast_id: string,
  now_ms: number,
): ToastQueueTransition<Priority> => {
  const expired_transition = expire_toasts(queue, now_ms)
  const [next_queue, dismissed] = remove_toast(expired_transition.queue, toast_id, now_ms)
  return {
    queue: next_queue,
    effects: dismissed
      ? [...expired_transition.effects, { reason: `dismiss`, toast: dismissed }]
      : expired_transition.effects,
  }
}

export const activate_toast_action = <Priority extends string>(
  queue: ToastQueue<Priority>,
  toast_id: string,
  now_ms: number,
): ToastQueueTransition<Priority> => {
  // A click already dispatched by the browser wins over a delayed expiry
  // timer. Remove the target first, then expire unrelated queue items.
  const toast = queued_toasts(queue).find((item) => item.id === toast_id)
  if (!toast?.action) return expire_toasts(queue, now_ms)
  const [without_target] = remove_toast(queue, toast_id, now_ms)
  const expired_transition = expire_toasts(without_target, now_ms)
  return {
    queue: expired_transition.queue,
    effects: [{ reason: `action`, toast }, ...expired_transition.effects],
  }
}

// === Reactive store ===

export type ToastOptions<Priority extends string = ToastPriority> = Omit<
  ToastRequest<Priority>,
  `message` | `visible_duration_ms`
> & {
  // Counts only while the toast is on screen, so a hover or a higher-priority
  // interruption does not eat the reading time. `null` stays up until dismissed.
  duration_ms?: number | null
}

export interface ToastStoreOptions<
  Priority extends string = ToastPriority,
> extends ToastQueueOptions<Priority> {
  duration_ms?: number
  // Priorities that stay up until dismissed. Defaults to the ladder's top two.
  // NoInfer for the same reason default_priority has it: without it a typo here widens
  // the ladder instead of failing, and the toast just never becomes sticky
  sticky_priorities?: readonly NoInfer<Priority>[]
}

export class ToastStore<Priority extends string = ToastPriority> {
  #queue: ToastQueue<Priority>
  #timer: ReturnType<typeof setTimeout> | undefined
  readonly #default_duration_ms: number
  readonly #sticky_priorities: readonly Priority[]

  constructor(options: ToastStoreOptions<Priority> = {}) {
    this.#queue = $state.raw(create_toast_queue<Priority>(options))
    this.#default_duration_ms = options.duration_ms ?? DEFAULT_TOAST_DURATION_MS
    // a warning or error the user never saw is a bug report waiting to happen, so the
    // ladder's top two stay up until dismissed while the lower ones time out
    this.#sticky_priorities =
      options.sticky_priorities ?? this.#queue.priorities.slice(-2)
  }

  get active_toast(): ToastItem<Priority> | null {
    return this.#queue.active_toast
  }
  get pending(): readonly ToastItem<Priority>[] {
    return this.#queue.pending
  }
  // The ladder this store ranks by, lowest first
  get priorities(): readonly Priority[] {
    return this.#queue.priorities
  }
  // The rungs that stay up until dismissed, so `<Toast assertive={...} />` can be pointed
  // at them: a toast held on screen while announced politely defeats both rules
  get sticky_priorities(): readonly Priority[] {
    return this.#sticky_priorities
  }
  // Everything the queue is holding, visible one first
  get items(): readonly ToastItem<Priority>[] {
    return queued_toasts(this.#queue)
  }

  show(message: string, options: ToastOptions<Priority> = {}): string {
    const { duration_ms, priority = this.#queue.default_priority, ...request } = options
    const default_duration_ms = this.#sticky_priorities.includes(priority)
      ? null
      : this.#default_duration_ms
    // `null` is a deliberate "stays until dismissed", so ?? would read it as absent
    const resolved_duration_ms =
      duration_ms === undefined ? default_duration_ms : duration_ms
    const transition = enqueue_toast(
      this.#queue,
      {
        ...request,
        message,
        priority,
        visible_duration_ms: resolved_duration_ms ?? undefined,
      },
      Date.now(),
    )
    this.#apply(transition)
    return transition.toast_id
  }

  dismiss(toast_id: string): void {
    this.#apply(dismiss_toast(this.#queue, toast_id, Date.now()))
  }

  run_action(toast_id: string): void {
    this.#apply(activate_toast_action(this.#queue, toast_id, Date.now()))
  }

  // Dismisses everything matching, defaulting to the whole queue
  clear(predicate: (toast: ToastItem<Priority>) => boolean = () => true): void {
    const now_ms = Date.now()
    let queue = this.#queue
    const effects: ToastLifecycleEffect<Priority>[] = []
    for (const { id } of this.items.filter(predicate)) {
      const transition = dismiss_toast(queue, id, now_ms)
      queue = transition.queue
      effects.push(...transition.effects)
    }
    this.#apply({ queue, effects })
  }

  // WCAG 2.2.1: an auto-dismissing message must stop counting down while the user is
  // reading it or reaching for its button. Only the visible toast has a running clock.
  pause(): void {
    const { active_toast } = this.#queue
    // a null deadline means already paused, or never counting in the first place
    if (!active_toast || active_toast.expires_at_ms === null) return
    const paused = pause_visibility_timeout(active_toast, Date.now())
    if (paused === active_toast) return // an absolute deadline has no budget to bank
    this.#apply({ queue: { ...this.#queue, active_toast: paused }, effects: [] })
  }

  resume(): void {
    const { active_toast } = this.#queue
    // Nothing to resume unless a toast is actually paused: resuming a running one
    // would hand it a second full duration rather than the remainder it had left.
    if (active_toast?.expires_at_ms !== null) return
    const resumed = start_visibility_timeout(active_toast, Date.now())
    if (resumed === active_toast) return
    this.#apply({ queue: { ...this.#queue, active_toast: resumed }, effects: [] })
  }

  // Drops the pending timer and every toast without firing on_close, for teardown
  // between tests or routes; clear() first if a consumer relies on on_close. The id
  // counter carries over, so an id held from before teardown cannot address a toast
  // shown after it.
  destroy(): void {
    clearTimeout(this.#timer)
    this.#queue = { ...this.#queue, active_toast: null, pending: [] }
  }

  #apply(transition: ToastQueueTransition<Priority>): void {
    this.#queue = transition.queue
    this.#schedule()
    // Dispatched after the queue is committed so a handler that enqueues a follow-up
    // toast sees the state its own toast left behind.
    for (const { toast, reason } of transition.effects) {
      if (reason === `action`) toast.action?.on_click?.(toast)
      toast.on_close?.(toast, reason)
    }
  }

  #schedule(): void {
    clearTimeout(this.#timer)
    const deadlines = this.items
      .map((toast) => toast.expires_at_ms)
      .filter((deadline) => typeof deadline === `number`)
    if (deadlines.length === 0) return
    const delay_ms = Math.max(0, Math.min(...deadlines) - Date.now())
    this.#timer = setTimeout(
      () => this.#apply(expire_toasts(this.#queue, Date.now())),
      delay_ms,
    )
  }
}

// Default store, so `toast.show(...)` works from anywhere without threading an instance
// through props. Pass your own to <Toast store={...} /> when a page needs its own queue.
//
// Client-only. Importing it is inert — nothing is queued and no timer runs until a toast
// is shown — but module scope on a server is per-process, not per-request, so a toast
// shown during SSR would render into other users' responses and count down against a
// queue they share. Show toasts from event handlers or onMount, or give the server
// request its own `new ToastStore()`.
export const toast = new ToastStore()
