## Toc

A sticky table of contents that finds the headings itself. It queries the document for
`heading_selector`, watches for mutations so late-rendered headings still show up, and
tracks which heading is in view to mark the active entry.

The one on the right of this page is a `Toc`. The demo below scopes itself to the sample
document with `heading_selector`, so it lists those headings rather than the page's.

```svelte example id="toc-basic"
<script lang="ts">
  import { Toc } from 'svelte-widgets'

  let open = $state(false)
</script>

<div class="toc-demo-doc" style="display: flex; gap: 2em">
  <article style="flex: 1">
    <h2>Getting started</h2>
    <p>Scoped with <code>heading_selector</code> so it ignores the rest of the page.</p>
    <h3>Installation</h3>
    <p>Subheadings collapse beneath their nearest section.</p>
    <h2>Reference</h2>
    <h3>Configuration</h3>
    <p>Pass <code>collapse_subheadings</code> to fold levels under their parent.</p>
    <h3>Troubleshooting</h3>
    <p>Set <code>warn_on_empty</code> to hear about a selector that matches nothing.</p>
  </article>

  <Toc
    bind:open
    heading_selector=".toc-demo-doc :is(h2, h3)"
    collapse_subheadings="h3"
    title="On this page"
    aside_props={{ style: `width: 14em` }}
  />
</div>
```

### Collapsing

`collapse_subheadings` takes `true` to fold everything below the top level, or a heading
tag to pick the level to fold from — `h3` keeps `h2` entries expanded and hides the rest
until their section is active.

```svelte
<Toc collapse_subheadings="h3" />
```

### Styling

Every element has a prop bag (`aside_props`, `nav_props`, `title_props`, `ol_props`,
`li_props`, `open_button_props`) whose attributes are spread onto that element, and the base
rules use `:where()` so a single class of your own outranks them without `!important`.
