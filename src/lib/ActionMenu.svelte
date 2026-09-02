<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { click_outside, type DismissConfig, float } from './attachments/index'
  import type { CmdAction } from './types'
  import {
    chain_handlers,
    type CmdSection,
    format_shortcut,
    type Placement,
    step_focus,
  } from './utils'

  type TriggerProps = {
    onclick: (event: MouseEvent) => void
    'aria-controls': string | undefined
    'aria-expanded': boolean
    'aria-haspopup': `menu`
    'aria-disabled': boolean | undefined
  }
  type ContextMode = {
    // Where the menu is open, as viewport coordinates. null while closed.
    at?: { x: number; y: number } | null
    // Region the right-click applies to. Omit and the whole document qualifies.
    children?: Snippet
    // What picks up the opening right-click: the region when `children` is given, the
    // document otherwise. `none` installs no handler, for a consumer that sets `at`.
    trigger?: `body` | `region` | `none`
    open?: never
    placement?: never
    align?: never
    offset?: never
    match_width?: never
  }
  type DropdownMode = {
    trigger: Snippet<[TriggerProps]>
    open?: boolean
    placement?: Placement | `auto`
    align?: `center` | `start` | `end`
    offset?: number
    match_width?: boolean
    at?: never
    children?: never
  }
  type Props = Omit<HTMLAttributes<HTMLMenuElement>, `children`> & {
    actions: (CmdAction | CmdSection)[]
    disabled?: boolean
    // Native light-dismiss by default; press dismissal, escape/enabled false, or extra
    // inside regions switch to the custom dismissal path.
    dismiss?: DismissConfig
    item?: Snippet<[{ action: CmdAction; section?: CmdSection; checked?: boolean }]>
    on_select?: (action: CmdAction, section?: CmdSection) => void
    padding?: number
    strategy?: `fixed` | `absolute`
  } & (ContextMode | DropdownMode)

  const unique_id = $props.id()
  let {
    actions,
    at = $bindable(null),
    children,
    disabled = false,
    dismiss,
    item,
    on_select,
    open = $bindable(false),
    placement = `bottom`,
    align = `start`,
    offset = 4,
    padding = 8,
    match_width = false,
    strategy = `fixed`,
    trigger,
    ...rest
  }: Props = $props()

  const menu_id = $derived(rest.id ?? `action-menu-${unique_id}`)
  const trigger_snippet = $derived(typeof trigger === `function` ? trigger : undefined)
  const context_trigger = $derived.by(() => {
    if (typeof trigger === `function`) return undefined
    const mode = trigger ?? (children ? `region` : `body`)
    if (mode === `region` && !children)
      throw new Error(`ActionMenu: trigger="region" requires children`)
    return mode
  })
  let trigger_wrapper = $state<HTMLSpanElement | null>(null)
  const trigger_element = $derived(trigger_wrapper?.firstElementChild ?? trigger_wrapper)
  const native_dismiss = $derived(
    dismiss?.enabled !== false &&
      dismiss?.escape !== false &&
      (dismiss?.dismiss_on ?? `release`) === `release` &&
      !dismiss?.inside?.some(Boolean) &&
      !dismiss?.scope,
  )
  let focus_origin: HTMLElement | SVGElement | null = null
  let context_open_timeout: ReturnType<typeof setTimeout> | undefined

  // A right-click is a zero-size anchor; dropdown mode uses the rendered trigger element.
  const anchor = $derived.by(() => {
    if (trigger_snippet) return open ? trigger_element : null
    return at && { top: at.y, bottom: at.y, left: at.x, right: at.x }
  })

  // CmdAction takes arbitrary extra keys, so a `title`/`actions` pair is no proof of a
  // section; its required `action` callback is what one entry has and the other lacks.
  const is_section = (entry: CmdAction | CmdSection): entry is CmdSection =>
    !(`action` in entry)
  // Tag by source field so id `Copy`, label `Copy` and section `Copy` stay distinct; the
  // index is appended only on repeats, so unique ids stay stable across reorder.
  const tag = (entry: CmdAction | CmdSection): string =>
    is_section(entry)
      ? JSON.stringify([`section`, entry.title])
      : JSON.stringify(entry.id === undefined ? [`label`, entry.label] : [`id`, entry.id])
  const keys_of = (entries: readonly (CmdAction | CmdSection)[]): string[] => {
    const tags = entries.map(tag)
    return tags.map((serialized, idx) =>
      tags.indexOf(serialized) === tags.lastIndexOf(serialized)
        ? serialized
        : `${serialized}:${idx}`,
    )
  }
  const entry_keys = $derived(keys_of(actions))
  // Empty sections are headings over nothing, dropped once anything else has content; a menu
  // of only empty sections stays externally controllable.
  const all_empty = $derived(
    actions.every((entry) => is_section(entry) && !entry.actions.length),
  )
  // Undefined leaves the item a plain menuitem; a boolean makes it a radio.
  const is_checked = (action: CmdAction, section?: CmdSection): boolean | undefined =>
    section?.selected === undefined
      ? undefined
      : section.selected === (action.id ?? action.label)

  const remember_focus_origin = (target: unknown = document.activeElement) => {
    if (focus_origin) return
    if (target instanceof HTMLElement || target instanceof SVGElement)
      focus_origin = target
  }
  const restore_focus = (closing_menu: HTMLMenuElement) => {
    const active = document.activeElement
    if (active === document.body || closing_menu.contains(active)) focus_origin?.focus()
    focus_origin = null
  }
  const close = () => {
    if (trigger_snippet) open = false
    else at = null
  }
  const trigger_props = $derived<TriggerProps>({
    onclick: (event) => {
      if (!open && (disabled || all_empty)) return
      if (!open) remember_focus_origin(event.currentTarget)
      open = !open
    },
    'aria-controls': open ? menu_id : undefined,
    'aria-expanded': open,
    'aria-haspopup': `menu`,
    'aria-disabled': disabled || all_empty || undefined,
  })

  function open_at(event: MouseEvent) {
    if (disabled || all_empty) return
    event.preventDefault() // replace the browser's own menu
    const point = { x: event.clientX, y: event.clientY }
    clearTimeout(context_open_timeout)
    // Chromium fires contextmenu before pointerup, which would light-dismiss an auto popover
    // opened synchronously from the same gesture.
    context_open_timeout = setTimeout(() => {
      if (!disabled && !all_empty) at = point
    }, 0)
  }

  onDestroy(() => clearTimeout(context_open_timeout))

  function run(action: CmdAction, section?: CmdSection) {
    close()
    action.action(action.label)
    // Flat consumers keep the one-argument callback they were written against.
    if (section) on_select?.(action, section)
    else on_select?.(action)
  }

  const enabled_items = (parent: ParentNode) => [
    ...parent.querySelectorAll<HTMLButtonElement>(`[role^=menuitem]:not(:disabled)`),
  ]
  const show_menu = (node: HTMLMenuElement) => {
    remember_focus_origin()
    const source = trigger_element instanceof HTMLElement ? trigger_element : undefined
    node.showPopover(source ? { source } : undefined)
    enabled_items(node)[0]?.focus()
    return () => {
      if (node.matches(`:popover-open`)) node.hidePopover()
      restore_focus(node)
    }
  }

  const handle_popover_toggle = (event: ToggleEvent) => {
    if (event.newState === `closed` && anchor) close()
  }

  // Arrows wrap enabled items; Tab closes and resumes page order.
  function handle_menu_keys(event: KeyboardEvent) {
    if (!(event.currentTarget instanceof HTMLMenuElement)) return
    if (event.key === `Tab`) {
      restore_focus(event.currentTarget)
      close()
      return
    }
    step_focus(event, enabled_items(event.currentTarget))
  }
