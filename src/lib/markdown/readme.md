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

`create_markdown(options)` creates a reusable engine. `markdown(engine)` adapts it to a Svelte markup preprocessor. Markdown headings receive stable IDs during analysis; use `heading_ids()` only when native Svelte pages also need anchors. It processes `.md` and `.svx` by default; set `extensions` to change that list. Scripts, styles, components, expressions, snippets and control blocks use ordinary Svelte syntax. Escape literal braces in prose as `\{` and `\}`; code spans and fences are always literal. Markdown outside code supports GFM tables, task lists, strikethrough and autolinks.

YAML frontmatter exports a `metadata` object from the module script. Access values explicitly as `{metadata.title}` or `{metadata["custom-key"]}`. Frontmatter keys never create local bindings, so a component can declare its own `title` and frontmatter can contain reserved JavaScript words. YAML uses the core schema: dates stay strings and `yes`/`no` stay strings. Frontmatter and validator output must be mappings of JSON data. Nonfinite numbers, cycles, functions, undefined values, and objects such as dates are rejected during parsing rather than silently changed during emission. The module name `metadata` is reserved for the frontmatter export.

## Parse once, reuse the document

`engine.parse(source, { filename, dialect })` returns a result containing a document with `source`, `filename`, `dialect`, `metadata`, and `manifest`. Analysis allocates heading anchors, resolves scientific references, validates frontmatter and live-example settings, and records source ranges. It does not highlight fences or emit components. Reuse that document for checking, content validation, and emission. Documents and emitted artifacts are recursively frozen and readonly in TypeScript, including nested metadata, manifest entries, source positions, examples, and source maps. The document and its manifest share the same metadata object. Use `structuredClone(document.metadata)` when you need an editable copy; parse again to change the document itself.

`compile_markdown(document)` emits Svelte and returns `{ ok, value, diagnostics }`, where a successful `value` contains `{ code, metadata, map, examples, manifest }`. Compilation requires the default `svelte` dialect. Concurrent and repeated emission of the same document shares work. Each parse copies configuration data, including nested math and citation options; later configuration edits cannot change an already parsed document. Callbacks retain their identity and should have stable behavior. Create a new document when its source or configuration changes. Live examples require the Vite integration below.

Source maps track numeric spans through edits and script injection. Separate occurrences of identical authored Svelte expressions retain their own locations. Generated wrappers and markup remain unmapped. Headings and raw HTML anchors use the same IDs in the manifest and emitted output; no second heading pass is required for Markdown.

## HTML strings

```ts
import { assert_ok, create_markdown, render_markdown } from 'svelte-widgets/markdown'

const engine = create_markdown({ math: true })
const document = assert_ok(
  await engine.parse(`A value: $x^2$`, {
    filename: `description.md`,
    dialect: `markdown`,
  }),
)
const html = assert_ok(await render_markdown(document))
```

The `markdown` dialect treats braces literally and does not load the Svelte compiler. `render_markdown(document)` emits HTML from that document. Both dialects retain trusted authored HTML; neither sanitizes untrusted input.

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
import { create_checker } from 'svelte-widgets/markdown/check'

const engine = create_markdown({ math: true, references: true })
const document = assert_ok(
  await engine.parse(await readFile(`docs/guide.md`, `utf8`), {
    filename: `docs/guide.md`,
  }),
)
const checker = create_checker({ root: process.cwd() })
try {
  assert_ok(await checker.check(document))
} finally {
  checker.dispose()
}
```

The Node-only checker uses the project's installed TypeScript and `svelte2tsx` tools lazily. It checks Svelte templates and imported component props as well as scripts. Missing tools produce setup diagnostics; `typecheck: false` requests syntax checks only. `create_checker(options)` owns a project session. Its `check(document)` or `check(documents)` method consumes existing analysis without highlighting or emitting examples. Each call supplies the complete current document set; omitted documents are removed from the next program. It reuses the previous TypeScript program, unchanged source ASTs, and Svelte transforms while reading dependency contents and refreshing import resolution on every check. Each Svelte transform decodes its source map once; diagnostic endpoints use binary lookups in the cached map. Moving a fence updates diagnostic locations without retransformation. Toolchain adapters can be supplied explicitly. `check_document(document, options)` and `check_examples(fences, options)` are one-shot checks. Use a session for builds and watch loops; use `checker.clear()` to release cached programs and sources, or `checker.dispose()` to additionally reject future and queued checks. Already-running assertions settle normally.

The checker discovers the nearest `tsconfig.json` from its `root` by default. Set `tsconfig: "./tsconfig.docs.json"` for an explicit config relative to that root, or `tsconfig: false` for standalone snippets. Project configuration follows TypeScript's inheritance rules, including package-based `extends`, aliases, libraries, and ambient types. Configs are cached by content and reloaded when inherited files or package metadata change; invalid or explicitly missing configs produce diagnostics. With no discovered config, the checker uses standalone defaults.

Fences supply the program's entry files; a project's `include`, `files`, and project references do not add unrelated code. Imported dependencies are checked normally. Build-only constraints (`rootDir`, `composite`, and incremental output) are disabled and nothing is emitted. `compiler_options` overrides inherited settings; explicit relative paths resolve against the session’s `root` (or `baseUrl` for aliases).

Session compiler options and toolchain adapters are fixed at creation; pass assertion callbacks per check. Jobs within a session are serialized, including asynchronous assertions, and independent sessions have separate caches. `root` controls toolchain and relative filename resolution. A batch runs assertions only if every document passes static validation.

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

## Incremental compilation

[Explore real module IDs and highlight-cache reuse](https://svelte-widgets.janosh.dev/authoring#incremental-compilation), or [try the live counter with local HMR](https://svelte-widgets.janosh.dev/authoring/hot-reload).

Example module identities come from an explicit fence `id`, or from its language and source. Adding prose or another fence before an unchanged example no longer renames its module. Explicit IDs remain stable when their code changes and must be unique within the document.

During development, static prose between dynamic components lives in separate virtual components. Editing or inserting paragraphs, headings, and ordinary code fences updates that prose without resetting neighboring examples. Authored Svelte expressions keep their original scope. Changing frontmatter, scripts, dynamic markup, or the arrangement of live examples can replace the parent and reset state. Pages with their own scoped `<style>` or `<svelte:options>` keep the original component tree and do not isolate prose; production output always keeps the original tree.

`markdown_vite(engine, { highlight_cache_size: 256 })` caches highlighted fences per integration, shares concurrent work, and evicts the least recently used entries. Set the size to zero to disable caching. Changed prose reuses existing highlights; rejected requests are removed so a corrected highlighter can retry. Plugin teardown clears both compilation and highlighting caches.

## Editable playgrounds

Add `playground_vite()` alongside your normal Svelte Vite plugin, then import the generated local runtime into a page:

```ts
import { playground_vite } from 'svelte-widgets/code-playground/vite'

