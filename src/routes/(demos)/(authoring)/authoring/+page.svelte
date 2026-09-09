<script lang="ts">
  import { resolve } from '$app/paths'
  import favicon from '$site/favicon.svg?no-inline'
  import CheckedExamples from './CheckedExamples.svelte'
  import MarkdownLab from './MarkdownLab.svelte'
  import ScientificFigures from './ScientificFigures.md'
  import type { PageData } from './$types'

  const { data }: { data: PageData } = $props()
</script>

<h1>Interactive authoring</h1>
<p>Check code examples, inspect content manifests, and edit scientific references.</p>
<nav aria-label="Authoring guides">
  <a href={resolve(`/code-editor`)}>CodeEditor / DiffView — edit and compare code</a>
  <a href={resolve(`/authoring/hot-reload`)}
    >Live Markdown hot reload — update examples as you write</a
  >
</nav>
<nav aria-label="Authoring features">
  <a href="#figure-and-equation-navigation">Figure and equation navigation</a>
  <a href="#checked-examples">Checked examples</a>
  <a href="#content-manifests">Content manifests</a>
  <a href="#incremental-compilation">Incremental compilation</a>
  <a href="#scientific-references">Scientific references</a>
</nav>
<ScientificFigures />
<h2 id="checked-examples">Checked examples</h2>
<CheckedExamples checks={data.checks} />
<h2 id="content-manifests">Content manifests</h2>
<p>
  Edit frontmatter, headings, links, or fences, then run the compiler. A title is
  required. The sample inventory contains <code>/next.md#details</code> and
  <code>/plot.svg</code>; try breaking a link or changing the title to a number. Expand
  the tree to inspect source positions, TOC, search records, and checked fences.
</p>
<MarkdownLab mode="manifest" />
<h2 id="incremental-compilation">Incremental compilation</h2>
<p>
  Unchanged examples reuse their syntax highlights during development. To try hot reload,
  open the <a href={resolve(`/authoring/hot-reload`)}>live Markdown counter</a>, increment
  it, and edit its source. CSS-only edits preserve the counter; page edits may reset it.
</p>
<h2 id="scientific-references">Scientific references</h2>
<p>
  Figures, equations, and citations share a validated reference graph. Labels can appear
  after their first reference; numbering and the bibliography follow automatically.
</p>
<p>
  Edit a label, equation, or caption and render it again. The bibliography includes <code
    >guide</code
  >. Unresolved references fail with source locations; rendered HTML stays in an isolated
  frame.
</p>
<MarkdownLab mode="references" image={favicon} />

<style>
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin-block: 1.5rem;
  }
  h2 {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid light-dark(#e0e4eb, #30343c);
  }
  nav a {
    padding-block: 0.3rem;
  }
</style>
