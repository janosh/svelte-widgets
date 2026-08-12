## `CodeEditor`

`CodeEditor` combines a native textarea with a virtualized syntax-token overlay. It updates a bindable LF-normalized `text` buffer synchronously, sends incremental line edits to a host-supplied `EditorBackend`, and supports indentation, comment toggling, bracket pairing, active line numbers, and Cmd/Ctrl+S. Press Escape and then Tab to move keyboard focus out of the editor. File reads, draft storage, conflict handling, and persistence remain host policy; provide `on_save` only when this surface should save directly.

Import the shared token palette once wherever the editor or diff view is used:

```ts
import { CodeEditor } from 'svelte-widgets'
import type { EditorBackend } from 'svelte-widgets/code-editor'
import 'svelte-widgets/code-editor/editor.css'
```

Pass `backend` to one editor, as below, or call `set_editor_backend()` once during app startup. A production backend can keep documents in a worker, native process, WASM module, or server session.

```svelte example id="code-editor-basic"
<script lang="ts">
  import '$lib/code-editor/editor.css'
  import { CodeEditor } from '$lib'
  import { editor_text, TOKEN_CLASS_NAMES } from '$lib/code-editor'
  import type { EditorBackend } from '$lib/code-editor'

  const initial_text = `const greeting = \`Hello\`\nconsole.log(greeting)\n`
  let text = $state(initial_text)
  let saved_text = $state(initial_text)
  let status = $state(`Edit the buffer, then press Cmd/Ctrl+S`)
  let lines = initial_text.split(`\n`)

  const keyword_class = TOKEN_CLASS_NAMES.indexOf(`keyword`)
  const spans_for = (line: string) => {
    const match = /\b(?:const|let|function|return)\b/u.exec(line)
    return match
      ? [0, 0, match.index, keyword_class, match.index + match[0].length, 0]
      : []
  }

  const backend: EditorBackend = {
    open_doc: ({ text: raw_text }) => {
      lines = editor_text(raw_text).split(`\n`)
      return Promise.resolve({
        language: `TypeScript`,
        lineCount: lines.length,
        eol: raw_text.includes(`\r\n`) ? `crlf` : `lf`,
        hadBom: raw_text.startsWith(`\uFEFF`),
        highlightable: true,
        editable: true,
      })
    },
    highlight_lines: ({ startLine, endLine }) =>
      Promise.resolve(lines.slice(startLine, endLine).map(spans_for)),
    apply_edit: ({
      startLine,
      removedCount,
      insertedLines,
      expectedLineCount,
      expectedTotalLength,
    }) => {
      const next_lines = lines.toSpliced(startLine, removedCount, ...insertedLines)
      if (
        next_lines.length !== expectedLineCount ||
        next_lines.join(`\n`).length !== expectedTotalLength
      ) {
        return Promise.reject(new Error(`Editor buffers diverged`))
      }
      lines = next_lines
      return Promise.resolve(lines.length)
    },
    set_text: ({ text: next_text }) => {
      lines = next_text.split(`\n`)
      return Promise.resolve(lines.length)
    },
    close_doc: () => Promise.resolve(),
  }

  const save = (buffer: string) => {
    saved_text = buffer
    status = `Saved ${buffer.length} characters in host memory`
  }
</script>

<div style="height: 13rem; border: 1px solid lightgray">
  <CodeEditor {backend} bind:text filename="greeting.ts" on_save={save} />
</div>