</script>

<svelte:body oncontextmenu={context_trigger === `body` ? open_at : undefined} />

{#if trigger_snippet}
  <span bind:this={trigger_wrapper} style="display: contents">
    {@render trigger_snippet(trigger_props)}
  </span>
{:else if children}
  {@const region_click = context_trigger === `region` ? open_at : undefined}
  <!-- svelte-ignore a11y_no_static_element_interactions -- the menu itself carries the semantics; this is only the region a right-click applies to -->
  <div oncontextmenu={region_click} style="display: contents">{@render children()}</div>
{/if}

{#if anchor}
  <menu
    role="menu"
    tabindex="-1"
    {...rest}
    id={menu_id}
    popover={native_dismiss ? `auto` : `manual`}
    aria-label={rest[`aria-label`] ?? (rest[`aria-labelledby`] ? undefined : `Actions`)}
    class={[`action-menu`, rest.class]}
    ontoggle={handle_popover_toggle}
    onkeydown={chain_handlers(handle_menu_keys, rest.onkeydown)}
    {@attach show_menu}
    {@attach float({
      anchor,
      placement: trigger_snippet ? placement : `bottom`,
      align: trigger_snippet ? align : `start`,
      offset: trigger_snippet ? offset : 0,
      padding,
      match_width: trigger_snippet && match_width,
      strategy,
    })}
    {@attach native_dismiss
      ? null
      : click_outside({
          escape: true,
          ...dismiss,
          inside: trigger_snippet
            ? [...(dismiss?.inside ?? []), trigger_wrapper]
            : dismiss?.inside,
          callback: close,
        })}
  >
    {#each actions as entry, idx (entry_keys[idx])}
      {#if is_section(entry)}
        {#if entry.actions.length || all_empty}
          {@const action_keys = keys_of(entry.actions)}
          <!-- role="group" names the run of items without taking them out of the menu;
          the title is hidden from AT because aria-label already announces it -->
          <li role="group" aria-label={entry.title}>
            <span class="section-title" aria-hidden="true">{entry.title}</span>
            {#each entry.actions as action, action_idx (action_keys[action_idx])}
              {@render menu_item(action, entry)}
            {/each}
          </li>
        {/if}
      {:else}
        <li role="none">{@render menu_item(entry)}</li>
      {/if}
    {/each}
  </menu>
{/if}

{#snippet menu_item(action: CmdAction, section?: CmdSection)}
  {@const checked = is_checked(action, section)}
  <button
    type="button"
    role={checked === undefined ? `menuitem` : `menuitemradio`}
    aria-checked={checked}
    disabled={action.disabled}
    tabindex="-1"
    title={action.description}
    onclick={() => run(action, section)}
  >
    {#if item}
      {@render item({ action, section, checked })}
    {:else}
      {action.label}
      {#if action.shortcut}
        <span aria-hidden="true">
          {#each format_shortcut(action.shortcut) as part, idx (idx)}
            <kbd>{part}</kbd>
          {/each}
        </span>
      {/if}
    {/if}
  </button>
{/snippet}

<style>
  .action-menu {
    inset: auto;
    z-index: var(--action-menu-z-index, 20);
    margin: 0;
    padding: var(--action-menu-padding, 3pt);
    /* else rows inherit the page line-height: on a 16px/1.6 body each item is 33px tall
       before its own padding */
    line-height: var(--action-menu-line-height, 1.35);
    list-style: none;
    min-width: var(--action-menu-min-width, 10rem);
    background: var(--action-menu-bg, var(--sms-options-bg, light-dark(#fff, #2a2a2e)));
    border: var(--action-menu-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--action-menu-radius, 5pt);
    box-shadow: var(--action-menu-shadow, 0 3px 12px rgba(0, 0, 0, 0.3));
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1em;
      width: 100%;
      padding: var(--action-menu-item-padding, 2pt 6pt);
      background: none;
      border: none;
      border-radius: 3pt;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button:hover:not(:disabled),
    button:focus-visible {
      background: var(
        --action-menu-item-hover-bg,
        light-dark(rgba(0, 0, 0, 0.07), rgba(255, 255, 255, 0.15))
      );
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button[aria-checked='true'] {
      /* the surface is light-dark, so a bare white overlay is invisible in light mode */
      background: var(
        --action-menu-item-checked-bg,
        light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.08))
      );
      font-weight: 600;
    }
    kbd {
      /* a bare `monospace` family resolves `em` against the browser's monospace default
         (13px, not 16px), shrinking symbol keys like ⌘ ⇧ ⌥ past legibility */
      font-family: inherit;
      font-size: 0.9em;
      opacity: 0.85;
    }
    li[role='group'] + li[role='group'] {
      margin-top: 3pt;
      border-top: var(
        --action-menu-section-border,
        1px solid light-dark(lightgray, #555)
      );
      padding-top: 3pt;
    }
    .section-title {
      display: block;
      padding: var(--action-menu-item-padding, 2pt 6pt);
      font-size: 0.75em;
      letter-spacing: 0.05em;
      opacity: 0.6;
      text-transform: uppercase;
    }
  }
</style>
