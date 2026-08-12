// Wire shapes for editor/diff renderers and their backends. Hosts supply expensive
// span/diff work; components only render.
//
// Payload fields stay camelCase for Tauri/JSON-RPC/HTTP forwarding; library method
// names stay snake_case.

// Semantic token classes. The index is the wire value and the string is the
// `--tok-<name>` CSS variable suffix, so the renderer needs no other lookup.
export const TOKEN_CLASS_NAMES = [
  `plain`,
  `comment`,
  `string`,
  `escape`,
  `number`,
  `constant`,
  `keyword`,
  `operator`,
  `function`,
  `type`,
  `parameter`,
  `variable`,
  `tag`,
  `attribute`,
  `punctuation`,
  `invalid`,
] as const

export type TokenClassName = (typeof TOKEN_CLASS_NAMES)[number]

// Bit 7 of a packed span marks an intra-line diff change, leaving the low 7 bits
// for the class. Editor tokens never set it.
export const EMPHASIS_BIT = 0x80
export const CLASS_MASK = 0x7f

// Flat [start, packed, ...] tiling; each span ends at the next start or EOL. Starts are
// UTF-16 offsets. Empty means the whole line is unstyled.
export type SpanList = number[]

export type Eol = `lf` | `crlf`

export interface OpenDocResult {
  language: string
  lineCount: number
  eol: Eol
  hadBom: boolean
  // False past the backend's highlight size limit: the document is still
  // editable, it just renders as plain text.
  highlightable: boolean
  // False past the backend's edit size limit, so open read-only. The backend
  // decides both gates so the thresholds cannot drift from what they guard.
  editable: boolean
}

export type RowKind = `equal` | `delete` | `insert` | `replace`

export interface DiffLine {
  lineNo: number // 1-based, on its own side
  text: string
  spans: SpanList
}

// Side-by-side renders old/new with spacers; replace carries both with emphasis.
// Unified must emit equal once with both numbers or every context line doubles.
export interface DiffRow {
  kind: RowKind
  old: DiffLine | null
  new: DiffLine | null
}

export interface DiffHunk {
  // 1-based like DiffLine.lineNo; expanded gaps start at oldStart - skippedBefore.
  // 0-based would silently show the wrong neighbors.
  oldStart: number
  newStart: number
  // Unchanged lines elided before this hunk, for the "N unchanged lines" expander.
  skippedBefore: number
  rows: DiffRow[]
}

export interface DiffResult {
  hunks: DiffHunk[]
  added: number
  removed: number
  language: string
  oldLineCount: number
  newLineCount: number
  // Trailing unchanged lines, counted like newLineCount; both sides elide equally.
  skippedAfter: number
  // Marks final-newline-only changes, whose text rows otherwise look identical.
  oldEndsWithNewline: boolean
  newEndsWithNewline: boolean
  // A guard fired (diff deadline, or lines too long to word-diff). The result is
  // still valid, just coarser.
  truncated: boolean
}

export type DiffLayout = `side-by-side` | `unified`

// Presentation knobs both components read. A host with a settings store maps it
// onto this once rather than handing the whole store to a widget.
export interface DiffViewOptions {
  font_size: number
  // Unchanged lines kept around each change. Changing it re-runs the diff.
  context_lines: number
  // Seeds the layout toggle; the toggle owns it from then on.
  layout: DiffLayout
}

export interface CodeEditorOptions {
  font_size?: number
  tab_size?: number
  insert_spaces?: boolean
  line_numbers?: boolean
  // Override filename-based comment detection; null disables the command.
  line_comment?: string | null
}

export const to_error = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

// === Backend contracts ===

export interface OpenDocArgs {
  // Unique per open editor: two views of one file must NOT share an id, or
  // closing either drops the other's backend document.
  docId: string
  filename: string
  // The document as it sits on disk, before newline/BOM normalization, so the
  // backend can report the EOL style and BOM to reproduce on save.
  text: string
}

export interface HighlightLinesArgs {
  docId: string
  startLine: number
  endLine: number
}

export interface ApplyEditArgs {
  docId: string
  startLine: number
  removedCount: number
  insertedLines: string[]
  // Predicted post-splice count only detects prior line-count desync; a wrong splice
  // with the right count passes. expectedTotalLength guards the derivation.
  expectedLineCount: number
  // UTF-16 textarea length read directly from the value: the real derivation guard.
  expectedTotalLength: number
}

export interface SetTextArgs {
  docId: string
  text: string
}

export interface CloseDocArgs {
  docId: string
}

export interface DiffTextArgs {
  oldText: string
  newText: string
  filename: string
  // Unchanged lines kept around each change. Everything beyond them reaches the
  // renderer as a `skippedBefore` / `skippedAfter` count instead of a row.
  contextLines: number
}

// Stateful highlighter: open_doc registers a buffer; later calls address it by id.
export interface EditorBackend {
  open_doc: (args: OpenDocArgs) => Promise<OpenDocResult>
  // Spans for `[startLine, endLine)`, one entry per line.
  highlight_lines: (args: HighlightLinesArgs) => Promise<SpanList[]>
  // Rejecting is how a backend reports that the two buffers have diverged; the
  // client answers with a full `set_text`. Resolves to the new line count.
  apply_edit: (args: ApplyEditArgs) => Promise<number>
  set_text: (args: SetTextArgs) => Promise<number>
  close_doc: (args: CloseDocArgs) => Promise<void>
}

export interface DiffBackend {
  diff_text: (args: DiffTextArgs) => Promise<DiffResult>
}

// === Default backends ===
//
// Register usual backends once; prop overrides remain for tests and special views.
const backend_registry = <Backend>(backend_name: string, setter_name: string) => {
  let default_backend: Backend | null = null
  const set_backend = (backend: Backend | null): void => {
    default_backend = backend
  }
  const resolve_backend = (override?: Backend): Backend => {
    const backend = override ?? default_backend
    if (!backend)
      throw new Error(
        `No ${backend_name} available: pass a \`backend\` prop or call ${setter_name}() once at startup`,
      )
    return backend
  }
  return [set_backend, resolve_backend] as const
}

export const [set_editor_backend, resolve_editor_backend] =
  backend_registry<EditorBackend>(`EditorBackend`, `set_editor_backend`)
export const [set_diff_backend, resolve_diff_backend] = backend_registry<DiffBackend>(
  `DiffBackend`,
  `set_diff_backend`,
)
