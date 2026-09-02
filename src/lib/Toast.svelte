<script lang="ts">
  import { type Snippet, tick, untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { hotkey } from './attachments/index'
  import { merge_labels, TOAST_LABELS, type ToastLabels } from './labels'
  import { toast as default_store } from './toast-queue.svelte.ts'
  import type { ToastItem, ToastPosition, ToastStore } from './toast-queue.svelte.ts'
  import { chain_handlers } from './utils'

  // Priorities are widened to `string` throughout: the component renders whatever
  // ladder its store was built with and never ranks anything itself.
  let {
    store = default_store,
    position = `bottom-right`,
    dismissible = true,
    pause_on_hover = true,
    // Option+T types `†` on Apple keyboards, so the shortcut is bound under both
    // spellings rather than silently doing nothing on macOS
    focus_hotkey = [`alt+t`, `alt+†`],
    assertive,
    dismiss_label = `Dismiss notification`,
    labels,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `children`> & {
    store?: ToastStore<string>
    position?: ToastPosition
    dismissible?: boolean
    // Hovering suspends the countdown. Focus always does, hover or not.
    pause_on_hover?: boolean
    // Moves the keyboard to the toast's own controls from anywhere on the page, since a
    // toast lives at the end of the DOM and Tab may be a long way from it. `null` opts out.
    focus_hotkey?: string | string[] | null
    // Rendered into the assertive live region, interrupting whatever is being read.
    // Defaults to the store's sticky priorities, so urgency tracks what stays on screen.
    assertive?: readonly string[]
    dismiss_label?: string
    labels?: Partial<ToastLabels>
    children?: Snippet<[ToastItem<string>]>
  } = $props()

  const msg = $derived(merge_labels(TOAST_LABELS, labels))

  let stack: HTMLDivElement | null = $state(null)
  let [is_hovered, is_focused] = $state([false, false])

  const active_toast = $derived(store.active_toast)
  // read off the store's own sticky set, not a second copy of its top-two rule: a toast
  // held on screen until dismissed has to interrupt, or it can sit there unread. Deriving
  // it here let a custom sticky_priorities be announced politely while never leaving.
  const assertive_priorities = $derived(assertive ?? store.sticky_priorities)
  const is_assertive = $derived(
    active_toast !== null && assertive_priorities.includes(active_toast.priority),
  )

  // `is_hovered` records where the pointer is; pause_on_hover is policy applied on top, so
  // flipping the prop over an already-hovered stack takes effect without a fresh enter
  const should_pause = $derived((is_hovered && pause_on_hover) || is_focused)
  // Called straight from the handlers, not left to the effect below: an effect flushes a
  // microtask later, and a toast whose timer expires in between is already gone.
  const sync_pause = () => (should_pause ? store.pause() : store.resume())
  const set_hovered = (value: boolean) => {
    is_hovered = value
    sync_pause()
  }
  const set_focused = (value: boolean) => {
    is_focused = value
    sync_pause()
  }
  // Covers what the handlers cannot: a toast promoted under a pointer that never left has
  // no enter event, and flipping pause_on_hover fires none at all. pause()/resume() both
  // early-return when there is nothing to do, so the queue change they cause settles.
  $effect(() => {
    void should_pause // pinned as a dependency, so a bare prop flip re-runs this too
    if (active_toast) untrack(sync_pause)
  })

  // Where the keyboard was before focus_hotkey pulled it in: removing the toast unmounts
  // the button holding focus, which would otherwise drop it on <body>.
  let focus_origin: HTMLElement | null = null

  const focus_toast = () => {
    const first_button = stack?.querySelector(`button`)
    if (!first_button) return
    const previous = document.activeElement
    // a second press while already inside the toast must not overwrite the real origin
    if (!stack?.contains(previous)) {
      focus_origin = previous instanceof HTMLElement ? previous : null
    }
    first_button.focus()
  }

  const restore_focus = async () => {
    const origin = focus_origin
    focus_origin = null
    await tick() // the toast that had focus is gone only after the DOM catches up
    // Only reclaim focus the toast still holds, or that its removal dropped on <body>:
    // once the user has tabbed elsewhere, yanking them back is worse than not restoring.
    const holder = document.activeElement ?? document.body
    if (origin && (holder === document.body || stack?.contains(holder))) origin.focus()
    // Removing the focused button fires no focusout, so re-derive the focus pause or the
    // promoted toast sits paused until the keyboard or pointer comes back.
    set_focused(Boolean(stack?.contains(document.activeElement)))
  }

  // The buttons below restore focus themselves, since dismissing one toast can promote
  // the next and leave `active_toast` non-null. This covers every other way the last toast
  // leaves — an absolute deadline that focus cannot pause, or the consumer clearing the
  // queue — where there is no click to hang the restore off.
  $effect(() => {
    if (!active_toast) void restore_focus()
  })

  const dismiss = (id: string) => {
    store.dismiss(id)
    void restore_focus()
  }
  const run_action = (id: string) => {
    store.run_action(id)
    void restore_focus()
  }

  const bindings = $derived(
    focus_hotkey?.length
      ? [{ keys: focus_hotkey, allow_in_inputs: true, handler: focus_toast }]
      : [],
  )
  // Scoped to the stack, so Escape only dismisses when the keyboard is already in the
  // toast — a global Escape would fight every dialog for the same key. Gated on
  // `dismissible` too, or it stays the one way to close a toast declared undismissable.
  const escape_binding = $derived(
    active_toast && dismissible
      ? [{ keys: `Escape`, handler: () => dismiss(active_toast.id) }]
      : [],
  )
</script>

{#snippet toast_card(item: ToastItem<string>)}
  {@const count = store.pending.length}
  <div class="toast" data-priority={item.priority}>
    {#if children}
      {@render children(item)}
    {:else}
      <span class="toast-message" style="min-width: 0">{item.message}</span>
    {/if}
    {#if count > 0}
      <!-- aria-atomic makes the region read the whole card, so an aria-label here would
      splice the badge's wording into the message. The count is announced separately. -->
      <span class="toast-pending" aria-hidden="true">+{count}</span>
      <span class="sr-only">{msg.pending(count)}</span>
    {/if}
    {#if item.action}
      <button class="toast-action" type="button" onclick={() => run_action(item.id)}>
        {item.action.label}
      </button>
    {/if}
    {#if dismissible}
      <button
        class="toast-dismiss"
        type="button"
        aria-label={dismiss_label}
        onclick={() => dismiss(item.id)}>&times;</button
      >
    {/if}
  </div>
{/snippet}

<!-- Both regions stay mounted and empty rather than being created with their first
toast: a live region inserted at the same moment as its content is announced by only
some screen readers. Two of them, because swapping aria-live on one region mid-flight
is just as unreliable. -->
<div
  bind:this={stack}
  {...rest}
  class={[`toast-stack`, rest.class]}
  data-position={position}
  onpointerenter={chain_handlers(() => set_hovered(true), rest.onpointerenter)}
  onpointerleave={chain_handlers(() => set_hovered(false), rest.onpointerleave)}
  onfocusin={chain_handlers(() => set_focused(true), rest.onfocusin)}
  onfocusout={chain_handlers(() => set_focused(false), rest.onfocusout)}
  {@attach hotkey({ bindings, global: true })}
  {@attach hotkey({ bindings: escape_binding })}
>
  <div role="status" aria-live="polite" aria-atomic="true">
    {#if active_toast && !is_assertive}
      {#key active_toast.id}{@render toast_card(active_toast)}{/key}
    {/if}
  </div>
  <div role="alert" aria-live="assertive" aria-atomic="true">
    {#if active_toast && is_assertive}
      {#key active_toast.id}{@render toast_card(active_toast)}{/key}
    {/if}
  </div>
</div>

<style>
  .toast-stack {
    position: var(--toast-stack-position, fixed);
    z-index: var(--toast-z-index, 30);
    display: flex;
    flex-direction: column;
    gap: var(--toast-gap, 0.4em);
    max-width: var(--toast-max-width, min(90vw, 28rem));
    /* the empty region is a zero-height box, but the stack still spans the viewport
    edge, so it must not swallow presses meant for the page underneath */
    pointer-events: none;
    &[data-position^='top'] {
      top: var(--toast-inset, 1rem);
    }
    &[data-position^='bottom'] {
      bottom: var(--toast-inset, 1rem);
    }
    &[data-position$='left'] {
      left: var(--toast-inset, 1rem);
    }
    &[data-position$='right'] {
      right: var(--toast-inset, 1rem);
    }
    &[data-position$='center'] {
      left: 50%;
      transform: translateX(-50%);
    }
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--toast-item-gap, 0.6em);
    padding: var(--toast-padding, 6pt 8pt);
    border: var(--toast-border, 1px solid light-dark(lightgray, #555));
    border-left: 3px solid var(--toast-accent, transparent);
    border-radius: var(--toast-radius, 5pt);
    background: var(--toast-bg, var(--sms-options-bg, light-dark(#fff, #2a2a2e)));
    color: var(--toast-color, inherit);
    box-shadow: var(--toast-shadow, 0 3px 12px rgba(0, 0, 0, 0.3));
    font-size: var(--toast-font-size, inherit);
    overflow-wrap: anywhere;
    button {
      flex: 0 0 auto;
      padding: var(--toast-button-padding, 2pt 5pt);
      border: none;
      border-radius: 3pt;
      background: var(--toast-button-bg, rgba(255, 255, 255, 0.15));
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    button:hover,
    button:focus-visible {
      background: var(--toast-button-hover-bg, rgba(255, 255, 255, 0.3));
    }
    .toast-pending {
      flex: 0 0 auto;
      margin-left: auto;
      opacity: 0.7;
      font-size: 0.85em;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
    .toast-dismiss {
      background: none;
      font-size: 1.2em;
      line-height: 1;
    }
    &[data-priority='success'] {
      --toast-accent: var(--toast-success-color, forestgreen);
    }
    &[data-priority='warning'] {
      --toast-accent: var(--toast-warning-color, orange);
    }
    &[data-priority='error'] {
      --toast-accent: var(--toast-error-color, crimson);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .toast {
      animation: toast-in 0.15s ease-out;
    }
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.4em);
    }
  }
</style>
