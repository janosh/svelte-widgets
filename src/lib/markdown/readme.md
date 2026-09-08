# Markdown

One Markdown engine provides Svelte pages and ordinary HTML. Marked handles CommonMark and GFM; js-yaml parses frontmatter. Svelte syntax, math integration, source maps and live examples are implemented here.

## Svelte pages

```ts
import { create_markdown, markdown } from 'svelte-widgets/markdown'
import { default_highlighter } from 'svelte-widgets/highlight'
import { heading_ids } from 'svelte-widgets/heading-anchors'

export default {
  extensions: [`.svelte`, `.md`, `.svx`],
  preprocess: [
    markdown(create_markdown({ math: true, highlight: default_highlighter.highlight })),
    heading_ids(),
  ],
}
```

`create_markdown(options)` creates a reusable engine. `markdown(engine)` adapts it to a Svelte markup preprocessor, processing `.md` and `.svx` by default; set the engine's `extensions` option to change that list. Markdown headings receive stable IDs during analysis; use `heading_ids()` only when native Svelte pages also need anchors. Scripts, styles, components, expressions, snippets and control blocks use ordinary Svelte syntax. Escape literal braces in prose as `\{` and `\}`; code spans and fences are always literal. Markdown outside code supports GFM tables, task lists, strikethrough and autolinks.

YAML frontmatter exports a `metadata` object from the module script. Access values explicitly as `{metadata.title}` or `{metadata["custom-key"]}`. Frontmatter keys never create local bindings, so a component can declare its own `title` and frontmatter can contain reserved JavaScript words. YAML uses the core schema: dates stay strings and `yes`/`no` stay strings. Frontmatter and validator output must be mappings of JSON data. Nonfinite numbers, cycles, functions, undefined values, and objects such as dates are rejected during parsing rather than silently changed during emission. The module name `metadata` is reserved for the frontmatter export.

## Parse once, reuse the document

`engine.parse(source, { filename, dialect })` returns a result containing a document with `source`, `filename`, `dialect`, `metadata`, and `manifest`. Analysis allocates heading anchors, resolves scientific references, validates frontmatter and live-example settings, and records source ranges. It does not highlight fences or emit components. Reuse that document for checking, content validation, and emission. Documents and emitted artifacts are recursively frozen and readonly in TypeScript, including nested metadata, manifest entries, source positions, examples, and source maps. The document and its manifest share the same metadata object. Use `structuredClone(document.metadata)` when you need an editable copy; parse again to change the document itself.

`compile_markdown(document)` emits Svelte and returns `{ ok, value, diagnostics }`, where a successful `value` contains `{ code, metadata, map, examples, manifest }`. Compilation requires the default `svelte` dialect. Concurrent and repeated emission of the same document shares work. Each parse copies configuration data, including nested math and citation options; later configuration edits cannot change an already parsed document. Callbacks retain their identity and should have stable behavior. Create a new document when its source or configuration changes. Live examples require the Vite integration below.

Source maps track numeric spans through edits and script injection. Separate occurrences of identical authored Svelte expressions retain their own locations. Generated wrappers and markup remain unmapped. Headings and raw HTML anchors use the same IDs in the manifest and emitted output; no second heading pass is required for Markdown.

## HTML strings

```ts
import { assert_ok, create_markdown } from 'svelte-widgets/markdown'

const engine = create_markdown({ math: true, frontmatter: false })
const html = assert_ok(
  await engine.render(`A value: $x^2$`, { filename: `description.md` }),
)
```

The `markdown` dialect treats braces literally and does not load the Svelte compiler. `render_markdown(document)` emits HTML from that document. Both dialects retain trusted authored HTML by default. Set `create_markdown({ raw_html: 'omit' })` for Markdown data fields that should discard HTML tags and entire raw HTML blocks; Markdown links, images, and code remain supported. This option requires the `markdown` dialect and also excludes omitted HTML from the content manifest. Neither mode sanitizes untrusted input.

`engine.render(source, { filename })` parses and renders in the `markdown` dialect, returning the same diagnostic result shape. Use `engine.parse()` and `render_markdown(document)` when you also need the content manifest. Set `frontmatter: false` for embedded Markdown fields so leading `---` separators remain content instead of being interpreted as a YAML header. Frontmatter extraction stays enabled by default. Markdown rendering supports GFM tables, strikethrough and bare URL autolinks.

## Diagnostics

