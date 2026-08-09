<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { click_outside, type DismissConfig, float, focus_trap } from './attachments'
  import type { CmdAction } from './types'
  import { chain_handlers, type CmdSection, format_shortcut, step_focus } from './utils'

  interface Props extends Omit<HTMLAttributes<HTMLMenuElement>, `children`> {
    actions: (CmdAction | CmdSection)[]
    // Where the menu is open, as viewport coordinates. null while closed.
    at?: { x: number; y: number } | null
    // Region the right-click applies to. Omit and the whole document qualifies.
    children?: Snippet
    disabled?: boolean
    // Merged over `{ escape: true }`. `dismiss_on: 'release'` supports right-click toggles.
    dismiss?: DismissConfig
    item?: Snippet<[{ action: CmdAction; section?: CmdSection; checked?: boolean }]>
    on_select?: (action: CmdAction, section?: CmdSection) => void
    // What picks up the opening right-click: the region when `children` is given, the
    // document otherwise. `none` installs neither, for a consumer that sets `at` itself.
    trigger?: `body` | `region` | `none`
  }

  let {
    actions,
    at = $bindable(null),
    children,
    disabled = false,
    dismiss,
    item,
    on_select,
    trigger,
    ...rest
  }: Props = $props()

  const trigger_mode = $derived(trigger ?? (children ? `region` : `body`))
  // the region element only renders with `children`, so this combination installs no
  // handler anywhere and nothing can ever open the menu — fail loudly rather than dead
  $effect(() => {
    if (trigger_mode === `region` && !children) {
      throw new Error(
        `ContextMenu: trigger="region" needs a children snippet to attach to`,
      )
    }
  })

  // A right-click is a zero-size anchor: the menu hangs off the pointer itself
  const anchor = $derived(at && { top: at.y, bottom: at.y, left: at.x, right: at.x })

  // CmdAction takes arbitrary extra keys, so a `title`/`actions` pair is no proof of a
  // section; its required `action` callback is what one entry has and the other lacks
  const is_section = (entry: CmdAction | CmdSection): entry is CmdSection =>
    !(`action` in entry)
  // Tagged by source field, so a section titled `Copy`, an action with id `Copy` and one
  // labeled `Copy` stay three keys. Serialized, not a tuple: Svelte keys by identity.
  const action_key = (action: CmdAction): string =>
    JSON.stringify(action.id === undefined ? [`label`, action.label] : [`id`, action.id])
  // A section has no id, so its title is a heading two of them may share — position
  // disambiguates, since a duplicate key takes down the whole menu, not just the repeat.
  const entry_key = (entry: CmdAction | CmdSection, idx: number): string =>
    is_section(entry) ? JSON.stringify([`section`, entry.title, idx]) : action_key(entry)
  // an empty section is a heading over nothing, so it is dropped once anything else has
  // something to show. A menu of nothing but empty sections keeps them: open_at refuses
  // to open one, so the only way to see it is a consumer setting `at` itself.
  const all_empty = $derived(
    actions.every((entry) => is_section(entry) && !entry.actions.length),
  )
  // undefined leaves the item a plain menuitem; a boolean makes it a radio
  const is_checked = (action: CmdAction, section?: CmdSection): boolean | undefined =>
    section?.selected === undefined
      ? undefined
      : section.selected === (action.id ?? action.label)

  function open_at(event: MouseEvent) {
    if (disabled || all_empty) return
    event.preventDefault() // replace the browser's own menu
    at = { x: event.clientX, y: event.clientY }
  }

  function run(action: CmdAction, section?: CmdSection) {
    at = null
    action.action(action.label)
    // flat consumers keep the one-argument callback they were written against
    if (section) on_select?.(action, section)
    else on_select?.(action)
  }

  // Arrow keys are how a role="menu" is walked; focus_trap only owns Tab. Disabled
  // items are skipped rather than focused-and-inert, and the ends wrap. No horizontal
  // stepping: a vertical menu leaves Left/Right to the page.
  function handle_menu_keys(event: KeyboardEvent) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    const selector = `[role^=menuitem]:not(:disabled)` // menuitem and menuitemradio alike
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(selector)]
    step_focus(event, items)
  }
</script>

<svelte:body oncontextmenu={trigger_mode === `body` ? open_at : undefined} />

{#if children}
  {@const region_click = trigger_mode === `region` ? open_at : undefined}
  <!-- svelte-ignore a11y_no_static_element_interactions -- the menu itself carries the semantics; this is only the region a right-click applies to -->
  <div oncontextmenu={region_click} style="display: contents">{@render children()}</div>
{/if}

{#if anchor}
  <menu
    role="menu"
    {...rest}
    class={[`context-menu`, rest.class]}
    onkeydown={chain_handlers(handle_menu_keys, rest.onkeydown)}
    {@attach float({ anchor, placement: `bottom`, align: `start`, padding: 8 })}
    {@attach click_outside({ escape: true, ...dismiss, callback: () => (at = null) })}
    {@attach focus_trap()}
  >
    {#each actions as entry, idx (entry_key(entry, idx))}
      {#if is_section(entry)}
        {#if entry.actions.length || all_empty}
          <!-- role="group" names the run of items without taking them out of the menu;
          the title is hidden from AT because aria-label already announces it -->
          <li role="group" aria-label={entry.title}>
            <span class="section-title" aria-hidden="true">{entry.title}</span>
            {#each entry.actions as action (action_key(action))}
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
    title={action.description}
    onclick={() => run(action, section)}
  >
    {#if item}
      {@render item({ action, section, checked })}
    {:else}
      <span>{action.label}</span>
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
  .context-menu {
    z-index: var(--context-menu-z-index, 20);
    margin: 0;
    padding: var(--context-menu-padding, 3pt);
    list-style: none;
    min-width: var(--context-menu-min-width, 10rem);
    background: var(--context-menu-bg, var(--sms-options-bg, light-dark(#fff, #2a2a2e)));
    border: var(--context-menu-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--context-menu-radius, 5pt);
    box-shadow: var(--context-menu-shadow, 0 3px 12px rgba(0, 0, 0, 0.3));
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1em;
      width: 100%;
      padding: var(--context-menu-item-padding, 3pt 6pt);
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
        --context-menu-item-hover-bg,
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
        --context-menu-item-checked-bg,
        light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.08))
      );
      font-weight: 600;
    }
    kbd {
      font-size: 0.8em;
      opacity: 0.7;
    }
    li[role='group'] + li[role='group'] {
      margin-top: 3pt;
      border-top: var(
        --context-menu-section-border,
        1px solid light-dark(lightgray, #555)
      );
      padding-top: 3pt;
    }
    .section-title {
      display: block;
      padding: var(--context-menu-item-padding, 3pt 6pt);
      font-size: 0.75em;
      letter-spacing: 0.05em;
      opacity: 0.6;
      text-transform: uppercase;
    }
  }
</style>
