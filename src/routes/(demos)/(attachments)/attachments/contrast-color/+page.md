## `contrast_color`

`contrast_color` chooses between two foregrounds using the painted background behind the element when the attachment initializes. It does not observe later CSS or ancestor changes; pass a changing `bg_color` option or reattach when the background changes.

The lighter of the two `choices` wins whenever it reaches `min_ratio` (default 4.5:1, WCAG AA for body text), otherwise the one with the higher contrast. `pick_contrast_color` makes the same choice without an element, judging a translucent `bg_color` over `backdrop` (default white), and `contrast_ratio` returns the WCAG ratio of any two CSS colors.

```svelte example id="attachments-contrast-color"
<script lang="ts">
  import { contrast_color } from 'svelte-widgets/attachments'

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
