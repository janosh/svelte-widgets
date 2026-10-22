## `float`

Parks an element next to an anchor and keeps it there while the page scrolls or resizes. The geometry — flip to the side that fits, then shift to stay on screen — comes from `compute_position` in `svelte-widgets/utils`, which the tooltip and the portalled dropdown also use. The anchor can be a plain rect instead of an element, which is how `ActionMenu` hangs its context form off the pointer.

```svelte example id="attachments-float"
<script lang="ts">
  import { float } from 'svelte-widgets/attachments'
  import type { Placement } from 'svelte-widgets/utils'

  let anchor = $state<HTMLElement | null>(null)
  let placement = $state<Placement>(`bottom`)
</script>

<label for="float-placement">Placement</label>
<select id="float-placement" bind:value={placement}>
  {#each [`top`, `right`, `bottom`, `left`] as side (side)}<option>{side}</option>{/each}
</select>

<div style="display: grid; place-items: center; height: 12em">
  <span bind:this={anchor} style="padding: 1ex 1em; border: 1px dashed gray">anchor</span>
</div>

<div
  style="background: teal; color: white; padding: 2pt 6pt; border-radius: 4pt"
  {@attach float({ anchor, placement, offset: 8, padding: 8 })}
>
  floating
</div>
```

## `anchored_popover`

For a dropdown whose trigger and markup you own, `anchored_popover` shows the element as a native auto popover floated beside its button: the top layer escapes overflow clipping and stacking contexts, the browser owns light dismissal, and the button becomes the invoker, so pressing it again toggles rather than dismissing and reopening. Escape closes the innermost one first and returns focus to the button. `on_close` reports every close; unmounting closes silently. Pair it with `out:close_before_removal` so the popover leaves the top layer before Svelte removes it. `Popover` is the batteries-included alternative that also renders the trigger and traps focus.

```svelte example id="attachments-anchored-popover"
<script lang="ts">
  import { anchored_popover, close_before_removal } from 'svelte-widgets/attachments'

  let open = $state(false)
  let trigger = $state<HTMLButtonElement>()
  let picked = $state(`none`)
</script>

<button bind:this={trigger} onclick={() => (open = !open)} aria-expanded={open}>
  Pick a fruit ({picked})
</button>
{#if open}
  <div
    role="menu"
    style="display: grid; padding: 4pt; border: 1px solid gray; background: Canvas"
    out:close_before_removal
    {@attach anchored_popover({ anchor: trigger, on_close: () => (open = false) })}
  >
    {#each [`apple`, `pear`, `plum`] as fruit (fruit)}
      <button role="menuitem" onclick={() => ((picked = fruit), (open = false))}
        >{fruit}</button
      >
    {/each}
  </div>
{/if}
```
