## Breadcrumbs

A trail of levels from a root to the current page, rendered as `nav[aria-label] > ol` with `aria-current` on the last item (`page` by default; `aria_current` also takes `location`, `step` or `true`). Each item navigates by `href`, by its own `onclick`, or through the component's `on_navigate` callback, so views without URLs (a file browser, a wizard, a dialog) work as well as routed pages. The current item is plain text unless `link_current` keeps it clickable.

```svelte example id="breadcrumbs-links"
<script lang="ts">
  import { Breadcrumbs } from 'svelte-widgets'
  import { Home } from 'svelte-widgets/icons'

  // relative hrefs so the links survive the docs site's base path
  const items = [
    { label: `Home`, href: `.`, icon: Home },
    { label: `Navigation`, href: `navigation` },
    { label: `Breadcrumbs`, href: `breadcrumbs` },
  ]
</script>

<Breadcrumbs {items} />
<Breadcrumbs {items} separator="›" --breadcrumbs-current-color="var(--accent-color)" />
```

### Callback navigation and collapsing

`on_navigate(item, index, event)` runs for every activated item after its own `onclick`, unless that prevented default or a modifier click opens the link elsewhere; prevent default there for client-side routing. Items without `href` render as buttons when they have an `onclick` or `on_navigate` is set, else as plain text. With `max_items` (at least 2), a long trail keeps `items_before` levels at the start (default 1, capped at `max_items - 1`) and fills the rest from the end, hiding the middle behind an ellipsis button. Pressing that button expands the trail in place and moves focus to the first revealed level; `expanded` is bindable, so resetting it collapses again.

```svelte example id="breadcrumbs-callback"
<script lang="ts">
  import { Breadcrumbs } from 'svelte-widgets'

  let path = $state(`home/janosh/dev/svelte-widgets/src/lib/attachments`.split(`/`))
  let expanded = $state(false)
  const items = $derived(path.map((label) => ({ label })))
</script>

<Breadcrumbs
  {items}
  max_items={4}
  bind:expanded
  aria-label="Directory"
  on_navigate={(_item, index) => {
    path = path.slice(0, index + 1)
    expanded = false
  }}
/>
<p>
  <code>{path.join(`/`)}</code>
  <button onclick={() => (path = [...path, `level${path.length}`])}>Descend</button>
</p>
```

### Custom rendering

`separator` takes a string or a snippet, `item({ item, index, current })` replaces the icon and label inside the default link, button or span, and other attributes land on the `<nav>`, where SvelteKit link options such as `data-sveltekit-preload-data` reach every link. Items carry their own `target`, `rel` and `title`, and extra item fields reach the snippet and `on_navigate`. Restyle the trail with `--breadcrumbs-*` properties such as `--breadcrumbs-gap`, `--breadcrumbs-color`, `--breadcrumbs-current-font-weight`, `--breadcrumbs-item-max-width` (long labels ellipsize) and `--breadcrumbs-wrap: nowrap`.

```svelte example id="breadcrumbs-snippets"
<script lang="ts">
  import { Breadcrumbs, Icon } from 'svelte-widgets'
  import { ChevronRight } from 'svelte-widgets/icons'

  // hash links to this page's own headings: the docs prerender fails on a missing target
  const items = [
    { label: `Materials`, href: `#breadcrumbs`, count: 1204 },
    { label: `Oxides`, href: `#custom-rendering`, count: 312 },
    { label: `Perovskites with a remarkably long name`, count: 41 },
  ]
</script>

<Breadcrumbs {items} --breadcrumbs-item-max-width="14em" --breadcrumbs-wrap="nowrap">
  {#snippet separator()}<Icon icon={ChevronRight} />{/snippet}
  {#snippet item({ item: crumb, current })}
    <span
      style="overflow: hidden; text-overflow: ellipsis"
      style:font-style={current ? `italic` : null}>{crumb.label}</span
    >
    <small>({crumb.count})</small>
  {/snippet}
</Breadcrumbs>
```
