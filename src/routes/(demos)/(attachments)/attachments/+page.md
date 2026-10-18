<script lang="ts">
  import CategoryOverview from '#site/CategoryOverview.svelte'
</script>

<CategoryOverview name="attachments" />

## Quick start

Every attachment is a function you call and spread onto an element. They compose freely, so a surface can be positioned, dismissed and trapped at once:

```svelte
<script lang="ts">
  import { click_outside, float, focus_trap } from 'svelte-widgets/attachments'

  let open = $state(false)
  let anchor = $state<HTMLElement>()
</script>

<button bind:this={anchor} onclick={() => (open = true)}>Open</button>

{#if open}
  <div
    {@attach float({ anchor })}
    {@attach focus_trap()}
    {@attach click_outside({ callback: () => (open = false) })}
  >
    …
  </div>
{/if}
```

Positioning for `tooltip`, `float` and the portalled dropdown all comes from one `compute_position` helper, so a flip near a viewport edge behaves the same wherever it happens.
