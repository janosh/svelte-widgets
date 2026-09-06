# Markdown

One Markdown engine provides Svelte pages and ordinary HTML. Marked handles CommonMark and GFM; js-yaml parses frontmatter. Svelte syntax, math integration, source maps and live examples are implemented here.

## Svelte pages

```ts
import { markdown } from 'svelte-widgets/markdown'
import { default_highlighter } from 'svelte-widgets/highlight'
import { heading_ids } from 'svelte-widgets/heading-anchors'

export default {
  extensions: [`.svelte`, `.md`, `.svx`],
  preprocess: [
    markdown({ math: true, highlight: default_highlighter.highlight }),
    heading_ids(),
  ],
}
```

`markdown(options)` is a Svelte markup preprocessor. It processes `.md` and `.svx` by default; set `extensions` to change that list. Scripts, styles, components, expressions, snippets and control blocks use ordinary Svelte syntax. Escape literal braces in prose as `\{` and `\}`; code spans and fences are always literal. Markdown outside code supports GFM tables, task lists, strikethrough and autolinks.

YAML frontmatter exports a `metadata` object from the module script. Valid JavaScript binding names are also available directly in templates. YAML uses the core schema: dates stay strings and `yes`/`no` stay strings. Frontmatter must be a mapping with unique keys and serializable values. Conflicting JavaScript bindings produce compiler errors.

`compile_markdown(source, { filename, ...options })` returns `{ code, metadata, map, examples }`. Maps preserve unambiguous authored Svelte spans; repeated text and generated markup remain unmapped rather than guessing source locations. Compiler errors include the filename. Live examples require the Vite integration below.

## HTML strings

```ts
import { render_markdown } from 'svelte-widgets/markdown'

const html = await render_markdown(`A value: $x^2$`, { math: true })
```

`render_markdown()` returns HTML directly and does not load the Svelte compiler or interpret brace expressions. Use it for descriptions, changelogs and server-rendered documentation. Both entry points retain trusted authored HTML; neither sanitizes untrusted input.

## Optional rendering

- `math: true` enables `$…$` and `$$…$$` through the optional KaTeX peer. Pass KaTeX options as `math: { macros, throwOnError: false }`. Math inside code, scripts, styles, comments and attributes is left alone. Import `katex/dist/katex.min.css` once in your app.
- `highlight(code, language)` returns the HTML **inside** `<code>`, synchronously or asynchronously. Omit it for escaped plain code. Highlighting runs concurrently across fences while example IDs retain source order.
- `typography: true` enables curly quotes, apostrophes, ellipses and em dashes in prose. It is off by default and leaves code and Svelte syntax alone.

## Syntax highlighting

`default_highlighter` loads starry-night's common grammars plus Svelte on first use. Importing this subpath does not compile grammars or load WASM. Starry-night is an optional peer dependency.

```ts
import { default_highlighter } from 'svelte-widgets/highlight'
import { markdown } from 'svelte-widgets/markdown'

const preprocess = markdown({ highlight: default_highlighter.highlight })
```

Use `create_highlighter(grammars)` for a smaller or different grammar set. The factory exposes `highlight(code, language)` for inner HTML, `highlight_block(code, language)` for a complete `<pre><code>` block, and `ready()` for the cached underlying instance. Unknown languages render as escaped text.

```ts
import grammar_typst from '@wooorm/starry-night/source.typst'
import { create_highlighter } from 'svelte-widgets/highlight'

const highlighter = create_highlighter([grammar_typst])
const html = await highlighter.highlight_block(`#let value = 1`, `typ`)
```

## Live examples

Create one integration instance and share it between your Svelte config and Vite plugins:

```ts
import { markdown_vite } from 'svelte-widgets/markdown/vite'
import { default_highlighter } from 'svelte-widgets/highlight'

const docs = markdown_vite({
  highlight: default_highlighter.highlight,
  examples: { collapsible: true, hide_style: true },
})

// Svelte config: preprocess: [docs.preprocess]
// Vite config: plugins: [sveltekit(), docs.plugin]
```

A `svelte` or `html` fence with `example` metadata renders a component and its source through `CodeExample`. Other languages remain ordinary highlighted code blocks. Flags are bare names or JSON values, for example `example collapsible=false id="counter"`. Use `csr` for a dynamic import rendered only in the browser. `hide_script` and `hide_style` remove real top-level blocks from the displayed source, preserving the runnable component.

Set `examples.wrapper` to a default-import module path or `[module, named_export]` for a custom wrapper. The wrapper receives `src`, `meta`, and `example`/`code` snippets. Virtual components live beside the Markdown file for relative import resolution. Vite receives their source before imports resolve and invalidates changed components and CSS during hot reload. Missing example modules fail explicitly.

## Migration

Replace mdsvex configuration with `markdown()` or `markdown_vite()`. Remove remark plugin registration and the old live-example Vite plugin. Move `defaults.Wrapper` to `examples.wrapper`; use `hide_style`, not `hideStyle`. Replace the KaTeX before/after pair with `math`. Highlighter callbacks now return inner HTML; use `default_highlighter.highlight` or `create_highlighter(grammars).highlight`. Highlighting now lives at `/highlight`; the `/live-examples`, `/live-examples/create-highlighter` and `/katex` subpaths are removed. Plain HTML callers should use `render_markdown()` and remove Svelte-output unwrapping and brace-replacement workarounds.
