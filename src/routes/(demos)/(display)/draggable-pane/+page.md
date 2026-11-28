## DraggablePane

A toggle button and the floating panel it opens. Drag it by the grip on its tab, resize it from the gutter along its right and bottom edges, and reset it back under the toggle once you have moved it. It composes three attachments: [`draggable`](attachments/draggable) moves it, [`resizable`](attachments/resizable) sizes it, and [`click_outside`](attachments/click-outside) takes it away.

Use it for export options, plot controls or a settings panel hanging off a widget's corner, where a modal is too heavy and a dropdown too small.

```svelte example id="draggable-pane-basic"
<script lang="ts">
  import DraggablePane from 'svelte-widgets/DraggablePane.svelte'
  import { Toggle } from 'svelte-widgets'

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
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); position: relative; height: 22em; margin-block: 1em; padding: 6pt; display: flex; justify-content: flex-end"
>
  <DraggablePane
    bind:open
    bind:persistent
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

`on_open` and `on_close` report each change once with its cause: `trigger` (the toggle), `close` (the close button), `pointer`, `escape`, or `programmatic` for a change to the bound `open`. Mounting reports nothing.

The `children` snippet receives `{ open, show_controls, has_been_dragged, dragging }`, so content can react to the pane's chrome, e.g. pause an animation while the pane is dragged.

The pane carries `toc-exclude`, so headings in its content stay out of a page's [`Toc`](toc).

### Custom toggle content

`open_icon` and `closed_icon` select bundled icons. The `toggle` snippet (same state as `children`) replaces the button's _content_ with anything, such as an SVG, a label or an external icon; the component still owns the button, anchor geometry, `aria-expanded` and click handling.

```svelte example id="draggable-pane-toggle"
<script lang="ts">
  import DraggablePane from 'svelte-widgets/DraggablePane.svelte'
</script>

<div
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); position: relative; height: 10em; padding: 6pt; display: flex; justify-content: flex-end"
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

`persistent` drops only the press-outside dismissal. It is bindable, and the pin button on the pane's tab toggles it. Escape still closes it, as does the close button that appears on its tab once moved. Escape is layered: a pane opened from inside a dialog closes before the dialog does.

### Positioning

`position="absolute"` (the default) places the pane against the nearest positioned ancestor, so it scrolls with the page. `position="fixed"` measures against the viewport instead, which escapes an `overflow: hidden` ancestor and clamps the pane's top edge so at least 180px of it stays reachable, capping `--pane-viewport-clamp` to the space that remains below.

```svelte example id="draggable-pane-fixed"
<script lang="ts">
  import DraggablePane from 'svelte-widgets/DraggablePane.svelte'
</script>

<div
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); height: 6em; overflow: hidden; padding: 6pt; display: flex; justify-content: flex-end"
>
  <DraggablePane position="fixed" resize="height" max_width="320px">
    {#snippet children()}
      <p style="margin: 0">This pane escapes the clipped box its toggle lives in.</p>
    {/snippet}
  </DraggablePane>
</div>
```

### Styling

CSS custom properties on the pane: `--pane-bg`, `--pane-color`, `--pane-border`, `--pane-radius`, `--pane-box-shadow`, `--pane-width`, `--pane-min-height`, `--pane-max-height`, `--pane-padding`, `--pane-gap`, `--pane-align-content`, `--pane-overflow-x`, `--pane-overflow-y`, `--pane-z-index`, `--pane-control-tab-z-index`, plus `--pane-toggle-*` for the button. `pane_props` and `toggle_props` spread onto the two elements for anything else.

Content gets compact control defaults for headings, rules, labels, buttons and tables at `.draggable-pane :where(...)` specificity (0,1,0): above a host's bare `button {}` rule, below any component or class selector, so restyling them takes one class. Text inputs and selects get theirs at (0,0,0), so any rule sizing fields wins. `--pane-h4-margin` and `--pane-h4-font-size` size section headings; buttons take the host's `--btn-bg` and `--btn-bg-hover`.

The pane also carries `data-resize` and `data-dragging`, so content underneath can react without a prop, e.g. `[data-dragging='true'] canvas { pointer-events: none }`. Both, plus `role` and `aria-modal`, are applied after the `pane_props` spread so they cannot be clobbered. `aria-label` is applied before it, so a page holding more than one pane names them apart with `pane_props={{ 'aria-label': 'Structure controls' }}`.
