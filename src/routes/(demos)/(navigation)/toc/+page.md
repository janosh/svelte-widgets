## Toc

A sticky table of contents that tracks the active heading. Pass `items` from a [content manifest](markdown#content-manifests) to render navigation on the server. Without `items`, it queries existing heading IDs once on mount. Set `dynamic` to observe headings that change after mount.

The site table of contents uses the Markdown manifest. The example scopes its one-time DOM query to explicitly identified sample headings with `heading_selector`. Invalid selectors or `collapse_subheadings` values throw instead of silently disabling navigation.

```svelte example id="toc-basic"
<script lang="ts">
  import { Heading, Toc } from 'svelte-widgets'

  let open = $state(false)
</script>

<div class="toc-demo-doc" style="display: flex; gap: 2em">
  <article style="flex: 1">
    <Heading level={2} id="getting-started">Getting started</Heading>
    <p>Scoped with <code>heading_selector</code> so it ignores the rest of the page.</p>
    <Heading level={3} id="installation">Installation</Heading>
    <p>Subheadings collapse beneath their nearest section.</p>
    <Heading level={2} id="reference">Reference</Heading>
    <Heading level={3} id="configuration">Configuration</Heading>
    <p>Pass <code>collapse_subheadings</code> to fold levels under their parent.</p>
    <Heading level={3} id="troubleshooting">Troubleshooting</Heading>
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

### Inside a scrolling pane

In an app, the headings often scroll inside a pane rather than the page. Pass that element as `scroll_root`: headings are queried and observed only inside it, its scrolling moves the active entry, and `active_heading_scroll_offset` counts from its top edge. `update_fragment={false}` keeps a click from rewriting the page URL, whose `#id` could name a heading in another pane. Pair them with `breakpoint={0}` (no mobile panel) and `react_to_keys={false}` (the page keeps its keys).

```svelte example id="toc-scroll-root"
<script lang="ts">
  import { Heading, Toc } from 'svelte-widgets'

  let pane = $state<HTMLElement>()
</script>

<div style="display: flex; gap: 1em; height: 14em">
  <Toc
    scroll_root={pane}
    update_fragment={false}
    breakpoint={0}
    react_to_keys={false}
    title=""
    aside_props={{ style: `width: 10em` }}
  />
  <div
    bind:this={pane}
    style="flex: 1; overflow: auto; border: 1px solid; padding: 0 1em"
  >
    {#each [`Setup`, `Usage`, `Results`, `Notes`] as name (name)}
      <Heading level={2} id="pane-{name.toLowerCase()}">{name}</Heading>
      <p style="height: 10em">Scroll this pane: the entry on the left follows.</p>
    {/each}
  </div>
</div>
```

### Collapsing

`collapse_subheadings` takes `true` to fold everything below the top level, or a heading tag to pick the level to fold from — `h3` keeps `h2` entries expanded and hides the rest until their section is active.

```svelte
<Toc collapse_subheadings="h3" />
```

### Styling

Every element has a prop bag (`aside_props`, `nav_props`, `title_props`, `ol_props`, `li_props`, `open_button_props`) whose attributes are spread onto that element, and the base rules use `:where()` so a single class of your own outranks them without `!important`.
