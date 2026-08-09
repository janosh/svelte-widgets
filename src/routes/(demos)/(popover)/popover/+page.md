## Popover & ContextMenu

Two surfaces built from the same three attachments: [`float`](attachments/float) puts
them where they fit, [`click_outside`](attachments/click-outside) takes them away, and
[`focus_trap`](attachments/focus-trap) owns the keyboard while they are up.

### `Popover`

The `trigger` snippet receives the attributes to spread onto whatever you want to open
it with — the click handler and the `aria-expanded`/`aria-haspopup`/`aria-controls`
wiring. Dismissal happens on the press, so a right-click anywhere else closes it too,
and Escape closes the innermost surface only.

```svelte example id="popover-basic"
<script lang="ts">
  import { Popover } from '$lib'
  import type { Placement } from '$lib/utils'

  let placement = $state<Placement>(`bottom`)
  let last_close = $state(``)
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
  </Popover>

  <Popover placement="right" align="start">
    {#snippet trigger(props)}
      <button {...props}>Second popover</button>
    {/snippet}
    <p style="margin: 0">Escape closes whichever one you opened last.</p>
  </Popover>

  {#if last_close}<small>last closed via <code>{last_close}</code></small>{/if}
</div>
```

`escape={false}` and `trap_focus={false}` opt out of those behaviors,
`strategy="absolute"` survives a transformed ancestor at the cost of tracking page
scroll, and `match_width` sizes the surface to the trigger for dropdown-like menus.
Set `role` to `menu`, `listbox`, `tree` or `grid` when appropriate; the trigger mirrors it in `aria-haspopup` and only sets `aria-controls` while the surface is mounted.

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

### `ContextMenu`

Right-click a region to replace the browser's own menu. Actions are
[`CmdAction`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/types.ts)s,
the same shape `CommandMenu` takes, so a command can appear in both.

```svelte example id="context-menu-basic"
<script lang="ts">
  import { ContextMenu } from '$lib'
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

<ContextMenu {actions}>
  <div class="demo-box" style="display: grid; place-items: center; height: 8em">
    Right-click me
  </div>
</ContextMenu>

<ol>
  {#each log as entry, idx (idx)}<li>{entry}</li>{/each}
</ol>
```

Arrow keys walk the items (skipping disabled ones and wrapping at both ends), Home and
End jump to either end, Tab stays inside, and Escape or a press anywhere else closes.

Drop the region and the whole page qualifies, `trigger="none"` neither — bind `at` and
open the menu yourself from a long-press, a keyboard shortcut or a trigger that must
record _what_ was clicked. `dismiss` merges over the default `{ escape: true }` to reach
the whole [`click_outside`](attachments/click-outside) config, and an `item` snippet
renders rows your own way.
