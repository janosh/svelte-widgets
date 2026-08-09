## Attachments

Exported from `svelte-widgets/attachments`:

- [`tooltip`](#tooltip)
- [`draggable`](#draggable)
- [`resizable`](#resizable)
- [`sortable`](#sortable)
- [`highlight_matches`](#highlight_matches)
- [`click_outside`](#click_outside)
- [`dismiss_on_outside_press`](#dismiss_on_outside_press)
- [`backdrop_dismiss`](#backdrop_dismiss)
- [`focus_trap`](#focus_trap)
- [`hotkey`](#hotkey)
- [`float`](#float)
- [`portal`](#portal)
- [`contrast_color`](#contrast_color)
- [`forward_window_keydown`](#forward_window_keydown)
- [`file_drop`](#file_drop)

### `tooltip`

```svelte example id="attachments-tooltip"
<script lang="ts">
  import { tooltip } from '$lib/attachments'

  let custom_delay_ms = $state(0)
</script>

<div style="display: flex; gap: 3em">
  <button
    aria-label="More info"
    style="padding: 0.4em 0.8em"
    {@attach tooltip({
      content: `<strong>Custom</strong> <em>HTML</em> tooltip`,
      placement: `right`,
      delay_ms: custom_delay_ms,
      // only enable allow_html for trusted or sanitized content, never raw
      // user input — HTML tooltips are an XSS vector otherwise
      allow_html: true,
    })}
  >
    Hover me
  </button>

  <label style="display: inline-flex; gap: 0.5em; align-items: center">
    Delay (ms)
    <input
      type="number"
      min="0"
      step="50"
      bind:value={custom_delay_ms}
      style="width: 6em"
    />
  </label>
</div>

<!-- Placement showcase -->
<div style="display: flex; gap: 1em; margin: 2em 0">
  <button {@attach tooltip({ content: `Top`, placement: `top` })}> Top </button>
  <button {@attach tooltip({ content: `Right`, placement: `right` })}> Right </button>
  <button {@attach tooltip({ content: `Bottom (default)`, placement: `bottom` })}>
    Bottom
  </button>
  <button {@attach tooltip({ content: `Left`, placement: `left` })}> Left </button>
</div>

<!-- Style variations via CSS variables to demonstrate customization -->
<div style="display: flex; gap: 1em; margin: 2em 0">
  <button
    style="--tooltip-bg: white; --text-color: #111; --tooltip-border: 1px solid rgba(0, 0, 0, 0.18); --tooltip-font-size: 12px; --tooltip-arrow-size: 5; --tooltip-opacity: 0.95"
    {@attach tooltip({ content: `Light tooltip`, placement: `top` })}
  >
    Light style
  </button>
  <button
    style="--tooltip-bg: #0f2a43; --text-color: #d7ecff; --tooltip-border: 1px solid rgba(0, 128, 255, 0.4); --tooltip-shadow: drop-shadow(0 4px 12px rgba(0, 128, 255, 0.25)); --tooltip-font-size: 14px; --tooltip-arrow-size: 8; --tooltip-opacity: 1"
    {@attach tooltip({ content: `Info tooltip`, placement: `right` })}
  >
    Info style
  </button>
  <button
    style="--tooltip-bg: rgba(255, 50, 50, 0.9); --text-color: white; --tooltip-border: 1px solid rgba(255, 50, 50, 0.9); --tooltip-radius: 3px; --tooltip-font-size: 12px; --tooltip-arrow-size: 10; --tooltip-opacity: 0.9"
    {@attach tooltip({ content: `Warning tooltip`, placement: `bottom` })}
  >
    Warning tooltip
  </button>
  <button
    style="--tooltip-bg: white; --text-color: #111; --tooltip-border: 1px solid rgba(255, 255, 255, 0.15); --tooltip-font-size: 16px; --tooltip-arrow-size: 12; --tooltip-padding: 10px 12px"
    {@attach tooltip({ content: `Large text + big arrow`, placement: `left` })}
  >
    Large text
  </button>
</div>

<div style="display: flex; gap: 1em; margin: 2em 0">
  <button
    style="--tooltip-bg: #2d3748; --text-color: #e2e8f0; --tooltip-border: 2px solid #4299e1; --tooltip-arrow-size: 8"
    {@attach tooltip({
      content: `Custom style + border arrow`,
      placement: `top`,
      style: `box-shadow: 0 10px 25px rgba(66, 153, 225, 0.3); transform: scale(1.05);`,
    })}
  >
    Custom style
  </button>
  <button
    style="--tooltip-bg: #f56565; --text-color: white; --tooltip-border: 1px solid #c53030"
    {@attach tooltip({ content: `Disabled tooltip`, disabled: true })}
  >
    Disabled (no tooltip)
  </button>
  <button
    style="--tooltip-bg: #48bb78; --text-color: white; --tooltip-border: 3px solid #38a169; --tooltip-arrow-size: 12"
    {@attach tooltip({
      content: `Thick border with matching arrow`,
      placement: `bottom`,
      style: `font-weight: bold; letter-spacing: 0.5px;`,
    })}
  >
    Thick border
  </button>
</div>
<!-- Attach once to a container: children with title/aria-label/data-title get their own tooltip -->
<div style="display: flex; gap: 1em; margin: 2em 0" {@attach tooltip()}>
  <button title="Added via title attribute">Title-based</button>
  <button aria-label="Added via aria-label">aria-label</button>
  <button data-title="Added via data-title">data-title</button>
</div>

<!-- Text wrapping and shrink-to-fit width demo -->
<div style="display: flex; gap: 1em; margin: 2em 0; flex-wrap: wrap">
  <button
    style="--tooltip-max-width: 200px"
    {@attach tooltip({
      content: `This tooltip uses balanced text wrapping for even line lengths`,
      placement: `top`,
    })}
  >
    Balanced wrapping
  </button>
  <button
    style="--tooltip-max-width: 220px"
    {@attach tooltip({
      content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`,
      placement: `bottom`,
    })}
  >
    Long text shrink-to-fit
  </button>
</div>

<!-- Long word shrink-to-fit demo: tooltip contracts when long words cause early wrapping -->
<div style="display: flex; gap: 1em; margin: 2em 0; flex-wrap: wrap">
  <button
    {@attach tooltip({
      content: `Donaudampfschifffahrtsgesellschaftskapitän is a German compound word`,
      placement: `top`,
    })}
  >
    Long German word
  </button>
  <button
    {@attach tooltip({
      content: `pneumonoultramicroscopicsilicovolcanoconiosis is very long`,
      placement: `bottom`,
    })}
  >
    Medical term
  </button>
  <button
    {@attach tooltip({
      content: `supercalifragilisticexpialidocious sounds quite atrocious`,
      placement: `right`,
    })}
  >
    Mary Poppins
  </button>
  <button
    {@attach tooltip({ content: `antidisestablishmentarianism`, placement: `left` })}
  >
    Single long word
  </button>
</div>

<style>
  button {
    padding: 0.35em 0.7em;
  }
</style>
```

#### Reactive Tooltip Content

Tooltip content updates reactively via `MutationObserver` when `title`, `aria-label`, or `data-title` changes:

```svelte example id="attachments-tooltip-reactive"
<script lang="ts">
  import { tooltip } from '$lib/attachments'
  let text = $state(`Edit me!`)
</script>

<input bind:value={text} style="width: 16ch" />
<button title={text} {@attach tooltip({ placement: `right` })}>Hover me</button>
```

### `draggable`

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

### `highlight_matches`

```svelte example id="attachments-highlight"
<script lang="ts">
  import { highlight_matches } from '$lib/attachments'

  let search_text = $state('')
  let disabled = $state(false)

  // Only highlight inside .target; skip any node inside .no-hl
  const node_filter = (node: Node): number =>
    node.parentElement?.closest('.no-hl')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT
</script>

<div style="display: inline-flex; gap: 0.6em; align-items: center">
  <label for="highlight-search">Search</label>
  <input
    id="highlight-search"
    placeholder="type to highlight..."
    bind:value={search_text}
    style="min-width: 16ch"
  />
  <input id="toggle-disabled" type="checkbox" bind:checked={disabled} />
  <label for="toggle-disabled">disabled</label>
</div>

<article
  class="target"
  {@attach highlight_matches({
    query: search_text.toLowerCase(),
    disabled,
    node_filter,
    scroll_to_match: false,
  })}
>
  <p>
    This paragraph highlights matches inside text and inline elements. Try words like
    <em>ancient</em> or <strong>giant</strong>.
  </p>
  <p class="no-hl" style="opacity: 0.7">This line is excluded via node_filter.</p>
</article>

<style>
  /* Style the CSS Highlight API range */
  ::highlight(highlight-match) {
    background: rgba(255, 230, 0, 0.35);
    outline: 1px solid rgba(255, 230, 0, 0.8);
  }
  .target {
    margin: 0.75rem 0;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
  }
</style>
```

Use `css_class` to select a custom `::highlight()` rule, `duration_ms` to remove matches
automatically, and `on_highlight` for optional range-based effects.
`scroll_to_match` scrolls the first match smoothly into view by default; set it to `false`
to keep the viewport fixed or pass custom `ScrollIntoViewOptions`. `on_highlight` still
receives ranges without the CSS Highlight API and reruns when observed content changes.

### `click_outside`

```svelte example id="attachments-click-outside"
<script lang="ts">
  import { click_outside, tooltip } from '$lib/attachments'

  let open_menu = $state(false)
</script>

<div class="menu">
  <button
    class="toggle"
    onclick={() => (open_menu = !open_menu)}
    {@attach tooltip({ content: 'Toggle menu', placement: 'top' })}
  >
    Menu
  </button>

  {#if open_menu}
    <ul
      class="dropdown"
      style="list-style: none; margin: 0"
      {@attach click_outside({
        inside: ['.toggle'],
        escape: true,
        callback: () => (open_menu = false),
      })}
    >
      <li><a href="#one">First</a></li>
      <li><a href="#two">Second</a></li>
      <li>
        <a href="#noop" class="toggle">Clicking me won’t close (counts as inside)</a>
      </li>
    </ul>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: inline-block;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    min-width: 12rem;
    z-index: 2;
  }
  .dropdown a {
    color: var(--text-color);
    text-decoration: none;
    display: block;
    padding: 0.2rem 0;
  }
  .dropdown a:hover {
    text-decoration: underline;
  }
</style>
```

Dismissal happens on `pointerdown`, not `click`, so a right-click or a press the OS
turns into a window drag still closes the surface. Presses that land in a scrollbar
gutter are ignored, so reaching for the scrollbar does not close what you are
scrolling toward. A surface floating over something draggable can pass
`dismiss_on: 'release'` to wait for the click instead, so starting a pan behind it
does not make it vanish mid-drag, and a right-click leaves it standing. `release` is
also what lets an outside `<input type="checkbox" bind:checked={open}>` close the
surface: dismissing on the press writes `checked=false` back to the DOM before the
click, whose pre-click activation flips it to true again for the binding to commit,
reopening what the user just closed. Both modes dismiss from the capture phase, ahead of
the pressed element's own handlers, so a control that toggles the surface from its own
click handler belongs in `inside` — as does an outside trigger that opens on
`pointerdown`, whose own click would otherwise dismiss under `release`.

Pass `inside` for regions that count as inside though they sit outside the node:
elements for portalled content the node no longer contains, selectors for triggers.
`scope` confines the selector entries to one subtree when several instances of a
component share trigger selectors, and `escape: true` also dismisses on Escape. Escape
dismisses one surface at a time — the most recently attached one — so a dropdown
inside a modal closes the dropdown and leaves the modal standing.

`callback` receives `(node, config, detail)` and the node also fires a `dismiss`
event carrying the same `detail` of `{ focus_inside, via, event }`. `focus_inside`
tells an Escape handler whether to move focus back to the trigger, and `event` is the
press or keydown behind the dismissal, to forward to your own close handler.

### `focus_trap`

Keeps Tab inside a surface and hands the keyboard back when it closes — the other half
of what `click_outside` starts. Nested traps stack like Escape layers: only the
innermost one steers Tab.

```svelte example id="attachments-focus-trap"
<script lang="ts">
  import { click_outside, focus_trap } from '$lib/attachments'

  let open = $state(false)
  let trigger = $state<HTMLButtonElement | null>(null)
</script>

<button bind:this={trigger} onclick={() => (open = true)}>Open panel</button>

{#if open}
  <div
    role="dialog"
    aria-label="Trapped panel"
    style="display: grid; gap: 6pt; max-width: 20em; margin-top: 1ex; padding: 1ex 1em; border: 1px solid gray; border-radius: 5pt"
    {@attach focus_trap({ restore: trigger })}
    {@attach click_outside({ escape: true, callback: () => (open = false) })}
  >
    <input placeholder="Tab cycles between these" />
    <input placeholder="…and never leaves the panel" />
    <button onclick={() => (open = false)}>Close</button>
  </div>
{/if}
```

`initial` picks the entry point (an element, a selector, or `false` to leave focus
alone) and `restore` the exit point, defaulting to whatever held focus when the trap
went up. `include` extends the trap over portalled parts of the same surface.

`root` narrows the trap to a descendant, for a node that wraps the surface together with
siblings Tab must not reach — a modal's backdrop button above all. Element, selector or
function returning either, resolved per keystroke like `click_outside`'s `scope`, so a
selector matches markup rendered after setup and a function covers a `bind:this` still
null then; `initial` resolves within it. `on_escape` joins the layer stack `click_outside`
uses, so only the innermost trap hears the key, and cancels it, keeping a native
`<dialog>` around the surface open until a second Escape lands with the layer gone.
`recapture` pulls focus back to where it last sat inside whenever something outside takes
it. All three are off unless asked for: the attached node is the trap and Escape passes
through untouched.

```svelte
<div
  class="dialog-layer"
  {@attach focus_trap({ root: `.dialog`, on_escape: on_close, recapture: true })}
>
  <button class="dialog-backdrop" onclick={on_close}></button>
  <section class="dialog" role="dialog" aria-modal="true">…</section>
</div>
```

### `hotkey`

Declarative keybindings over the same matcher `CommandMenu` uses. `mod` is Cmd on Apple
keyboards and Ctrl elsewhere. Bare keys stay out of the way while you type in a field;
chords always fire.

```svelte example id="attachments-hotkey"
<script lang="ts">
  import { hotkey } from '$lib/attachments'

  let log = $state<string[]>([])
  const record = (label: string) => (log = [label, ...log].slice(0, 5))
</script>

<input
  placeholder="mod+b works here, ? does not, Enter does"
  {@attach hotkey({
    global: true,
    bindings: [
      { keys: `mod+b`, handler: () => record(`bold`) },
      { keys: [`?`, `shift+/`], handler: () => record(`help`) },
      { keys: `Enter`, handler: () => record(`submit`), allow_in_inputs: true },
    ],
  })}
/>
<ol style="margin: 6pt 0 0">
  {#each log as entry, idx (idx)}<li>{entry}</li>{/each}
</ol>
```

Pass `global: false` (the default) to scope a binding to the node it is attached to, so
a shortcut dies with the surface that owns it.

### `float`

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

### `sortable`

```svelte example id="attachments-sortable"
<script lang="ts">
  import { sortable } from '$lib/attachments'

  const planets = [
    { planet: `Mercury`, moons: 0, discovery: `ancient`, notes: `` },
    { planet: `Venus`, moons: 0, discovery: `ancient`, notes: `Very bright` },
    { planet: `Earth`, moons: 1, discovery: `ancient`, notes: `Leads with zeros` },
    { planet: `Mars`, moons: 2, discovery: `1610`, notes: `Phobos/Deimos` },
    { planet: `Jupiter`, moons: 95, discovery: `1610`, notes: `Gas giant` },
  ]
</script>

<table {@attach sortable()} class="demo-table">
  <thead>
    <tr>
      <th>Planet</th>
      <th>Moons</th>
      <th>Discovery</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    {#each planets as { planet, moons, discovery, notes }}
      <tr>
        <td>{planet}</td>
        <td>{moons}</td>
        <td>{discovery}</td>
        <td>{notes}</td>
      </tr>
    {/each}
  </tbody>
  <caption style="caption-side: bottom; padding-top: 0.5em">
    Click headers to sort; click again to reverse
  </caption>
</table>

<style>
  .demo-table {
    width: 100%;
  }
  .demo-table :is(th, td) {
    padding: 0.4em 0.6em;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  thead th:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  tbody tr:nth-child(odd) {
    background: rgba(255, 255, 255, 0.04);
  }
  tbody tr:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
```

### `resizable`

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

### `portal`

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

### `contrast_color`

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

### `forward_window_keydown`

`forward_window_keydown` sends page-level keys to the viewer under the pointer while focus is on the page or the viewer root, but leaves keys with focused descendant controls.

```svelte example id="attachments-forward-window-keydown"
<script lang="ts">
  import { forward_window_keydown } from '$lib/attachments'

  let last_key = $state(`none`)
</script>

<div
  tabindex="-1"
  style="padding: 1rem; border: 1px solid currentColor"
  {@attach forward_window_keydown({
    handle: (event) => {
      if (!event.key.startsWith(`Arrow`)) return false
      last_key = event.key
      return true
    },
  })}
>
  Hover here, leave focus on the page and press an arrow key. Last key: {last_key}
</div>
```

### `file_drop`

`file_drop` expands directories, applies file-input MIME/extension filtering and reports processing errors. Drops without accepted files are ignored. `on_files` receives an `AbortSignal`; each newer accepted drop or cleanup/recreation cooperatively aborts the previous callback.

```svelte example id="attachments-file-drop"
<script lang="ts">
  import { file_drop } from '$lib/attachments'
  import { filter_accepted_files } from '$lib/file-drop'

  let names = $state<string[]>([])
  let drag_active = $state(false)
  const accepted_file_types = `image/*,.pdf`
  const allow_multiple = true
  const show_files = (files: File[]) => (names = files.map(({ name }) => name))
</script>

<label
  data-active={drag_active}
  style="display: block; padding: 1rem; border: 1px dashed currentColor"
  {@attach file_drop({
    accept: accepted_file_types,
    multiple: allow_multiple,
    on_drag_active: (active) => (drag_active = active),
    on_files: async (files, signal) => {
      await Promise.all(files.map((file) => file.arrayBuffer()))
      if (!signal.aborted) show_files(files)
    },
    on_error: (error) => (names = [`Error: ${String(error)}`]),
  })}
>
  {drag_active
    ? `Release files`
    : `Drop images or PDFs (${accepted_file_types}; multiple: ${allow_multiple})`}
  <input
    type="file"
    accept={accepted_file_types}
    multiple={allow_multiple}
    onchange={(event) =>
      show_files(
        filter_accepted_files(
          event.currentTarget.files ?? [],
          accepted_file_types,
          allow_multiple,
        ),
      )}
  />
</label>
<p aria-live="polite">{names.join(`, `) || `No files selected`}</p>
```

### `backdrop_dismiss`

`backdrop_dismiss` closes a native dialog only when both the press and release land on its `::backdrop`, not when a text selection starts inside and ends outside.

```svelte example id="attachments-backdrop-dismiss"
<script lang="ts">
  import { backdrop_dismiss } from '$lib/attachments'

  let dialog = $state<HTMLDialogElement | null>(null)
</script>

<button onclick={() => dialog?.showModal()}>Open native dialog</button>
<dialog bind:this={dialog} {@attach backdrop_dismiss()}>
  <p>Click the backdrop to close.</p>
  <button onclick={() => dialog?.close()}>Close</button>
</dialog>
```

### `dismiss_on_outside_press`

For a surface assembled from several elements, call `dismiss_on_outside_press()` directly with an `inside` list instead of attaching `click_outside` to one node.

```svelte example id="attachments-dismiss-multiple"
<script lang="ts">
  import { dismiss_on_outside_press } from '$lib/attachments'

  let open = $state(true)
  let first = $state<HTMLElement | null>(null)
  let second = $state<HTMLElement | null>(null)

  $effect(() => {
    if (!open || !first || !second) return
    return dismiss_on_outside_press({
      inside: [first, second],
      escape: true,
      callback: () => (open = false),
    })
  })
</script>

<button onclick={() => (open = true)}>Open two-part surface</button>
{#if open}
  <div bind:this={first} style="padding: 0.5rem; border: 1px solid currentColor">
    First part
  </div>
  <div bind:this={second} style="padding: 0.5rem; border: 1px solid currentColor">
    Second part
  </div>
{/if}
```

<style>
  h3, h3 code {
    font-size: 1.2em;
    margin-top: 2em;
  }
  /* the index at the top is this page's only prose list, so lay it out inline */
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 3pt 1em;
    padding: 0;
    list-style: none;
  }
</style>
