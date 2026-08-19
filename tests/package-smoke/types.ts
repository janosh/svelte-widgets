import {
  listen_theme_storage,
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
