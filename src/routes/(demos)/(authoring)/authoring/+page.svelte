<script lang="ts">
  import { CodePlayground, CodeWalkthrough, type WalkthroughStep } from '$lib'
  import runtime_source from 'virtual:svelte-widgets/playground'
  import favicon from '$site/favicon.svg?no-inline'
  import CheckedExamples from './CheckedExamples.svelte'
  import MarkdownLab from './MarkdownLab.svelte'
  import type { PageData } from './$types'

  const { data }: { data: PageData } = $props()

  const files = {
    'App.svelte': `<script>\n  import Counter from './Counter.svelte'\n  import './style.css'\n\u003C/script>\n\n<h1>Make it yours</h1>\n<p>Edit a file, then press Run.</p>\n<Counter />`,
    'Counter.svelte': `<script>\n  import { step } from './settings.js'\n  let count = $state(0)\n\u003C/script>\n\n<button onclick={() => count += step}>Count: {count}</button>`,
    'settings.js': `export const step = 1`,
    'style.css': `body { font-family: system-ui; padding: 1.5rem; color: #223047; background: #f5f8ff; }\nbutton { padding: .65rem 1.2rem; border: 0; border-radius: .6rem; color: white; background: #496be3; font: inherit; cursor: pointer; }`,
  }
  const steps: WalkthroughStep[] = [
    {
      id: `state`,
      title: `Create state`,
      description: `A rune makes this value reactive. Start at zero.`,
      code: `let count = $state(0)`,
      language: `svelte`,
      focus_lines: [1],
      annotations: { 1: `Svelte tracks reads and writes` },
    },
    {
      id: `event`,
      title: `Handle a click`,
      description: `Increment the same value from a button. The added line is marked with a plus sign.`,
      before: `let count = $state(0)`,
      code: `let count = $state(0)\nconst increment = () => count += 1`,
      language: `svelte`,
      focus_lines: [2],
      annotations: { 2: `One action, one state update` },
    },
    {
      id: `render`,
      title: `Render the result`,
      description: `Connect the handler and show the current value. Try it in the playground above.`,
      before: `<button>Count</button>`,
      code: `<button onclick={increment}>Count: {count}</button>`,
      language: `svelte`,
      focus_lines: [1],
      annotations: { 1: `The text follows the reactive value` },
    },
  ]
</script>

<h1>Interactive authoring</h1>
<p>
  Make documentation executable, editable, and easy to explore. The playground compiles
  locally and runs in an isolated preview. Nothing is uploaded.
</p>
<nav aria-label="Authoring features">
  <a href="#checked-examples">Checked examples</a>
  <a href="#content-manifests">Content manifests</a>
  <a href="#incremental-compilation">Incremental compilation</a>
  <a href="#multi-file-playground">Playground</a>
  <a href="#guided-walkthrough">Walkthrough</a>
  <a href="#scientific-references">Scientific references</a>
</nav>
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
  Add prose and watch highlight calls stay at zero. Edit the example to trigger
  highlighting, or remove its explicit <code>id</code> to see content-derived module names.
  These counters come from the real Vite integration's compiler cache.
</p>
<MarkdownLab mode="incremental" />
<p>
  For actual development hot reload, open the <a href="/authoring/hot-reload"
    >live Markdown counter</a
  >, increment it, and edit that page's prose in your editor. Static prose edits preserve
  its state; script or example-structure changes can reset it.
</p>
<h2 id="multi-file-playground">Multi-file playground</h2>
<p>
  Change the increment in <code>settings.js</code>, press Run, and try the counter. Share
  captures every file; Reset restores the starting project.
</p>
<CodePlayground {files} {runtime_source} restore_hash title="Counter playground" />
<h2 id="guided-walkthrough">Guided walkthrough</h2>
<p>
  Use the step buttons or the Up/Down, Home, and End keys. Focused lines and annotations
  explain each change; plus/minus markers make the diff readable without relying on color.
</p>
<CodeWalkthrough {steps} />
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
