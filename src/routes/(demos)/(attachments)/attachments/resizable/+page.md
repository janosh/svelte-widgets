## `resizable`

`resizable` adds invisible edge handles and reports the resulting dimensions. Double-click an enabled edge to clear the size written by the attachment.

```svelte example id="attachments-resizable"
<script lang="ts">
  import { resizable } from '$lib/attachments'

  let dimensions = $state({ width: 240, height: 120 })
</script>

<div
  style="position: relative; width: 240px; height: 120px; padding: 1rem; border: 1px solid currentColor"
  {@attach resizable({
    edges: [`right`, `bottom`, `left`],
    min_width: 160,
    min_height: 80,
    on_resize: (_event, next) => (dimensions = next),
  })}
>
  Resize from three edges: {Math.round(dimensions.width)} × {Math.round(
    dimensions.height,
  )}
</div>
```
