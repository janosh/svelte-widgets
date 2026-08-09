## `draggable`

```svelte example id="attachments-draggable"
<script lang="ts">
  import { draggable } from '$lib/attachments'

  let last_drag: string = $state('')
</script>

<div class="drag-area">
  <!-- Absolute positioned box → default handle is the node itself -->
  <div
    class="drag-box"
    style="position: absolute; left: 1rem; top: 1rem"
    {@attach draggable({
      on_drag: (event: PointerEvent) =>
        (last_drag = `${event.clientX}, ${event.clientY}`),
    })}
  >
    Drag me
    <small style="display: block; opacity: 0.7">this text is also draggable</small>
  </div>

  <!-- Second draggable with custom handle and callbacks -->
  <div
    class="drag-box"
    style="position: absolute; left: 12rem; top: 8rem; width: 14rem"
    {@attach draggable({
      handle_selector: `.drag-handle`,
      on_drag_start: () => (last_drag = `start`),
      on_drag: (event: PointerEvent) =>
        (last_drag = `${event.clientX}, ${event.clientY}`),
      on_drag_end: () => (last_drag = `end`),
    })}
  >
    <div class="drag-handle">Drag with custom callbacks</div>
    <small style="display: block; opacity: 0.7">this text is not draggable</small>
  </div>
</div>

<p>last pointer: {last_drag || '—'}</p>

<style>
  .drag-area {
    position: relative;
    height: 40vh;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    margin: 1rem 0;
    overflow: hidden;
  }
  .drag-box {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 0.6em 0.8em;
    width: max-content;
  }
</style>
```
