## `portal`

`portal` moves existing DOM into another container and restores its original position on teardown.

```svelte example id="attachments-portal"
<script lang="ts">
  import { portal } from '$lib/attachments'

  let target = $state<HTMLElement | null>(null)
</script>

<div
  bind:this={target}
  style="min-height: 3rem; padding: 0.5rem; border: 1px dashed currentColor"
>
  Portal target:
</div>
<strong {@attach portal(target)}>I render inside the target.</strong>
```