Parsing, compilation, rendering, and checking return `ok` and `diagnostics`. Failed parsing or emission has no `value`. Checking always retains `value: { checked, asserted }` so interfaces can report progress even on failure. Warnings do not make a result fail. Use `assert_ok(result)` at build boundaries to return the successful value or throw `DiagnosticError`; interactive tools can inspect results directly.

Every diagnostic has a stable `code`, `severity`, `message`, and `range: { start, end }`. Each endpoint contains `filename`, one-based `line` and `column`, and a UTF-16 `offset`; ends are exclusive. Duplicate definitions can include `related` locations. Content validation uses the same diagnostic shape, including distinct `missing_document`, `missing_asset`, and `missing_fragment` codes.

## Optional rendering

- `math: true` enables `$…$` and `$$…$$` through the optional KaTeX peer. Pass KaTeX options as `math: { macros, throwOnError: false }`. Math inside code, scripts, styles, comments and attributes is left alone. Import `katex/dist/katex.min.css` once in your app.
- `highlight(code, language)` returns the HTML **inside** `<code>`, synchronously or asynchronously. Omit it for escaped plain code. Highlighting runs concurrently across fences while example IDs retain source order.
- `typography: true` enables curly quotes, apostrophes, ellipses and em dashes in prose. It is off by default and leaves code and Svelte syntax alone.

## Syntax highlighting

`default_highlighter` loads starry-night's common grammars plus Svelte on first use. Importing this subpath does not compile grammars or load WASM. Starry-night is an optional peer dependency.

```ts
import { default_highlighter } from 'svelte-widgets/highlight'
import { create_markdown, markdown } from 'svelte-widgets/markdown'

const preprocess = markdown(create_markdown({ highlight: default_highlighter.highlight }))
```

Use `create_highlighter(grammars)` for a smaller or different grammar set. The factory exposes `highlight(code, language)` for inner HTML, `highlight_block(code, language)` for a complete `<pre><code>` block, and `ready()` for the cached underlying instance. Unknown languages render as escaped text.

```ts
import grammar_typst from '@wooorm/starry-night/source.typst'
import { create_highlighter } from 'svelte-widgets/highlight'

const highlighter = create_highlighter([grammar_typst])
const html = await highlighter.highlight_block(`#let value = 1`, `typ`)
```

## Live examples

Create one integration instance in your Vite config and pass its preprocessor directly to SvelteKit:

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { create_markdown } from 'svelte-widgets/markdown'
import { markdown_vite } from 'svelte-widgets/markdown/vite'
import { default_highlighter } from 'svelte-widgets/highlight'

const engine = create_markdown({
  highlight: default_highlighter.highlight,
  examples: { collapsible: true, hide_style: true },
})
const docs = markdown_vite(engine)

export default {
  plugins: [
    sveltekit({ extensions: [`.svelte`, `.md`, `.svx`], preprocess: docs.preprocess }),
    docs.plugin,
  ],
}
```

Every fenced block has a typed, read-only `settings` object in `document.manifest.fences`. Analysis merges example defaults with authored settings; explicit `false` overrides a default. Unknown keys, duplicate keys, invalid JSON, and wrong value types fail at the fence before highlighting or checking. Rendering and checking read this same object. The raw `info` string remains available for source inspection.

Supported settings are the boolean flags `example`, `check`, `csr`, `collapsible`, `hide_script`, `hide_style`, and `code_above`; nonempty strings `id`, `test`, `title`, `repl`, and `github`; and `wrapper` as a module path or `[module, export]`. Live rendering remains opt-in through the engine’s `examples` option.

A `svelte` or `html` fence with `example` metadata renders a component and its source through `CodeExample`. Other languages remain ordinary highlighted code blocks. Flags are bare names or JSON values, for example `example collapsible=false id="counter"`. Use `csr` for a dynamic import rendered only in the browser. `hide_script` and `hide_style` remove real top-level blocks from the displayed source, preserving the runnable component.

Set `examples.wrapper` to a default-import module path or `[module, named_export]` for a custom wrapper. The wrapper receives `src`, `meta`, and `example`/`code` snippets. Virtual components live beside the Markdown file for relative import resolution. Vite receives their source before imports resolve and invalidates changed components and CSS during hot reload. Missing example modules fail explicitly.

## Checked examples

