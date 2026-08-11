<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import type { DismissConfig } from './attachments'
  import { click_outside, float, focus_trap } from './attachments'
  import { chain_handlers, type Placement } from './utils'

  type PopupRole = `alertdialog` | `dialog` | `menu` | `listbox` | `tree` | `grid`
  type PopupHasPopup = Exclude<PopupRole, `alertdialog`>
  // Attributes for the trigger to spread, so consumers keep their own markup
  type TriggerProps = {
    onclick?: (event: MouseEvent) => void
    onmouseenter?: (event: MouseEvent) => void
    onmouseleave?: (event: MouseEvent) => void
    onfocusin?: (event: FocusEvent) => void
    onfocusout?: (event: FocusEvent) => void
    'aria-expanded': boolean
    'aria-haspopup': PopupHasPopup
    'aria-controls': string | undefined
  }
  type TriggerMode = `click` | `hover` | `focus`
  const unique_id = $props.id()

  let {
    open = $bindable(false),
    placement = `bottom`,
    align = `center`,
    offset = 8,
    padding = 8,
    match_width = false,
    strategy = `fixed`,
    escape = true,
    dismiss_on = `press`,
    trap_focus = true,
    open_delay_ms = 0,
    close_delay_ms,
    surface = $bindable(null),
    trigger,
    trigger_mode = `click`,
    children,
    on_close,
    id,
    role = `dialog`,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `children` | `role`> & {
    open?: boolean
    placement?: Placement | `auto`
    align?: `center` | `start`
    offset?: number
    padding?: number // closest the surface may come to a viewport edge
    match_width?: boolean // size the surface to the trigger, for dropdown-like menus
    // `fixed` escapes overflow: hidden ancestors but is clipped by a transformed one
    strategy?: `fixed` | `absolute`
    escape?: boolean
    dismiss_on?: DismissConfig[`dismiss_on`] // see dismiss_on_outside_press
    trap_focus?: boolean
    open_delay_ms?: number
    close_delay_ms?: number
    surface?: HTMLDivElement | null
    role?: PopupRole
    // Snippets remain owned by the component that declares them. Popover invokes the
    // trigger and body in that owner's scope; it does not retain either past teardown.
    trigger?: Snippet<[TriggerProps]>
    trigger_mode?: TriggerMode
    children: Snippet
    on_close?: (detail: { via: `pointer` | `escape` | `trigger` }) => void
  } = $props()

  const surface_id = $derived(id ?? unique_id)
  let trigger_wrapper = $state<HTMLSpanElement | null>(null)
  // The wrapper is `display: contents` and has no box of its own — measuring it would
  // pin every popover to the viewport corner. Anchor to what the snippet rendered.
  const anchor = $derived(trigger_wrapper?.firstElementChild ?? trigger_wrapper)
  let open_timeout: ReturnType<typeof setTimeout> | undefined
  let close_timeout: ReturnType<typeof setTimeout> | undefined
  let pointer_inside = false
  let focus_inside = false
  let focus_open_blocked = false
  let trigger_focus = $state<HTMLElement | SVGElement | null>(null)

  const clear_close_timeout = () => {
    clearTimeout(close_timeout)
    close_timeout = undefined
  }
  // Open and close are tracked separately: a pointer leaving while focus stays inside
  // cancels only the pending close, leaving a pending open to still fire.
  const clear_timeouts = () => {
    clearTimeout(open_timeout)
    open_timeout = undefined
    clear_close_timeout()
  }

  const close = (via: `pointer` | `escape` | `trigger`) => {
    clear_timeouts()
    if (!open) return
    open = false
    on_close?.({ via })
  }

  // Reset stale interaction state on every close and block focus restoration from
  // immediately reopening a hover/focus popover.
  let was_open = false
  let trap_was_enabled = false
  $effect.pre(() => {
    if (was_open && !open) {
      focus_open_blocked =
        focus_inside && trap_was_enabled && Boolean(trigger_focus?.isConnected)
      focus_inside = false
      pointer_inside = false
    }
    was_open = open
    trap_was_enabled = trap_focus
  })

  const open_after_delay = () => {
    clear_timeouts()
    if (open) return
    const scheduled_mode = trigger_mode
    open_timeout = setTimeout(() => {
      open_timeout = undefined
      if (trigger_mode === scheduled_mode) open = true
    }, open_delay_ms)
  }
  const close_after_delay = () => {
    clear_timeouts()
    if (!open) return
    const scheduled_mode = trigger_mode
    close_timeout = setTimeout(
      () => {
        close_timeout = undefined
        if (trigger_mode === scheduled_mode) close(`trigger`)
      },
      close_delay_ms ?? (trigger_mode === `click` ? 0 : 150),
    )
  }
  const contains_interaction_target = (target: EventTarget | null) =>
    target instanceof Node &&
    Boolean(trigger_wrapper?.contains(target) || surface?.contains(target))
  const close_if_interaction_ended = () => {
    if (focus_inside || (trigger_mode === `hover` && pointer_inside))
      clear_close_timeout()
    else close_after_delay()
  }
  const enter_pointer = () => {
    pointer_inside = true
    open_after_delay()
  }
  const leave_pointer = (event: MouseEvent) => {
    pointer_inside = contains_interaction_target(event.relatedTarget)
    close_if_interaction_ended()
  }
  const remember_trigger = (target: EventTarget | null) => {
    if (target instanceof HTMLElement || target instanceof SVGElement)
      trigger_focus = target
  }
  const enter_focus = (event: FocusEvent) => {
    remember_trigger(event.currentTarget)
    focus_inside = true
    if (!focus_open_blocked) open_after_delay()
  }
  const leave_focus = (event: FocusEvent) => {
    focus_inside = contains_interaction_target(event.relatedTarget)
    if (!focus_inside) focus_open_blocked = false
    close_if_interaction_ended()
  }
  // Cancel a delayed timer left by an earlier trigger mode.
  const toggle_from_click = (event: MouseEvent) => {
    clear_timeouts()
    if (open) close(`trigger`)
    else {
      remember_trigger(event.currentTarget)
      open = true
    }
  }

  const trigger_props: TriggerProps = $derived.by(() => {
    const aria = {
      'aria-expanded': open,
      'aria-haspopup': role === `alertdialog` ? `dialog` : role,
      'aria-controls': open ? surface_id : undefined,
    }
    // click_outside already treats the trigger as inside, so this can toggle directly.
    if (trigger_mode === `click`) return { ...aria, onclick: toggle_from_click }
    const on_focus = { ...aria, onfocusin: enter_focus, onfocusout: leave_focus }
    if (trigger_mode === `focus`) return on_focus
    // Hover also opens on focus so the same content remains keyboard-reachable.
    return { ...on_focus, onmouseenter: enter_pointer, onmouseleave: leave_pointer }
  })

  // Returning the function clears pending timers on teardown.
  $effect(() => clear_timeouts)
</script>

<span bind:this={trigger_wrapper} style="display: contents">
  {@render trigger?.(trigger_props)}
</span>

{#if open}
  <div
    bind:this={surface}
    {...rest}
    id={surface_id}
    {role}
    aria-label={rest[`aria-label`] ?? (rest[`aria-labelledby`] ? undefined : `Popover`)}
    class={[`popover`, rest.class]}
    {@attach float({ anchor, placement, align, offset, padding, match_width, strategy })}
    {@attach click_outside({
      inside: [trigger_wrapper],
      escape,
      dismiss_on,
      callback: (_node, _config, { via }) => close(via),
    })}
    {@attach focus_trap({
      enabled: trap_focus,
      // Hover/focus opening must not steal focus.
      initial: trigger_mode === `click` ? undefined : false,
      // Return focus to the exact trigger that opened this instance.
      restore: trigger_focus?.isConnected ? trigger_focus : false,
    })}
    onmouseenter={chain_handlers(
      trigger_mode === `hover` ? enter_pointer : undefined,
      rest.onmouseenter,
    )}
    onmouseleave={chain_handlers(
      trigger_mode === `hover` ? leave_pointer : undefined,
      rest.onmouseleave,
    )}
    onfocusin={chain_handlers(
      trigger_mode === `click` ? undefined : enter_focus,
      rest.onfocusin,
    )}
    onfocusout={chain_handlers(
      trigger_mode === `click` ? undefined : leave_focus,
      rest.onfocusout,
    )}
  >
    {@render children()}
  </div>
{/if}

<style>
  .popover {
    z-index: var(--popover-z-index, 10);
    background: var(--popover-bg, var(--sms-options-bg, light-dark(#fff, #2a2a2e)));
    color: var(--popover-color, inherit);
    border: var(--popover-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--popover-radius, 5pt);
    padding: var(--popover-padding, 6pt 8pt);
    box-shadow: var(--popover-shadow, 0 3px 12px rgba(0, 0, 0, 0.3));
    max-width: var(--popover-max-width, min(90vw, 30rem));
  }
</style>
