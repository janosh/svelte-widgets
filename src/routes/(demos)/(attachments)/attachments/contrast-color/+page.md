## `contrast_color`

`contrast_color` chooses between two foregrounds using the painted background behind the element when the attachment initializes. It does not observe later CSS or ancestor changes; pass a changing `bg_color` option or reattach when the background changes.

```svelte example id="attachments-contrast-color"
<script lang="ts">
  import { contrast_color } from '$lib/attachments'

  const colors = [`#f7d154`, `#1769aa`, `oklch(45% 0.2 25)`]
</script>

<div style="display: flex; gap: 0.5rem">
  {#each colors as background}
    <span
      style:background
      style="padding: 0.6rem; border-radius: 4pt"
      {@attach contrast_color()}
    >
      {background}
    </span>
  {/each}
</div>
```