[Explore actual type-check results and edit Svelte syntax live](https://svelte-widgets.janosh.dev/authoring#checked-examples).

Mark complete JavaScript, TypeScript, HTML, or Svelte fences with `check`. Add `test="counter"` to run a named assertion after static checks pass. Examples execute only through the assertion callbacks you explicitly supply.

````md
```svelte check
<script lang="ts">
  let count: number = $state(0)
</script>

<button onclick={() => count++}>{count}</button>
```
````

```ts
import { readFile } from 'node:fs/promises'
import { assert_ok, create_markdown } from 'svelte-widgets/markdown'
import { check_document } from 'svelte-widgets/markdown/check'

const engine = create_markdown({ math: true, references: true })
const document = assert_ok(
  await engine.parse(await readFile(`docs/guide.md`, `utf8`), {
    filename: `docs/guide.md`,
  }),
)
assert_ok(await check_document(document))
```

The Node-only checker lazily loads TypeScript and `svelte2tsx` from the document's directory. It checks scripts, Svelte templates, and imported component props, preserving source locations in diagnostics. Missing tools produce setup diagnostics; `typecheck: false` requests syntax checks only. Toolchain adapters can be supplied explicitly.

Use `check_document(document, options)` for one document or `check_examples(documents.flatMap(({ manifest }) => manifest.fences), options)` for a batch. Checks consume existing analysis without highlighting or emitting examples. Every call creates a fresh TypeScript program and reads its dependencies anew; there are no sessions, persistent caches, or disposal methods. Assertions run only after all selected fences pass static checks.

Configuration is explicit: omit `tsconfig` for standalone defaults, pass `compiler_options` directly, or set `tsconfig: "./tsconfig.docs.json"`. Relative config paths and explicit compiler aliases resolve from the document directory (the first fence's document for a batch). Relative document filenames resolve from the working directory. An explicit config follows TypeScript inheritance, including aliases, libraries, and ambient types; missing or invalid configs produce diagnostics. No config is discovered automatically. Each call reads the supplied config afresh.

Fences supply the program's entry files; a config's `include`, `files`, and project references do not add unrelated code. Imported dependencies are checked normally. Build-only constraints are disabled, nothing is emitted, and `compiler_options` overrides the supplied config.

For browser behavior, supply `assertions: { counter: async (example) => { ... } }` with your existing Playwright page or test harness. The callback receives the selected fence, including source and original positions. A rejected assertion becomes a diagnostic at that fence. The checker never launches browsers or executes arbitrary fence text implicitly.

## Content manifests

[Edit Markdown and inspect its manifest, validation issues, TOC, and search record](https://svelte-widgets.janosh.dev/authoring#content-manifests).

`engine.parse()` provides `document.manifest`: metadata, headings, links, assets, anchors, fenced examples, and searchable text from the same parse. Links containing Svelte expressions have `dynamic: true` and are excluded from static validation. In the `markdown` dialect, braces remain literal in headings, IDs, and URLs. Positions use one-based lines and columns and UTF-16 offsets in the original Markdown, including frontmatter and nested list/quote indentation.

```ts
import { assert_ok, create_markdown } from 'svelte-widgets/markdown'
import {
  assert_valid_content,
  content_search_record,
  content_toc,
} from 'svelte-widgets/markdown/content'

const engine = create_markdown({
  validate_frontmatter(metadata) {
    if (typeof metadata.title !== `string`) throw new Error(`title must be a string`)
    return { ...metadata, title: metadata.title }
  },
})
const document = assert_ok(await engine.parse(source, { filename: `/guide.md` }))
const title: string = document.metadata.title
const toc = content_toc(document.manifest)
const search_entry = content_search_record(document.manifest)
assert_valid_content([document.manifest], { assets: [`/images/diagram.svg`] })
```

Pass all page manifests together to validate local links, fragments, and duplicate anchors. `filename` and asset inventories are literal paths; link URLs are decoded once. `validate_content()` returns diagnostics for custom reporting. Frontmatter validator return types propagate to both metadata objects. Feed and sitemap generators can consume the same metadata without another Markdown pass. HTML rendering reuses this same document analysis.

`markdown_vite(engine, { on_manifest })` reports each successfully compiled manifest. This site's static adapter collects them, uses SvelteKit's route patterns to associate source files with public URLs, and validates links and assets against the complete prerendered HTML inventory, including native Svelte anchors. Markdown diagnostics retain authored locations; runtime-generated markup points to the emitted HTML. Intentional fake links in demos use `data-content-ignore`; duplicate IDs are always checked.

`npm run build:site` also builds Pagefind's HTML index. Frontmatter `title`, `description`, and `categories` populate Pagefind metadata. Rendered figures with captions and labeled equations get individual anchor records; their content is excluded from the page record to prevent duplicate hits. Ordinary headings retain Pagefind's section results. Routes and search results respect `BASE_PATH`.

## Incremental compilation

[Try the live counter with local HMR](https://svelte-widgets.janosh.dev/authoring/hot-reload).

Example module identities come from an explicit fence `id`, or from its language and source. Adding prose or another fence before an unchanged example no longer renames its module. Explicit IDs remain stable when their code changes and must be unique within the document.

Markdown pages use ordinary Svelte hot reload. Page edits may reset live-example state, even when the example's module identity is unchanged. Prose, authored expressions, and scoped styles stay in the original component tree in both development and production.

`markdown_vite(engine, { highlight_cache_size: 256 })` caches highlighted fences per integration, shares concurrent work, and evicts the least recently used entries. Set the size to zero to disable caching. Changed prose reuses existing highlights; rejected requests are removed so a corrected highlighter can retry. Plugin teardown clears both compilation and highlighting caches.

## Scientific references

`manifest.reference_definitions` contains each figure and equation once, in document order, including definitions never referenced in prose. Entries contain `key`, `kind`, `number`, `target` (the anchor ID), optional figure `caption`, optional authored `label`, and the definition's source `range`. `manifest.references` continues to describe individual mentions, including citations. Rendered definitions carry a `data-reference-label` with the same numbering and decoded caption; the docs site uses these labels for separate, collapsible “Figures” and “Equations” lists beneath the heading TOC. Each list preserves document order and disappears when empty. Links use ordinary fragments, and both lists share the TOC's mobile panel. `Toc` accepts an optional `footer` snippet for supplemental navigation, even on pages with fewer than `minItems` headings.

[Edit equations, figures, and citations in the live reference lab](https://svelte-widgets.janosh.dev/authoring#scientific-references).

Enable `references: true` for numbered figures and equations, or pass a bibliography keyed by citation ID. Equations also require `math: true`.

```ts
const engine = create_markdown({
  math: true,
  references: {
    bibliography: {
      doe2020: { title: `A reproducible result`, authors: [`J. Doe`], year: 2020 },
    },
  },
})
const html = assert_ok(await engine.render(source))
```

```md
See [@eq:energy] and [@fig:result], following [@doe2020].

$$ {#eq:energy label="Mass–energy equivalence"}
E = mc^2
$$

![The experimental result](result.svg){#fig:result label="Experimental result"}

::: bibliography
```

Add optional `label="…"` metadata after a figure or equation ID to customize its navigation title, for example “1 · Mass–energy equivalence”. Labels are nonempty JSON strings (use `\"` for a literal quote), rendered as plain text. A figure without a label uses its caption; entries without a label or caption retain the “Figure” or “Equation” prefix before their number. Labels do not change captions, formula rendering, inline references, anchor IDs, or numbering. Unknown metadata keys and invalid labels fail with source locations.

Forward references resolve after parsing; figures and equations have independent numbering. Group citations with `[@first; @second]`. Cited entries appear in first-use order at `::: bibliography`, or at the end if the directive is omitted. Bibliography records support `title`, `authors`, `year`, `url`, and `doi`; configure the heading with `bibliography_title`. Duplicate labels and unresolved references fail with original source locations. Code spans, fences, and authored scripts remain literal. Manifests include reference targets, generated anchors, figure assets, and citation links, so ordinary content validation covers them too.

## Migration

Create an engine with `create_markdown(options)` and pass it to `markdown(engine)` or `markdown_vite(engine)`. For HTML strings, use `engine.render(source)` and remove Svelte-output unwrapping and brace-replacement workarounds. Parse once with `engine.parse()` when you also need the document for checking or content manifests, then call `compile_markdown(document)` for Svelte or `render_markdown(document)` for HTML. Use `assert_ok()` at throwing boundaries.

Replace implicit frontmatter references such as `{title}` with `{metadata.title}`. Fence settings are now validated: move `defaults.Wrapper` to `examples.wrapper` and use `hide_style`, not `hideStyle`. Replace `check_markdown()` with `check_document(document)`; checker options `throw_on_error` and `markdown_options` are removed. Manifest `.position` and `.code_position` are now `.range.start` and `.code_range.start`.

Remove remark plugin registration and the old live-example Vite plugin. Replace the KaTeX before/after pair with `math`. Highlighter callbacks return inner HTML; use `default_highlighter.highlight` or `create_highlighter(grammars).highlight` from `/highlight`. The `/live-examples`, `/live-examples/create-highlighter` and `/katex` subpaths are removed.
