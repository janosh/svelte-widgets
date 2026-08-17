## Popover & ActionMenu

Both surfaces use the browser Popover API for top-layer rendering, light dismissal and Escape handling, with [`float`](attachments/float) providing placement. A non-native dismissal policy opts into [`click_outside`](attachments/click-outside). `Popover` can add [`focus_trap`](attachments/focus-trap) for dialog-like content; `ActionMenu` uses menu-specific arrow keys and lets Tab resume the page order.

### `Popover`

The `trigger` snippet receives the click handler and `aria-expanded`/`aria-haspopup`/`aria-controls` attributes to spread onto whatever opens the popover. The browser closes the auto popover on an outside click or Escape and preserves nested-popover ordering.

```svelte example id="popover-basic"
<script lang="ts">
  import { Popover } from '$lib'
  import type { Placement } from '$lib/utils'

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

`escape={false}` switches to a manual popover so Escape remains with the page, `dismiss_on="press"` opts into press-time custom dismissal, and `trap_focus={false}` leaves focus where it is. `strategy="absolute"` survives a transformed ancestor at the cost of tracking page scroll, and `match_width` sizes the surface to the trigger for dropdown-like menus. Set `role` to `listbox`, `tree` or `grid` when appropriate; the trigger mirrors it in `aria-haspopup` and only sets `aria-controls` while the surface is mounted. Use `ActionMenu` rather than `role="menu"` when you need complete ARIA menu keyboard behavior.

Use `trigger_mode="hover"` or `trigger_mode="focus"` for non-click interactions. Hover mode also opens on focus, and `open_delay_ms`/`close_delay_ms` keep the surface stable while the pointer crosses from its trigger. Non-click modes default to a 150 ms close delay.

```svelte example id="popover-hover"
<script lang="ts">
  import { Popover } from '$lib'
</script>

<Popover trigger_mode="hover" open_delay_ms={150} close_delay_ms={250} trap_focus={false}>
  {#snippet trigger(props)}
    <button {...props}>Hover or focus</button>
  {/snippet}
  <a href="https://svelte.dev">Interactive content stays open while focused.</a>
</Popover>
```

### `ActionMenu`

Render a `trigger` snippet for a button-anchored dropdown, or pass a region as children
to replace its browser right-click menu. Actions are
[`CmdAction`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/types.ts)s,
the same shape `CommandMenu` takes, so a command can appear in both.

```svelte example id="action-menu-basic"
<script lang="ts">
  import { ActionMenu } from '$lib'
  import type { CmdAction } from '$lib/types'

  let log = $state<string[]>([])
  const record = (label: string) => (log = [label, ...log].slice(0, 4))
  const actions: CmdAction[] = [
    { label: `Cut`, shortcut: `mod+x`, action: record },
    { label: `Copy`, shortcut: `mod+c`, action: record },
    { label: `Paste`, shortcut: `mod+v`, action: record },
    { label: `Delete`, action: record, disabled: true },
  ]
</script>

<ActionMenu {actions} match_width>
  {#snippet trigger(props)}
    <button {...props}>Edit actions</button>
  {/snippet}
</ActionMenu>
<button type="button">After menu</button>

<ActionMenu {actions}>
  <div class="demo-box" style="display: grid; place-items: center; height: 8em">
    Right-click me
  </div>
</ActionMenu>

<ol>
  {#each log as entry, idx (idx)}<li>{entry}</li>{/each}
</ol>
```

Both forms share the same menu semantics: Arrow keys walk the items (skipping disabled ones and wrapping at both ends), Home and End jump to either end, Tab/Shift+Tab close and continue after/before the trigger, and the browser closes on Escape or an outside interaction. The trigger form supports `bind:open`, `placement`, `align`, `offset`, `padding`, `match_width` and `strategy`.

In context mode, drop the region and the whole page qualifies; `trigger="none"` installs no right-click handler, so you can bind `at` and open from a long-press or keyboard shortcut. The default `dismiss` policy uses native light dismissal; `dismiss_on: 'press'`, `escape: false`, `enabled: false`, `inside`, or `scope` selects the custom [`click_outside`](attachments/click-outside) path. An `item` snippet renders rows your own way.
