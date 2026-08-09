## `float`

Parks an element next to an anchor and keeps it there while the page scrolls or
resizes. The geometry — flip to the side that fits, then shift to stay on screen —
comes from `compute_position` in `svelte-widgets/utils`, which the tooltip and the
portalled dropdown also use. The anchor can be a plain rect instead of an element,
which is how `ContextMenu` hangs a menu off the pointer.

```svelte example id="attachments-float"
<script lang="ts">
  import { float } from '$lib/attachments'
  import type { Placement } from '$lib/utils'

  let anchor = $state<HTMLElement | null>(null)
  let placement = $state<Placement>(`bottom`)
</script>

<select bind:value={placement}>
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
