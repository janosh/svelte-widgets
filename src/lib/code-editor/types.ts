// Public backend payloads and library methods use snake_case.
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
export const EMPHASIS_BIT = 0x80
export const CLASS_MASK = 0x7f
// Flat UTF-16 [start, packed_class, ...] spans; empty means unstyled.
export type SpanList = number[]
export type Eol = `lf` | `crlf`
export type EditorSelection = { readonly anchor: number; readonly head: number }
export type TextEdit = {
  readonly from: number
  readonly to: number
  readonly insert: string
}
export type EditorUpdateSource = `input` | `command` | `external` | `undo` | `redo`
export interface EditorTransaction {
  readonly base_revision: number
  readonly revision: number
  readonly edits: readonly TextEdit[]
  readonly selection_before: EditorSelection
  readonly selection: EditorSelection
  readonly source: EditorUpdateSource
}
export type EditorUpdate = {
  revision: number
  selection: EditorSelection
  dirty: boolean
  transaction?: EditorTransaction
}
export type EditorLine = { line_idx: number; from: number; to: number; text: string }
export type EditorModelInit = { uri: string; text: string; history_limit_chars?: number }
export interface TransactOptions {
  selection?: EditorSelection
  source?: EditorUpdateSource
  history_group?: string | null
  timestamp?: number
  add_to_history?: boolean
}
export interface EditorModel {
  readonly uri: string
  readonly revision: number
  readonly length: number
  readonly line_count: number
  readonly selection: EditorSelection
  readonly dirty: boolean
  readonly eol: Eol
  readonly had_bom: boolean
  slice: (from?: number, to?: number) => string
  line: (line_idx: number) => EditorLine
  line_at: (offset: number) => EditorLine
  text: () => string
  disk_text: () => string
  transact: (edits: readonly TextEdit[], options?: TransactOptions) => EditorTransaction
  set_selection: (selection: EditorSelection) => void
  undo: () => boolean
  redo: () => boolean
  mark_saved: () => void
  subscribe: (listener: (update: EditorUpdate) => void) => () => void
}
export type OpenDocResult = {
  language: string
  highlightable: boolean
  editable: boolean
}
export interface EditorDocumentInfo extends OpenDocResult {
  uri: string
  line_count: number
  eol: Eol
  had_bom: boolean
}
export type RowKind = `equal` | `delete` | `insert` | `replace`
export type DiffLine = { line_no: number; text: string; spans: SpanList }
export type DiffRow = { kind: RowKind; old: DiffLine | null; new: DiffLine | null }
export interface DiffHunk {
  old_start: number
  new_start: number
  skipped_before: number
  rows: DiffRow[]
}
export interface DiffResult {
  hunks: DiffHunk[]
  added: number
  removed: number
  language: string
  old_line_count: number
  new_line_count: number
  skipped_after: number
  old_ends_with_newline: boolean
  new_ends_with_newline: boolean
  truncated: boolean
}
export type DiffLayout = `side-by-side` | `unified`
export type DiffViewOptions = {
  font_size: number
  context_lines: number
  layout: DiffLayout
}
export interface CodeEditorOptions {
  font_size?: number
  tab_size?: number
  insert_spaces?: boolean
  line_numbers?: boolean
  line_comment?: string | null
}
export const to_error = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))
export type OpenDocArgs = { doc_id: string; uri: string; revision: number; text: string }
export interface HighlightLinesArgs {
  doc_id: string
  request_id: number
  revision: number
  start_line: number
  end_line: number
}
export interface ApplyEditsArgs {
  doc_id: string
  base_revision: number
  revision: number
  edits: readonly TextEdit[]
  expected_line_count: number
  expected_length: number
}
export type SetTextArgs = { doc_id: string; revision: number; text: string }
export type CancelHighlightArgs = { doc_id: string; request_id: number }
export type CloseDocArgs = { doc_id: string }
export type DiffTextArgs = {
  old_text: string
  new_text: string
  filename: string
  context_lines: number
}
export interface EditorBackend {
  open_doc: (args: OpenDocArgs) => Promise<OpenDocResult>
  highlight_lines: (args: HighlightLinesArgs) => Promise<SpanList[]>
  apply_edits: (args: ApplyEditsArgs) => Promise<number>
  set_text: (args: SetTextArgs) => Promise<number>
  cancel_highlight: (args: CancelHighlightArgs) => Promise<void> | void
  close_doc: (args: CloseDocArgs) => Promise<void>
}
export interface DiffBackend {
  diff_text: (args: DiffTextArgs) => Promise<DiffResult>
}
const backend_registry = <Backend>(backend_name: string, setter_name: string) => {
  let default_backend: Backend | null = null
  const set_backend = (backend: Backend | null): void => void (default_backend = backend)
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
