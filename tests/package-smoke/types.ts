import {
  listen_theme_storage,
  type CodeHighlighter,
  type StatItem,
  type DialogCloseDetail,
  type DialogProps,
  type Hotkey,
  type PositionOptions,
  type PositionResult,
  type ThemeMode,
} from 'svelte-widgets'
import type { FileDropOptions } from 'svelte-widgets/attachments'
import type {
  CodeEditorOptions,
  DiffViewOptions,
  EditorModel,
  LineWindow,
} from 'svelte-widgets/code-editor'
import { theme } from 'svelte-widgets/theme'
import { get_label } from 'svelte-widgets/utils'
import { rows_to_csv } from 'svelte-widgets/csv'
import { format_bytes } from 'svelte-widgets/format'
import { format_stat_delta } from 'svelte-widgets/stats'
import { url_with_params, valid_query_param } from 'svelte-widgets/url-params'
import { draw_markup_strokes, object_fit_contain_box } from 'svelte-widgets/image-markup'

export const label = get_label(`package smoke`)
export const theme_mode: ThemeMode = theme.mode
export const diff_options: DiffViewOptions = {
  font_size: 13,
  context_lines: 3,
  layout: `side-by-side`,
}
export const editor_options: CodeEditorOptions = {
  font_size: 13,
  tab_size: 2,
  insert_spaces: true,
  line_numbers: true,
}
export const editor_model_type: EditorModel | null = null
export const dialog_close_detail: DialogCloseDetail = { via: `close` }
export const dialog_closedby: DialogProps[`closedby`] = `closerequest`
export const dialog_open: DialogProps[`open`] = false
export const hotkey: Hotkey = { keys: `Escape`, handler: () => undefined }
export const line_window: LineWindow = { start: 0, end: 0 }
export const position_options: PositionOptions = { placement: `auto` }
export const position_result: PositionResult = { top: 0, left: 0, placement: `bottom` }
export const start_theme_storage_listener = () => listen_theme_storage()
export const file_drop_handler: FileDropOptions[`on_files`] = (files, signal) => ({
  aborted: signal.aborted,
  file_count: files.length,
})

export const highlighter: CodeHighlighter = (code) => [{ text: code }]
export const statistic: StatItem = { label: 'Count', value: 3, delta: 1 }
export const csv = rows_to_csv([{ name: 'one,two', count: 2 }])
export const bytes = format_bytes(1024)
export const delta = format_stat_delta(-2)
export const relative_url = url_with_params(
  [['page', '2']],
  new URL('https://example.com/'),
)
export { create_canvas_surface as canvas_factory } from 'svelte-widgets/canvas'
export { create_roving_focus as focus_factory } from 'svelte-widgets/roving-focus'

export const image_box = object_fit_contain_box(200, 100, 100, 100)
const sort = valid_query_param(new URLSearchParams(`sort=energy`), `sort`, `force`, {
  force: 0,
  energy: 1,
})
export const sort_key: `energy` | `force` = sort
// @ts-expect-error The validator may return any record key, not just the fallback.
export const unsound_sort: `force` = sort
export const empty_csv = rows_to_csv([], [`name`, `value`] as const)
export const draw_worker_markup = (context: OffscreenCanvasRenderingContext2D) =>
  draw_markup_strokes(context, [{ color: `red`, points: [{ x: 1, y: 2 }] }] as const, 3)
