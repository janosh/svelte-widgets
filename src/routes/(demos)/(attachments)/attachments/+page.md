<script lang="ts">
  import { resolve } from '$app/paths'
  import { SubpageGrid } from '$lib'
  import { demo_labels } from '../..'

  // keyed by route slug; titles come from demo_labels so they can't drift from the nav
  const descriptions: Record<string, string> = {
    tooltip: `Top-layer tooltips with automatic placement, delegation and controlled state.`,
    draggable: `Pointer dragging with handles, axis locks and position callbacks.`,
    resizable: `Edge and corner resize handles with keyboard support and size caps.`,
    sortable: `Click-to-sort table headers with custom comparators and styling.`,
    'highlight-matches': `Mark search matches in text using the CSS Custom Highlight API.`,
    'click-outside': `Dismiss a surface on an outside press or Escape.`,
    'dismiss-on-outside-press': `The imperative form of click_outside, for surfaces built from several elements.`,
    'focus-trap': `Keep Tab inside a surface and hand the keyboard back when it closes.`,
    hotkey: `Declarative keybindings scoped to a node or the whole page.`,
    float: `Park an element beside an anchor and keep it there while the page moves.`,
    portal: `Move existing DOM into another container and restore it on teardown.`,
    'contrast-color': `Pick a readable foreground from the background painted behind an element.`,
    'forward-window-keydown': `Route page-level keys to the viewer under the pointer.`,
    'file-drop': `Drag-and-drop files with directory expansion and MIME filtering.`,
  }
  // resolve's arg type distributes over the Pathname union, so a runtime slug can't match a
  // single arm; every demo route is param-free
  const resolve_path = resolve as (path: string) => string
  const subpages = Object.entries(descriptions).map(
    ([slug, description]): [string, string, string] => [
      demo_labels[`/attachments/${slug}`] ?? slug,
      resolve_path(`/attachments/${slug}`),
      description,
    ],
  )
</script>

<SubpageGrid
title="Attachments"
subtitle="One behaviour per attachment, added to an element without wrapping it in a component."
{subpages}
/>

## Quick start

Every attachment is a function you call and spread onto an element. They compose freely,
so a surface can be positioned, dismissed and trapped at once:

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

Positioning for `tooltip`, `float` and the portalled dropdown all comes from one
`compute_position` helper, so a flip near a viewport edge behaves the same wherever it
happens.