<p>{status}. Saved buffer matches: {saved_text === text ? `yes` : `no`}.</p>
```

The backend never receives file paths or save requests. It only owns the open document and token/edit protocol; binding `text` is enough for a host that saves elsewhere, while `on_save` and the exported `save()` method provide an opt-in persistence hook.

## `DiffView`

`DiffView` renders side-by-side or unified diffs from a host-supplied `DiffBackend`. The
package owns virtualization, gap expansion, layout switching and accessible line
structure; the backend owns language detection and diff generation, so it can run in a
worker, native process, WASM module or server route.

Import the shared stylesheet once wherever the component is used:

```ts
import { DiffView } from 'svelte-widgets'
import type { DiffBackend } from 'svelte-widgets/code-editor'
import 'svelte-widgets/code-editor/editor.css'
```

Pass `backend` to an individual view, as below, or call `set_diff_backend()` once during
app startup.

```svelte example id="diff-view-basic"
<script lang="ts">
  import '$lib/code-editor/editor.css'
  import { DiffView } from '$lib'
  import { EMPHASIS_BIT, TOKEN_CLASS_NAMES } from '$lib/code-editor'
  import type { DiffBackend, DiffResult, DiffRow, RowKind } from '$lib/code-editor'

  const unchanged_prefix = [
    `type GreetingOptions = {`,
    `  excited?: boolean`,
    `}`,
    ``,
    `const default_name = \`world\``,
    ``,
  ]
  const old_lines = [
    ...unchanged_prefix,
    `import { format } from './format'`,
    ``,
    `export function greet(name: string) {`,
    `  const message = \`Hello, \${name}!\``,
    `  console.log(message)`,
    `  return message`,
    `}`,
    ``,
    `greet(\`world\`)`,
  ]
  const new_lines = [
    ...unchanged_prefix,
    `import { format } from './format'`,
    ``,
    `export function greet(name: string, excited = false) {`,
    `  const punctuation = excited ? \`!\` : \`.\``,
    `  const message = \`Hello, \${name}\${punctuation}\``,
    `  console.info(message)`,
    `  return message`,
    `}`,
    ``,
    `greet(\`world\`, true)`,
  ]
  const old_text = `${old_lines.join(`\n`)}\n`
  const new_text = `${new_lines.join(`\n`)}\n`

  const token = (name: (typeof TOKEN_CLASS_NAMES)[number], emphasized = false) =>
    TOKEN_CLASS_NAMES.indexOf(name) | (emphasized ? EMPHASIS_BIT : 0)
  // A tiny fixture tokenizer: enough to demonstrate token color and changed-word emphasis
  // without bundling a language grammar or diff engine into the docs site.
  const spans_for = (text: string) => {
    const match = /\b(?:log|info|function|const)\b/u.exec(text)
    if (!match) return []
    const emphasized = match[0] === `log` || match[0] === `info`
    return [
      0,
      token(`plain`),
      match.index,
      token(emphasized ? `function` : `keyword`, emphasized),
      match.index + match[0].length,
      token(`plain`),
    ]
  }
  const line = (lines: string[], lineNo: number) => {
    const text = lines[lineNo - 1] ?? ``
    return { lineNo, text, spans: spans_for(text) }
  }
  const row = (kind: RowKind, old_no: number | null, new_no: number | null): DiffRow => ({
    kind,
    old: old_no === null ? null : line(old_lines, old_no),
    new: new_no === null ? null : line(new_lines, new_no),
  })

  const result = {
    hunks: [
      {
        oldStart: 7,
        newStart: 7,
        skippedBefore: 6,
        rows: [
          row(`equal`, 7, 7),
          row(`equal`, 8, 8),
          row(`replace`, 9, 9),
          row(`insert`, null, 10),
          row(`replace`, 10, 11),
          row(`replace`, 11, 12),
          row(`equal`, 12, 13),
          row(`equal`, 13, 14),
          row(`equal`, 14, 15),
          row(`replace`, 15, 16),
        ],
      },
    ],
    added: 5,
    removed: 4,
    language: `typescript`,
    oldLineCount: old_lines.length,
    newLineCount: new_lines.length,
    skippedAfter: 0,
    oldEndsWithNewline: true,
    newEndsWithNewline: true,
    truncated: false,
  } satisfies DiffResult

  const backend: DiffBackend = {
    // Fixed fixture: a production backend inspects all DiffTextArgs fields.
    diff_text: () => Promise.resolve(result),
  }
</script>

<DiffView
  {backend}
  {old_text}
  {new_text}
  options={{ font_size: 13, context_lines: 2, layout: `side-by-side` }}
  filename="greeting.ts"
  old_label="Before"
  new_label="After"
  style="height: 12rem; border: 1px solid lightgray"
/>
```

The demo backend returns a fixed `DiffResult` to keep the browser bundle dependency-free.
A production backend receives `oldText`, `newText`, `filename` and `contextLines` through
`diff_text()` and can return syntax spans for token coloring and intra-line emphasis.
