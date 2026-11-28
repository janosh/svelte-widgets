## Popover & ActionMenu

Both use the browser Popover API for top-layer rendering, light dismissal and Escape, with [`float`](attachments/float) for placement. A non-native dismissal policy switches to [`click_outside`](attachments/click-outside). `Popover` adds [`focus_trap`](attachments/focus-trap) for dialog-like content; `ActionMenu` uses menu arrow keys and lets Tab resume the page order.

### `Popover`

The `trigger` snippet receives the event handlers and `aria-expanded`/`aria-haspopup`/`aria-controls` to spread onto whatever opens the popover. The browser closes the auto popover on an outside click or Escape and keeps nested popovers in order.

```svelte example id="popover-basic"
<script lang="ts">
  import { Popover } from 'svelte-widgets'
  import type { Placement } from 'svelte-widgets/position'

  let placement = $state<Placement>(`bottom`)
  let last_close = $state(``)
  let nested_close = $state(``)
</script>

<label>
  Placement
  <select bind:value={placement}>
    {#each [`top`, `right`, `bottom`, `left`] as side (side)}<option>{side}</option
      >{/each}
  </select>
</label>

<div style="display: flex; gap: 1em; margin: 2em 0; align-items: center">
  <Popover {placement} on_close={({ via }) => (last_close = via)}>
    {#snippet trigger(props)}
      <button {...props}>Open popover</button>
    {/snippet}
    <p style="margin: 0 0 6pt">Tab is trapped in here.</p>
    <label>Name <input placeholder="type something" /></label>
    <Popover
      placement="right"
      aria-label="Nested popover"
      on_close={({ via }) => (nested_close = via)}
    >
      {#snippet trigger(props)}
        <button {...props}>Open nested popover</button>
      {/snippet}
      Nested popover
    </Popover>
  </Popover>

  <Popover placement="right" align="start">
    {#snippet trigger(props)}
      <button {...props}>Second popover</button>
    {/snippet}
    <p style="margin: 0">Escape closes whichever one you opened last.</p>
  </Popover>

  {#if last_close}<small>last closed via <code>{last_close}</code></small>{/if}
  {#if nested_close}<small>nested closed via <code>{nested_close}</code></small>{/if}
</div>
```

`on_open({ via })` and `on_close({ via })` report each change once with its cause: `trigger` (a click, or a hover/focus enter or leave), `pointer` and `escape` (close only), or `programmatic` for a change to the bound `open`. Mounting reports nothing.

`escape={false}` makes it a manual popover so Escape stays with the page, `dismiss_on="press"` dismisses on press instead of release, and `trap_focus={false}` leaves focus where it is. `strategy="absolute"` (default `fixed`) survives a transformed ancestor at the cost of tracking page scroll, and `match_width` sizes the surface to the trigger for dropdown-like menus. `role` defaults to `dialog`; set `listbox`, `tree` or `grid` when appropriate. The trigger mirrors it in `aria-haspopup` and sets `aria-controls` only while the surface is mounted. Use `ActionMenu` rather than `role="menu"` for full ARIA menu keyboard behavior.

`trigger_mode="hover"` or `"focus"` replaces clicks. Hover mode also opens on focus, and `open_delay_ms` (default 0) and `close_delay_ms` (default 150) keep the surface stable while the pointer crosses from its trigger.

```svelte example id="popover-hover"
<script lang="ts">
  import { Popover } from 'svelte-widgets'
</script>

<Popover trigger_mode="hover" open_delay_ms={150} close_delay_ms={250} trap_focus={false}>
  {#snippet trigger(props)}
    <button {...props}>Hover or focus</button>
  {/snippet}
  <a href="https://svelte.dev">Interactive content stays open while focused.</a>
</Popover>
```

### `ActionMenu`

Render a `trigger` snippet for a button-anchored dropdown, or pass a region as children to replace its browser right-click menu. Actions use the same [`CmdAction`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/types.ts) shape as `CommandMenu`. Every action needs a non-empty string `id`, unique across the whole menu including sections; numeric, blank and duplicate IDs throw. Labels and section titles may repeat. Keep section objects stable when reordering so their rendered nodes are retained. A radio section's `selected` is an action ID or `null`.

```svelte example id="action-menu-basic"
<script lang="ts">
  import { ActionMenu } from 'svelte-widgets'
  import type { CmdAction } from 'svelte-widgets'

  let log = $state<string[]>([])
  const record = (label: string) => (log = [label, ...log].slice(0, 4))
  const actions: CmdAction[] = [
    { id: `Cut`, label: `Cut`, shortcut: `mod+x`, action: record },
    { id: `Copy`, label: `Copy`, shortcut: `mod+c`, action: record },
    { id: `Paste`, label: `Paste`, shortcut: `mod+v`, action: record },
    { id: `Delete`, label: `Delete`, action: record, disabled: true },
  ]
</script>

<ActionMenu {actions} match_width>
  {#snippet trigger(props)}
    <button {...props}>Edit actions</button>
  {/snippet}
</ActionMenu>
<button type="button">After menu</button>

<ActionMenu {actions}>
  <div
    style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); display: grid; place-items: center; height: 8em"
  >
    Right-click me
  </div>
</ActionMenu>

<ol>
  {#each log as entry, idx (idx)}<li>{entry}</li>{/each}
</ol>
```

`on_execute({ action, section })` fires after an action runs, like CommandMenu's `on_execute({ action })`. It and the `item` snippet (which renders rows your own way) keep your custom action fields; import `CmdSection<Action>` from the package root for typed sections. `on_open({ via })` (`trigger`, `contextmenu`, `programmatic`) and `on_close({ via })` (`trigger`, `escape`, `pointer`, `select`, `tab`, `programmatic`) report each change of `open`, or of `at` in context mode, once; mounting reports nothing.

Both forms share the menu semantics: arrow keys walk the items (skipping disabled ones, wrapping at both ends), Home and End jump to either end, Tab/Shift+Tab close and continue after/before the trigger, and the browser closes on Escape or an outside interaction. The trigger form supports `bind:open`, `placement`, `align`, `offset`, `padding`, `match_width` and `strategy`.

In context mode without a region, the whole page qualifies; `trigger="none"` installs no right-click handler, so you can bind `at` and open from a long-press or keyboard shortcut. The default `dismiss` policy uses native light dismissal; `dismiss_on: 'press'`, `escape: false`, `disabled: true`, `inside` or `scope` selects the custom [`click_outside`](attachments/click-outside) path.
