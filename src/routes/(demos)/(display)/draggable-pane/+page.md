## DraggablePane

A toggle button and the floating panel it opens. Drag it by the grip on its tab, resize
it from the gutter along its right and bottom edges, and reset it back under the toggle
once you have moved it. It composes three attachments rather than reimplementing them:
[`draggable`](attachments/draggable) moves it, `resizable` sizes it, and
[`click_outside`](attachments/click-outside) takes it away.

Use it for anything that hangs off a control in the corner of a widget — export
options, plot controls, a settings panel — where a modal would be too heavy and a
dropdown too small.

```svelte example id="draggable-pane-basic"
<script lang="ts">
  import DraggablePane from '$lib/DraggablePane.svelte'
  import { Toggle } from '$lib'

  let [open, persistent] = $state([false, false])
  let resize = $state<`both` | `width` | `height` | `none`>(`both`)
  let last_close = $state(``)
</script>

<div style="display: flex; gap: 2em; align-items: center; flex-wrap: wrap">
  <label>
    Resize
    <select bind:value={resize}>
      {#each [`both`, `width`, `height`, `none`] as mode (mode)}<option>{mode}</option
        >{/each}
    </select>
  </label>
  <label>Persistent <Toggle bind:checked={persistent} /></label>
  {#if last_close}<small>last closed via <code>{last_close}</code></small>{/if}
</div>

<div
  class="demo-box"
  style="position: relative; height: 22em; margin-block: 1em; padding: 6pt; display: flex; justify-content: flex-end"
>
  <DraggablePane
    bind:open
    {persistent}
    {resize}
    on_close={({ via }) => (last_close = via)}
    toggle_props={{ title: `Pane options` }}
  >
    {#snippet children({ has_been_dragged, dragging })}
      <h4 style="margin: 0">Pane options</h4>
      <label>Name <input placeholder="type something" /></label>
      <label>Amount <input type="range" /></label>
      <p style="margin: 0; font-size: 0.85em; opacity: 0.7">
        dragged: {has_been_dragged} · dragging: {dragging}
      </p>
    {/snippet}
  </DraggablePane>
</div>
```

The `children` snippet receives `{ open, show_controls, has_been_dragged, dragging }`,
so content can react to the pane's own chrome — pausing an animation while the pane is
being dragged over it, for instance.

The pane carries `toc-exclude`, so headings in its content stay out of a page's
[`Toc`](toc) — a pane is floating chrome, not page structure.

### Custom toggle content

`open_icon` and `closed_icon` pick from the icons this library bundles. For anything else
— your own SVG, a label, an icon set we don't ship — the `toggle` snippet replaces the
button's _content_ while the button, and with it the anchor geometry, `aria-expanded` and
click handling, stays with the component. It receives the same state as `children`.

```svelte example id="draggable-pane-toggle"
<script lang="ts">
  import DraggablePane from '$lib/DraggablePane.svelte'
</script>

<div
  class="demo-box"
  style="position: relative; height: 10em; padding: 6pt; display: flex; justify-content: flex-end"
>
  <DraggablePane toggle_props={{ title: `Layer info` }}>
    {#snippet toggle({ open })}
      <span style="font-size: 0.8em; padding: 0 2pt">{open ? `Hide` : `Info`}</span>
    {/snippet}
    {#snippet children()}
      <p style="margin: 0">Text, an inline SVG, an icon from another set — anything.</p>
    {/snippet}
  </DraggablePane>
</div>
```

### Persistent panes

`persistent` drops the press-outside dismissal only. Escape still closes the pane, as
does the close button that appears on its tab once you move it, so there is always a way
out. Escape is layered: a pane opened from inside a dialog closes before the dialog
does.

### Positioning

`position="absolute"` (the default) places the pane against the nearest positioned
ancestor, so it scrolls with the page. `position="fixed"` measures against the viewport
instead, which escapes an `overflow: hidden` ancestor and clamps the pane's top edge so
at least 180px of it stays reachable, capping `--pane-viewport-clamp` to the space that
remains below.

```svelte example id="draggable-pane-fixed"
<script lang="ts">
  import DraggablePane from '$lib/DraggablePane.svelte'
</script>

<div
  class="demo-box"
  style="height: 6em; overflow: hidden; padding: 6pt; display: flex; justify-content: flex-end"
>
  <DraggablePane position="fixed" resize="height" max_width="320px">
    {#snippet children()}
      <p style="margin: 0">This pane escapes the clipped box its toggle lives in.</p>
    {/snippet}
  </DraggablePane>
</div>
```

### Styling

Everything hangs off CSS custom properties on the pane: `--pane-bg`, `--pane-border`,
`--pane-border-radius`, `--pane-box-shadow`, `--pane-width`,
`--pane-min-height`, `--pane-max-height`, `--pane-padding`, `--pane-gap`,
`--pane-align-content`, `--pane-overflow-x`, `--pane-overflow-y`, `--pane-z-index`,
`--pane-control-tab-z-index`, plus `--pane-toggle-*` for the button. `pane_props` and
`toggle_props` spread onto the two elements for anything else.

The pane also carries `data-resize` and `data-dragging`, so content underneath can react
without a prop — `[data-dragging='true'] canvas { pointer-events: none }`, say. Both, plus
`role` and `aria-modal`, are applied after the `pane_props` spread so they cannot be
clobbered. `aria-label` is applied before it, so a page holding more than one pane names
them apart with `pane_props={{ 'aria-label': 'Structure controls' }}`.
