## Toast

Notifications backed by a queue rather than a list. One toast is visible at a time and
the rest wait their turn, ranked by priority, so a burst of notices can neither bury the
one that matters nor scroll past before it has been read.

The queue is a pure reducer — `enqueue_toast`, `dismiss_toast`, `expire_toasts`,
`activate_toast_action` — and `ToastStore` is the reactive wrapper around it that owns
the expiry timer. `toast` is a ready-made store, so `toast.show('Saved')` works from
anywhere; pass `store` to `<Toast />` when a page wants its own queue. The reducer stands
on its own — every function takes a queue and returns the next one plus the lifecycle
effects it produced — so an app that wants its own timers and rendering can hold the
queue in `$state.raw` and drive it directly.

### Priorities

`progress`, `info`, `success`, `warning`, `error`, ranked in that order. A higher-ranked
arrival preempts the visible toast and pushes it back into the queue with its remaining
reading time banked, so an interrupted notice resumes rather than restarting or being
cut short. `warning` and `error` stay up until dismissed; the rest time out after five
seconds.

```svelte example id="toast-priorities"
<script lang="ts">
  import Toast from '$lib/Toast.svelte'
  import { TOAST_PRIORITIES, ToastStore } from '$lib/toast-queue.svelte.ts'

  const store = new ToastStore()
</script>

<div style="display: flex; gap: 6pt; flex-wrap: wrap">
  {#each TOAST_PRIORITIES as priority (priority)}
    <button onclick={() => store.show(`A ${priority} notification`, { priority })}>
      {priority}
    </button>
  {/each}
  <button onclick={() => store.clear()}>clear</button>
</div>

<Toast {store} />
```

### A ladder of your own

Those five are only the default. Rank is array position, so pass your own ordered list as
`priorities` to `create_toast_queue` or `ToastStore` and the types follow from it: `show`
accepts exactly the names you listed, and an unrecognized one throws rather than ranking
below every real tier, which is how a stray name silently inverts a queue. Requests that
name no priority land on `default_priority` — `info` where the ladder has that rung,
required where it does not — and the top two rungs stay up until dismissed unless
`sticky_priorities` says otherwise. The accent stripe is keyed off `data-priority`, so
custom tiers can be colored from your own CSS:

```ts
const store = new ToastStore({
  priorities: [`progress`, `info`, `action`, `watch`, `error`],
})
store.show(`Watching for changes`, { priority: `watch` })
```

### Actions, dedupe and overflow

A toast can carry a single button. Because dismissing one is easy to do by accident, a
toast whose action nobody has taken is exempt from the overflow cap: press _spam_ below
and the plain notices are dropped from the queue while the undo survives.

Repeats collapse: a second toast with the same `dedupe_key` (defaulting to the message)
updates the one already queued instead of lining up behind it. A lower-priority repeat
refreshes only the text, leaving the original's priority, timing and action alone.

```svelte example id="toast-actions"
<script lang="ts">
  import Toast from '$lib/Toast.svelte'
  import { ToastStore } from '$lib/toast-queue.svelte.ts'

  const store = new ToastStore()
  let log = $state<string[]>([])
  const record = (entry: string) => (log = [entry, ...log].slice(0, 5))

  const show_undo = () =>
    store.show(`Deleted "notes.md"`, {
      dedupe_key: `delete-${Math.random()}`,
      duration_ms: null,
      action: { label: `Undo`, on_click: () => record(`undo pressed`) },
      on_close: (toast, reason) => record(`${reason}: ${toast.message}`),
    })
  const spam = () => {
    for (const idx of [1, 2, 3, 4, 5]) {
      store.show(`Background job ${idx} finished`, {
        priority: `success`,
        duration_ms: null,
        on_close: (toast, reason) => record(`${reason}: ${toast.message}`),
      })
    }
  }
</script>

<div style="display: flex; gap: 6pt; flex-wrap: wrap">
  <button onclick={show_undo}>delete a file</button>
  <button onclick={spam}>spam 5 notices</button>
  <button onclick={() => store.show(`Still saving…`, { priority: `progress` })}>
    repeat (deduped)
  </button>
  <button onclick={() => store.clear()}>clear</button>
</div>

<ol>
  {#each log as entry, idx (idx)}<li><code>{entry}</code></li>{/each}
</ol>

<Toast {store} position="top-center" />
```

### Accessibility

Both live regions are mounted up front and stay in the DOM — a region created at the
same moment as its first message goes unannounced in several screen readers. `warning`
and `error` land in the assertive region, everything else in the polite one, rather than
flipping `aria-live` on a single region mid-flight, which is just as unreliable.

The countdown suspends while the pointer is over the stack or the keyboard is inside it,
so reaching for the action button cannot make it disappear ([WCAG 2.2.1][wcag-timing]).
<kbd>Alt</kbd>+<kbd>T</kbd> moves focus to the toast's first control from anywhere on the
page, and <kbd>Escape</kbd> dismisses — but only once focus is already inside, so it
never fights a dialog for the same key.

[wcag-timing]: https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable

### Styling

`position` takes any of `top`/`bottom` × `left`/`center`/`right`. Everything else is a
CSS custom property: `--toast-inset`, `--toast-bg`, `--toast-color`, `--toast-border`,
`--toast-radius`, `--toast-padding`, `--toast-shadow`, `--toast-gap`, `--toast-item-gap`,
`--toast-max-width`, `--toast-z-index`, `--toast-font-size`, `--toast-button-bg`,
`--toast-button-hover-bg`, `--toast-button-padding`, and `--toast-success-color`,
`--toast-warning-color`, `--toast-error-color` for the accent stripe (or `--toast-accent`
to set it whatever the priority). `--toast-stack-position` drops the stack out of
`fixed` for embedding it in a container. Pass a `children` snippet to render the body
yourself; it receives the `ToastItem`.

```svelte example id="toast-custom"
<script lang="ts">
  import Toast from '$lib/Toast.svelte'
  import { ToastStore } from '$lib/toast-queue.svelte.ts'

  const store = new ToastStore()
</script>

<button onclick={() => store.show(`Upload complete`, { priority: `success` })}>
  custom body
</button>

<Toast
  {store}
  position="bottom-left"
  style="--toast-bg: darkslateblue; --toast-color: white; --toast-radius: 2em"
>
  {#snippet children(item)}
    <strong>{item.priority}</strong>
    <span>{item.message}</span>
  {/snippet}
</Toast>
```
