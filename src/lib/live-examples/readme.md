# Syntax highlighting

`default_highlighter` loads starry-night's common grammars plus Svelte on first use. Importing this subpath does not compile grammars or load WASM. Starry-night is an optional peer dependency.

```ts
import { default_highlighter } from 'svelte-widgets/live-examples'
import { markdown } from 'svelte-widgets/markdown'

const preprocess = markdown({ highlight: default_highlighter.highlight })
```

Use `create_highlighter(grammars)` for a smaller or different grammar set. The factory exposes `highlight(code, language)` for inner HTML, `highlight_block(code, language)` for a complete `<pre><code>` block, and `ready()` for the cached underlying instance. Unknown languages render as escaped text.

```ts
import grammar_typst from '@wooorm/starry-night/source.typst'
import { create_highlighter } from 'svelte-widgets/live-examples/create-highlighter'

const highlighter = create_highlighter([grammar_typst])
const html = await highlighter.highlight_block(`#let value = 1`, `typ`)
```

For runnable Svelte fences, use [the Markdown Vite integration](../markdown/readme.md).