// Vite config: plugins: [sveltekit(), playground_vite()]
```

```svelte
<script>
  import { CodePlayground } from 'svelte-widgets'
  import runtime_source from 'virtual:svelte-widgets/playground'

  const files = {
    'App.svelte': `<h1>Hello from the playground</h1>`,
  }
</script>

<CodePlayground {files} {runtime_source} restore_hash />
```

Reference `svelte-widgets/code-playground/virtual` in your project's ambient types. The runtime bundles the installed Svelte locally; the compiler loads on demand. Projects support `.svelte`, `.js`, `.mjs`, `.html`, `.css`, and `.json` with explicit relative paths. JSON imports and reexports support `with { type: "json" }`, and literal dynamic imports support `{ with: { type: "json" } }`; these attributes are removed because JSON is compiled into JavaScript modules. Other import attributes fail during compilation. Supported Svelte modules are bundled; other packages fail clearly. A custom compiler or editor backend can be injected. The preview runs in an iframe without same-origin privileges and blocks network access. Run, Reset, file tabs, console output, and shareable project URLs are built in. Shared URL loading is opt-in with `restore_hash`; nothing is uploaded.

See the [interactive authoring demo](https://svelte-widgets.janosh.dev/authoring).

## Guided walkthroughs

`CodeWalkthrough` combines ordered steps, annotations, focused source lines, and before/after comparisons. Its step list supports Up/Down, Home, and End; changes also announce progress to assistive technology.

```svelte
<script>
  import { CodeWalkthrough } from 'svelte-widgets'

  const steps = [
    { id: `state`, title: `Create state`, code: `let count = $state(0)` },
    {
      id: `update`,
      title: `Update state`,
      before: `let count = $state(0)`,
      code: `let count = $state(0)\ncount += 1`,
      focus_lines: [2],
      annotations: { 2: `Add one` },
    },
  ]
</script>

<CodeWalkthrough {steps} />
```

Bind `active_id` to control the selected step. Supply a `preview(step)` snippet for a running example and `onstep(step, index)` for application state. Focus lines and annotation keys are one-based; invalid references and duplicate step IDs fail explicitly. Comparisons use a linear prefix/suffix algorithm: the middle is one replacement hunk, so large examples avoid quadratic diff work. Labels are customizable through `labels`. The copy button copies the selected source without line numbers, diff markers, or annotations.

## Scientific references

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
const document = assert_ok(await engine.parse(source, { dialect: `markdown` }))
const html = assert_ok(await render_markdown(document))
```

```md
See [@eq:energy] and [@fig:result], following [@doe2020].

$$ {#eq:energy}
E = mc^2
$$

![The experimental result](result.svg){#fig:result}

::: bibliography
```

Forward references resolve after parsing; figures and equations have independent numbering. Group citations with `[@first; @second]`. Cited entries appear in first-use order at `::: bibliography`, or at the end if the directive is omitted. Bibliography records support `title`, `authors`, `year`, `url`, and `doi`; configure the heading with `bibliography_title`. Duplicate labels and unresolved references fail with original source locations. Code spans, fences, and authored scripts remain literal. Manifests include reference targets, generated anchors, figure assets, and citation links, so ordinary content validation covers them too.

## Migration

Create an engine with `create_markdown(options)` and pass it to `markdown(engine)` or `markdown_vite(engine)`. Replace source-to-output calls with `engine.parse()` followed by `compile_markdown(document)` or `render_markdown(document)`, using `assert_ok()` at throwing boundaries. Replace implicit frontmatter references such as `{title}` with `{metadata.title}`. Replace custom or misspelled fence options with the supported typed settings. Replace `check_markdown()` with a reusable `create_checker()` session or `check_document(document)`; `throw_on_error` and checker `markdown_options` are removed. Replace manifest `.position` with `.range.start`, and `.code_position` with `.code_range.start`. Remove remark plugin registration and the old live-example Vite plugin. Move `defaults.Wrapper` to `examples.wrapper`; use `hide_style`, not `hideStyle`. Replace the KaTeX before/after pair with `math`. Highlighter callbacks now return inner HTML; use `default_highlighter.highlight` or `create_highlighter(grammars).highlight`. Highlighting now lives at `/highlight`; the `/live-examples`, `/live-examples/create-highlighter` and `/katex` subpaths are removed. Plain HTML callers should use `render_markdown()` and remove Svelte-output unwrapping and brace-replacement workarounds.
