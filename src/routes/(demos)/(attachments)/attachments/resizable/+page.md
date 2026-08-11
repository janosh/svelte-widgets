## `resizable`

`resizable` adds edge and corner handles and reports the resulting dimensions. Drag a
corner with Shift to preserve the aspect ratio. Edge handles are keyboard-focusable:
arrows resize by 10px, Shift+arrow by 50px, and Enter resets the size. Double-clicking an
enabled edge or corner also resets it.

```svelte example id="attachments-resizable"
<script lang="ts">
  import { resizable } from '$lib/attachments'

  let dimensions = $state({ width: 240, height: 120 })
</script>

<div
  style="position: relative; width: 240px; height: 120px; padding: 1rem; border: 1px solid currentColor"
  {@attach resizable({
    edges: [`top`, `right`, `bottom`, `left`],
    min_width: 160,
    min_height: 80,
    max_width: (node) => Math.min(520, node.parentElement?.clientWidth ?? 520),
    max_height: 280,
    on_resize: (_event, next) => (dimensions = next),
    on_resize_reset: (_event, next) => (dimensions = next),
  })}
>
  Resize from any edge or corner: {Math.round(dimensions.width)} × {Math.round(
    dimensions.height,
  )}
</div>
```
