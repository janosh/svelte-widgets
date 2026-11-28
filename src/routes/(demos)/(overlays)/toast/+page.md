## Toast

Notifications backed by a queue rather than a list. One toast is visible at a time and the rest wait their turn by priority, so a burst of notices can neither bury the one that matters nor scroll past before it is read.

The queue is a pure reducer (`enqueue_toast`, `dismiss_toast`, `expire_toasts`, `activate_toast_action`): each function takes a queue and returns the next one plus the lifecycle effects it produced, so an app with its own timers and rendering can hold the queue in `$state.raw` and drive it directly. `ToastStore` wraps it reactively and owns the expiry timer. `toast` is a ready-made store, so `toast.show('Saved')` works from anywhere; pass `store` to `<Toast />` when a page wants its own queue.

### Priorities

`progress`, `info`, `success`, `warning`, `error`, lowest to highest. A higher-ranked arrival preempts the visible toast and puts it back in the queue with its remaining reading time banked, so an interrupted notice resumes rather than restarting or being cut short. `warning` and `error` stay up until dismissed; the rest time out after five seconds (`duration_ms` overrides, `null` keeps a toast up).

```svelte example id="toast-priorities"
<script lang="ts">
  import Toast from 'svelte-widgets/Toast.svelte'
  import { TOAST_PRIORITIES, ToastStore } from 'svelte-widgets/toast-queue'

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

Those five are only the default. Rank is array position, so pass your own ordered list as `priorities` to `create_toast_queue` or `ToastStore` and the types follow: `show` accepts exactly the listed names, and an unknown one throws rather than silently ranking below every real tier. Requests without a priority land on `default_priority`: `info` where the ladder has that rung, required where it does not. The top two rungs stay up until dismissed unless `sticky_priorities` says otherwise. The accent stripe is keyed off `data-priority`, so custom tiers can be colored from your own CSS:

```ts
const store = new ToastStore({
  priorities: [`progress`, `info`, `action`, `watch`, `error`],
})
store.show(`Watching for changes`, { priority: `watch` })
```

### Actions, dedupe and overflow

A toast can carry one action button. Since dismissing one by accident is easy, a toast whose action nobody has taken is exempt from the overflow cap (`max_pending`, default 3 waiting toasts): press _spam_ below and the plain notices are dropped while the undo survives.

A repeat with the same `dedupe_key` (default: the message) updates the queued toast instead of lining up behind it. A lower-priority repeat refreshes only the text, leaving the original's priority, timing and action alone.

```svelte example id="toast-actions"
<script lang="ts">
  import Toast from 'svelte-widgets/Toast.svelte'
  import { ToastStore } from 'svelte-widgets/toast-queue'

  const store = new ToastStore()
  let log = $state<string[]>([])
  const record = (entry: string) => (log = [entry, ...log].slice(0, 5))

  const show_undo = () =>
    store.show(`Deleted "notes.md"`, {
      dedupe_key: `delete-${Math.random()}`,
      duration_ms: null,
      action: { label: `Undo`, on_click: () => record(`undo pressed`) },
      on_close: (toast, { via }) => record(`${via}: ${toast.message}`),
    })
  const spam = () => {
    for (const idx of [1, 2, 3, 4, 5]) {
      store.show(`Background job ${idx} finished`, {
        priority: `success`,
        duration_ms: null,
        on_close: (toast, { via }) => record(`${via}: ${toast.message}`),
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

Both live regions stay mounted, since a region created together with its first message goes unannounced in several screen readers. Sticky priorities (`warning` and `error` by default, or the `assertive` prop) go to the assertive region and everything else to the polite one, rather than flipping `aria-live` on one region mid-flight, which is just as unreliable.

The countdown pauses while the keyboard is inside the stack or the pointer is over it (`pause_on_hover={false}` drops the latter), so reaching for the action button cannot make it disappear ([WCAG 2.2.1][wcag-timing]). <kbd>Alt</kbd>+<kbd>T</kbd> (`focus_hotkey`, `null` opts out) moves focus to the toast's first control from anywhere, and <kbd>Escape</kbd> dismisses only once focus is inside, so it never fights a dialog for the key. `dismissible={false}` removes the close button and Escape dismissal.

[wcag-timing]: https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable

### Styling

`position` (default `bottom-right`) takes any of `top`/`bottom` × `left`/`center`/`right`. Everything else is a CSS custom property: `--toast-inset`, `--toast-bg`, `--toast-color`, `--toast-border`, `--toast-radius`, `--toast-padding`, `--toast-shadow`, `--toast-gap`, `--toast-item-gap`, `--toast-max-width`, `--toast-z-index`, `--toast-font-size`, `--toast-button-bg`, `--toast-button-hover-bg`, `--toast-button-padding`, and `--toast-success-color` (`#4a8f67`), `--toast-warning-color` (`orange`), `--toast-error-color` (`crimson`) for the accent stripe (or `--toast-accent` to set it whatever the priority). `--toast-stack-position` drops the stack out of `fixed` for embedding it in a container. Pass a `children` snippet to render the body yourself; it receives the `ToastItem`.

```svelte example id="toast-custom"
<script lang="ts">
  import Toast from 'svelte-widgets/Toast.svelte'
  import { ToastStore } from 'svelte-widgets/toast-queue'

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
