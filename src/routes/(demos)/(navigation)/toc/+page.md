## Toc

A sticky table of contents that finds the headings itself. It queries the document for
`headingSelector`, watches for mutations so late-rendered headings still show up, and
tracks which heading is in view to mark the active entry.

The one on the right of this page is a `Toc`. The demo below scopes itself to the sample
document with `headingSelector`, so it lists those headings rather than the page's.

```svelte example id="toc-basic"
<script lang="ts">
  import { Toc } from '$lib'

  let open = $state(false)
</script>

<div class="toc-demo-doc" style="display: flex; gap: 2em">
  <article style="flex: 1">
    <h2>Getting started</h2>
    <p>Scoped with <code>headingSelector</code> so it ignores the rest of the page.</p>
    <h3>Installation</h3>
    <p>Subheadings collapse beneath their nearest section.</p>
    <h2>Reference</h2>
    <h3>Configuration</h3>
    <p>Pass <code>collapseSubheadings</code> to fold levels under their parent.</p>
    <h3>Troubleshooting</h3>
    <p>Set <code>warnOnEmpty</code> to hear about a selector that matches nothing.</p>
  </article>

  <Toc
    bind:open
    headingSelector=".toc-demo-doc :is(h2, h3)"
    collapseSubheadings="h3"
    title="On this page"
    asideProps={{ style: `width: 14em` }}
  />
</div>
```

### Collapsing

`collapseSubheadings` takes `true` to fold everything below the top level, or a heading
tag to pick the level to fold from — `h3` keeps `h2` entries expanded and hides the rest
until their section is active.

```svelte
<Toc collapseSubheadings="h3" />
```

### Styling

Every element has a prop bag (`asideProps`, `navProps`, `titleProps`, `olProps`,
`liProps`, `openButtonProps`) whose attributes are spread onto that element, and the base
rules use `:where()` so a single class of your own outranks them without `!important`.
