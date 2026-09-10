<script lang="ts" module>
  let next_doc_seq = 0
</script>

<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { css_px, register_escape_layer } from '../attachments/shared'
  import { merge_defaults, CODE_EDITOR_LABELS, type CodeEditorLabels } from '../labels'
  import { clamp_integer } from '../utils'
  import {
    auto_close_pair,
    auto_indent_newline,
    dedent_selection,
    editor_font_size,
    editor_line_height,
    indent_selection,
    toggle_line_comment,
    visible_line_window,
  } from './edit-ops'
  import type { EditorState, RangeEdit } from './edit-ops'
  import { create_highlight_client } from './highlight-client'
  import type { HighlightSpansEvent } from './highlight-client'
  import { line_comment_token } from './languages'
  import { render_tokens } from './tokens'
  import { resolve_editor_backend, to_error } from './types'
  import type {
    CodeEditorOptions,
    EditorBackend,
    EditorDocumentInfo,
    EditorModel,
    EditorSelection,
    EditorTransaction,
    EditorUpdate,
    SpanList,
    TextEdit,
  } from './types'

  const keyboard_help_id = $props.id()
  const OVERSCAN_ROWS = 8
  const TOKEN_CACHE_LINES = 2048
  const CONTEXT_CHECK_CHARS = 32
  const graphemes = new Intl.Segmenter(undefined, { granularity: `grapheme` })
  const words = new Intl.Segmenter(undefined, { granularity: `word` })
  let {
    model,
    options = {},
    read_only = false,
    aria_label,
    backend,
    on_update,
    on_ready,
    on_save,
    on_error,
    labels,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    model: EditorModel
    options?: CodeEditorOptions
    read_only?: boolean
    aria_label?: string
    backend?: EditorBackend
    on_update?: (update: EditorUpdate) => void
    on_ready?: (document: EditorDocumentInfo) => void
    on_save?: (text: string, document: EditorDocumentInfo) => Promise<void> | void
    on_error?: (message: string) => void
    // Override any user-facing string; omitted keys keep the English default.
    labels?: Partial<CodeEditorLabels>
  } = $props()

  const msg = $derived(merge_defaults(CODE_EDITOR_LABELS, labels))
  let textarea = $state<HTMLTextAreaElement>()
  let scrollport = $state<HTMLDivElement>()
  let input_from = $state(0)
  let input_to = 0
  let rendered_selection: EditorSelection | null = null
  let doc_info = $state<EditorDocumentInfo | null>(null)
  let error_message = $state<string | null>(null)
  let model_revision = $state(0)
  // Bumped when highlight spans land, so the viewport LRU touch re-runs then
  let token_revision = $state(0)
  let scroll_top = $state(0)
  let viewport_height = $state(0)
  let viewport_width = $state(0)
  let overlay_width = $state(0)
  let caret_line = $state(0)
  let saving = $state(false)
  let local_model_update = false
  let refreshing_input = false
  let tab_moves_focus = false
  let preferred_column: number | null = null
  let preferred_head = -1
  let composing = false
  let composition_seq = 0
  let composition_range: EditorSelection | null = null
  let unregister_escape: (() => void) | undefined
  type InputSnapshot = EditorSelection & { input_type: string; value_length: number }
  let before_snapshot: InputSnapshot | null = null
  let active_client: ReturnType<typeof create_highlight_client> | null = null
  // Plain Map, not SvelteMap: the LRU touch on every render pass made reactive entries
  // rebuild `visible_rows` and reconcile the DOM twice. `token_revision` sequences reads.
  const token_cache = new Map<number, SpanList>()
  const font_size = $derived(editor_font_size(Number(options.font_size)))
  const tab_size = $derived(clamp_integer(Number(options.tab_size), 1, 16, 2))
  const line_height = $derived(editor_line_height(font_size))
  const indent = $derived(options.insert_spaces === false ? `\t` : ` `.repeat(tab_size))
  const comment_token = $derived(
    options.line_comment === undefined
      ? line_comment_token(model.uri)
      : options.line_comment,
  )
  const show_line_numbers = $derived(options.line_numbers ?? true)
  const editing_disabled = $derived(read_only || !doc_info?.editable)
  const report_error = (error: unknown): void => {
    const message = to_error(error).message
    error_message = message
    on_error?.(message)
  }
  const touch_tokens = (start: number, end: number): boolean => {
    let complete = true
    for (let line_idx = start; line_idx < end; line_idx++) {
      const spans = token_cache.get(line_idx)
      if (!spans) {
        complete = false
        continue
      }
      token_cache.delete(line_idx)
      token_cache.set(line_idx, spans)
    }
    return complete
  }
  // Drop only spans an edit can have invalidated: lines before the first edit are untouched.
  // Clearing the whole cache blanked the viewport until the debounced re-highlight returned.
  const invalidate_tokens = (
    active_model: EditorModel,
    transaction: EditorTransaction,
  ): void => {
    const { edits } = transaction
    if (edits.length === 0) return
    token_revision += 1
    // `validate_edits` rejects `from < previous_end`, so edits ascend; text before the first
    // is identical in both documents, so this line index means the same either side of it.
    const first_line = active_model.line_at(edits[0].from).line_idx
    // Even one character can open a multiline comment/string and change later tokens.
    // safe to delete while iterating: a Map's key iterator skips entries dropped ahead of it
    for (const line_idx of token_cache.keys()) {
      if (line_idx >= first_line) token_cache.delete(line_idx)
    }
  }
  const receive_spans = ({ start_line, revision, spans }: HighlightSpansEvent): void => {
    if (revision !== model.revision) return
    for (const [offset, line_spans] of spans.entries()) {
      const line_idx = start_line + offset
      token_cache.delete(line_idx)
      token_cache.set(line_idx, line_spans)
    }
    while (token_cache.size > TOKEN_CACHE_LINES) {
      const oldest = token_cache.keys().next().value
      if (oldest === undefined) break
      token_cache.delete(oldest)
    }
    token_revision += 1
  }
  const line_count = $derived.by(() => {
    void model_revision
    return model.line_count
  })
  const window_lines = $derived(
    visible_line_window(
      scroll_top,
      viewport_height,
      line_height,
      line_count,
      OVERSCAN_ROWS,
    ),
  )
  const visible_rows = $derived.by(() => {
    void model_revision
    void token_revision
    const { start, end } = window_lines
    return Array.from({ length: end - start }, (_unused, offset) => {
      const line_idx = start + offset
      const line = model.line(line_idx)
      return {
        line_idx,
        top: line_idx * line_height,
        tokens: render_tokens(line.text, token_cache.get(line_idx) ?? []),
      }
    })
  })
  const total_height = $derived(line_count * line_height)
  const gutter_digits = $derived(String(line_count).length)
  const dom_selection = ({
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: direction,
  }: HTMLTextAreaElement): EditorSelection =>
    direction === `backward` ? { anchor: end, head: start } : { anchor: start, head: end }
  const set_dom_selection = (
    area: HTMLTextAreaElement,
    { anchor, head }: EditorSelection,
  ): void => {
    const direction = anchor > head ? `backward` : `forward`
    const start = Math.max(
      0,
      Math.min(area.value.length, Math.min(anchor, head) - input_from),
    )
    const end = Math.max(
      0,
      Math.min(area.value.length, Math.max(anchor, head) - input_from),
    )
    if (
      area.selectionStart !== start ||
      area.selectionEnd !== end ||
      area.selectionDirection !== direction
    )
      area.setSelectionRange(start, end, direction)
    rendered_selection = dom_selection(area)
  }
  const reveal_selection = (): void => {
    const port = scrollport
    if (!port) return
    const top = model.line_at(model.selection.head).line_idx * line_height
    if (top < scroll_top) scroll_top = top
    else if (top + line_height > scroll_top + port.clientHeight)
      scroll_top = Math.max(0, top + line_height - port.clientHeight)
    port.scrollTop = scroll_top
  }
  // Native input owns only visible lines and explicit selections. A selection spanning
  // the document deliberately expands this window so native copy/cut and AT keep working.
  const refresh_input = (reveal = false): void => {
    const area = textarea
    if (!area || composing || before_snapshot) return
    if (reveal) reveal_selection()
    const window = visible_line_window(
      scroll_top,
      viewport_height,
      line_height,
      model.line_count,
      OVERSCAN_ROWS,
    )
    const { anchor, head } = model.selection
    if (anchor !== head || reveal) {
      window.start = Math.min(
        window.start,
        model.line_at(Math.min(anchor, head)).line_idx,
      )
      window.end = Math.max(
        window.end,
        model.line_at(Math.max(anchor, head)).line_idx + 1,
      )
    }
    input_from = model.line(window.start).from
    input_to = window.end < model.line_count ? model.line(window.end).from : model.length
    const value = model.slice(input_from, input_to)
    // Position synchronously before setting a caret: native navigation uses layout before
    // Svelte's next render, and stale window geometry can swallow an arrow-key movement.
    area.style.top = `${window.start * line_height}px`
    area.style.height = `${Math.max(1, window.end - window.start) * line_height}px`
    refreshing_input = true
    try {
      if (area.value !== value) area.value = value
      set_dom_selection(area, model.selection)
    } finally {
      refreshing_input = false
    }
    // The outer viewport owns scrolling; the native field must not introduce a second offset.
    area.scrollTop = 0
    area.scrollLeft = 0
    if (reveal) {
      measure_overlay_width()
      reveal_horizontal_selection()
    }
  }
  $effect(() => {
    const active_model = model
    const active = create_highlight_client({
      doc_id: `code-editor-${++next_doc_seq}`,
      model: active_model,
      backend: resolve_editor_backend(backend),
      on_spans: (event) => {
        if (active_client === active) receive_spans(event)
      },
      on_error: report_error,
    })
    active_client = active
    const is_current = (): boolean => active_client === active && model === active_model
    untrack(() => {
      token_cache.clear()
      token_revision += 1
    })
    doc_info = null
    error_message = null
    scroll_top = 0
    overlay_width = 0
    caret_line = active_model.line_at(active_model.selection.head).line_idx
    before_snapshot = null
    const unsubscribe = active_model.subscribe((update) => {
      if (!is_current()) return
      caret_line = active_model.line_at(update.selection.head).line_idx
      if (update.transaction) {
        // Bumped only for transactions, which `line_count`/`visible_rows` read to re-read
        // the rope; bumping on bare selection changes re-read every row on each caret move.
        model_revision += 1
        invalidate_tokens(active_model, update.transaction)
        active.apply_transaction(update.transaction)
      }
      if (!local_model_update) refresh_input(true)
      on_update?.(update)
    })
    queueMicrotask(() => {
      if (!is_current() || !textarea) return
      if (scrollport) {
        scrollport.scrollTop = 0
        scrollport.scrollLeft = 0
      }
      refresh_input(true)
    })
    active
      .open()
      .then((result) => {
        if (!is_current()) return
        doc_info = {
          ...result,
          uri: active_model.uri,
          line_count: active_model.line_count,
          eol: active_model.eol,
          had_bom: active_model.had_bom,
        }
        error_message = null
        on_ready?.(doc_info)
      })
      .catch((error) => {
        if (is_current()) report_error(error)
      })
    return () => {
      active_client = null
      unsubscribe()
      void active.close().catch((error) => {
        console.error(
          `Failed to close editor backend document for ${active_model.uri}`,
          error,
        )
      })
    }
  })
  $effect(() => {
    void model_revision
    // Arriving spans are what make an uncached window cached, so the LRU touch below must
    // re-run then; `model_revision` no longer covers it, hence a signal of its own.
    void token_revision
    const { start, end } = window_lines
    const cached = untrack(() => touch_tokens(start, end))
    if (doc_info?.highlightable && !cached) active_client?.request_highlight(start, end)
  })
  const measure_overlay_width = (): void => {
    const area = textarea
    if (!area) return
    area.style.minWidth = `0`
    const width = Math.max(area.scrollWidth, area.clientWidth)
    // Caret scrolling must see the new width before the next Svelte render.
    area.style.minWidth = `${width}px`
    if (width !== overlay_width) overlay_width = width
  }
  $effect(() => {
    void viewport_height
    void viewport_width
    void scroll_top
    void model_revision
    untrack(() => refresh_input())
    if (scrollport) scrollport.scrollTop = scroll_top
    measure_overlay_width()
  })
  const on_focus = (): void => {
    unregister_escape ??= register_escape_layer((event) => {
      event.preventDefault()
      event.stopPropagation()
      tab_moves_focus = true
      return true
    })
  }
  const on_blur = (): void => {
    unregister_escape?.()
    unregister_escape = undefined
    tab_moves_focus = false
  }
  onDestroy(on_blur)
  const selection_of = (
    area: HTMLTextAreaElement,
    preserve_clamped = true,
  ): EditorSelection => {
    const { anchor, head } = dom_selection(area)
    if (
      preserve_clamped &&
      (Math.min(model.selection.anchor, model.selection.head) < input_from ||
        Math.max(model.selection.anchor, model.selection.head) > input_to) &&
      rendered_selection?.anchor === anchor &&
      rendered_selection.head === head
    )
      return model.selection
    return { anchor: input_from + anchor, head: input_from + head }
  }
  const update_locally = (update: () => void): void => {
    local_model_update = true
    try {
      update()
    } finally {
      local_model_update = false
    }
  }
  const sync_selection = (): void => {
    const area = textarea
    if (!area || local_model_update || refreshing_input || before_snapshot) return
    update_locally(() => model.set_selection(selection_of(area)))
  }
  const on_before_input = (event: InputEvent): void => {
    const area = textarea
    if (!area) return
    if (editing_disabled) {
      event.preventDefault()
      before_snapshot = null
      return
    }
    if (event.inputType === `historyUndo` || event.inputType === `historyRedo`) {
      event.preventDefault()
      before_snapshot = null
      ;(event.inputType === `historyUndo` ? model.undo : model.redo)()
      return
    }
    const composition =
      event.inputType.includes(`Composition`) || composing ? composition_range : null
    before_snapshot = {
      ...(composition ?? selection_of(area)),
      input_type: event.inputType,
      value_length: area.value.length,
    }
  }
  type InputShape = `replace` | `backward` | `forward` | `around`
  const INPUT_TYPES: Record<InputShape, string> = {
    replace: ` insertText insertCompositionText insertFromComposition insertReplacementText insertFromPaste insertFromPasteAsQuotation insertFromYank insertLineBreak insertParagraph deleteByComposition deleteByCut deleteContent `,
    backward: ` deleteContentBackward deleteWordBackward deleteSoftLineBackward deleteHardLineBackward `,
    forward: ` deleteContentForward deleteWordForward deleteSoftLineForward deleteHardLineForward `,
    around: ` deleteEntireSoftLine `,
  }
  const input_shape = (input_type: string): InputShape | undefined =>
    ([`replace`, `backward`, `forward`, `around`] as const).find((shape) =>
      INPUT_TYPES[shape].includes(` ${input_type} `),
    )
  const derive_input_edit = (
    before: InputSnapshot,
    next_value: string,
    next_selection: EditorSelection,
  ): TextEdit => {
    const shape = input_shape(before.input_type)
    if (!shape) throw new Error(`Unsupported editor input type ${before.input_type}`)
    if (before.value_length !== input_to - input_from)
      throw new Error(
        `Editor input length mismatch: textarea=${before.value_length}, window=${input_to - input_from}`,
      )
    let from = Math.min(before.anchor, before.head)
    let to = Math.max(before.anchor, before.head)
    const delta = next_value.length - before.value_length
    if (before.input_type === `insertReplacementText` && from === to) {
      const window_from = Math.max(input_from, from - CONTEXT_CHECK_CHARS)
      const window_to = Math.min(input_to, to + CONTEXT_CHECK_CHARS)
      const old_window = model.slice(window_from, window_to)
      const new_window = next_value.slice(
        window_from - input_from,
        window_to + delta - input_from,
      )
      let prefix_length = 0
      while (
        prefix_length < old_window.length &&
        old_window[prefix_length] === new_window[prefix_length]
      )
        prefix_length += 1
      let suffix_length = 0
      while (
        suffix_length < old_window.length - prefix_length &&
        suffix_length < new_window.length - prefix_length &&
        old_window.at(-suffix_length - 1) === new_window.at(-suffix_length - 1)
      )
        suffix_length += 1
      if (
        (prefix_length === 0 && window_from > input_from) ||
        (suffix_length === 0 && window_to < input_to)
      )
        throw new Error(`Replacement exceeds ${CONTEXT_CHECK_CHARS}-character context`)
      from = window_from + prefix_length
      to = window_to - suffix_length
    }
    if (from === to && shape === `around`) {
      from = Math.min(next_selection.anchor, next_selection.head)
      to = from - delta
    } else if (from === to && shape !== `replace`) {
      if (delta > 0)
        throw new Error(`Deletion ${before.input_type} grew text by ${delta}`)
      if (shape === `backward`) from += delta
      else to -= delta
    }
    const insert_length = to - from + delta
    if (from < 0 || to < from || to > model.length || insert_length < 0)
      throw new Error(
        `Invalid ${before.input_type} edit from=${from}, to=${to}, insert_length=${insert_length}`,
      )
    const prefix_from = Math.max(input_from, from - CONTEXT_CHECK_CHARS)
    const suffix_to = Math.min(input_to, to + CONTEXT_CHECK_CHARS)
    if (
      model.slice(prefix_from, from) !==
        next_value.slice(prefix_from - input_from, from - input_from) ||
      model.slice(to, suffix_to) !==
        next_value.slice(to + delta - input_from, suffix_to + delta - input_from)
    )
      throw new Error(`Editor input context diverged for ${before.input_type}`)
    return {
      from,
      to,
      insert: next_value.slice(from - input_from, from + insert_length - input_from),
    }
  }
  const history_group = (input_type: string): string | null => {
    if (input_type.includes(`Composition`) || composing)
      return `composition-${composition_seq}`
    if (input_type === `insertText`) return `insert`
    if (input_type === `deleteContentBackward`) return `backspace`
    if (input_type === `deleteContentForward`) return `delete`
    return null
  }
  const on_input = (): void => {
    const area = textarea
    if (!area) return
    if (editing_disabled) {
      area.value = model.slice(input_from, input_to)
      before_snapshot = null
      return
    }
    const snapshot = before_snapshot
    try {
      if (!snapshot) throw new Error(`Input arrived without a beforeinput snapshot`)
      update_locally(() => {
        const next_selection = selection_of(area, false)
        const edit = derive_input_edit(snapshot, area.value, next_selection)
        const unchanged =
          edit.to - edit.from === edit.insert.length &&
          model.slice(edit.from, edit.to) === edit.insert
        if (unchanged) model.set_selection(next_selection)
        else
          model.transact([edit], {
            selection: next_selection,
            source: `input`,
            history_group: history_group(snapshot.input_type),
          })
        if (snapshot.input_type.includes(`Composition`) || composing)
          composition_range = {
            anchor: edit.from,
            head: edit.from + edit.insert.length,
          }
        input_to += edit.insert.length - (edit.to - edit.from)
        if (snapshot.input_type === `insertFromComposition`) composition_range = null
      })
    } catch (error) {
      area.value = model.slice(input_from, input_to)
      if (snapshot) set_dom_selection(area, snapshot)
      report_error(error)
    } finally {
      before_snapshot = null
    }
    sync_selection()
    refresh_input(true)
  }
  const on_scroll = (): void => {
    const port = scrollport
    if (!port) return
    scroll_top = port.scrollTop
  }
  const on_composition_start = (): void => {
    composing = true
    composition_seq += 1
    if (textarea) composition_range = selection_of(textarea)
  }
  const on_composition_end = (): void => {
    composing = false
    // Some browsers deliver the final input after compositionend in the same task.
    queueMicrotask(() => refresh_input(true))
  }
  const apply_edit = (edit: RangeEdit, source: `command` | `input` = `command`): void => {
    const area = textarea
    if (!area) return
    const {
      range_start: from,
      range_end: to,
      replacement: insert,
      selection_start: anchor,
      selection_end: head,
    } = edit
    if (from === to && insert === ``) {
      model.set_selection({ anchor, head })
      return
    }
    try {
      update_locally(() => {
        model.transact([{ from, to, insert }], {
          selection: { anchor, head },
          source,
        })
      })
    } catch (error) {
      area.value = model.slice(input_from, input_to)
      set_dom_selection(area, model.selection)
      report_error(error)
      return
    }
    refresh_input(true)
  }
  const run_save = async (): Promise<boolean> => {
    const info = doc_info
    const save_handler = on_save
    const save_error_handler = on_error
    const saving_model = model
    if (!save_handler || editing_disabled || saving || !info) return false
    const saving_revision = saving_model.revision
    saving = true
    try {
      await save_handler(saving_model.disk_text(), {
        ...info,
        line_count: saving_model.line_count,
      })
      if (saving_model.revision === saving_revision) saving_model.mark_saved()
      if (model === saving_model) error_message = null
      return true
    } catch (error) {
      if (model === saving_model) report_error(error)
      else save_error_handler?.(to_error(error).message)
      return false
    } finally {
      saving = false
    }
  }
  const apply_command = (
    event: KeyboardEvent,
    edit: RangeEdit | null,
    source?: `command` | `input`,
  ): void => {
    if (!edit) return
    event.preventDefault()
    apply_edit(edit, source)
  }
  const measure_line = (text: string): { element: HTMLDivElement; node: Text } => {
    const area = textarea
    if (!area) throw new Error(`Cannot measure editor text before mounting`)
    const style = getComputedStyle(area)
    const element = area.ownerDocument.createElement(`div`)
    element.dataset.editorMeasure = ``
    Object.assign(element.style, {
      position: `fixed`,
      top: `0`,
      left: `0`,
      zIndex: `2147483647`,
      opacity: `0`,
      width: `${area.clientWidth - css_px(style.paddingLeft) - css_px(style.paddingRight)}px`,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      fontVariantLigatures: style.fontVariantLigatures,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      wordSpacing: style.wordSpacing,
      tabSize: style.tabSize,
      whiteSpace: `pre`,
      direction: style.direction,
    })
    const node = area.ownerDocument.createTextNode(text || `\u200B`)
    element.append(node)
    area.ownerDocument.body.append(element)
    return { element, node }
  }
  const column_at = (text: string, offset: number): number => {
    const { element, node } = measure_line(text)
    try {
      const range = node.ownerDocument.createRange()
      range.setStart(node, offset)
      range.collapse(true)
      // A bidi boundary can have two caret boxes. Native selection uses the paragraph's
      // leading affinity; getBoundingClientRect() only returns the first box here.
      const rtl = element.style.direction === `rtl`
      const positions = Array.from(range.getClientRects(), (rect) =>
        rtl ? rect.right : rect.left,
      )
      return (
        (rtl ? Math.max(...positions) : Math.min(...positions)) -
        element.getBoundingClientRect().left
      )
    } finally {
      element.remove()
    }
  }
  const reveal_horizontal_selection = (): void => {
    const area = textarea
    const port = scrollport
    if (!area || !port) return
    if (area.clientWidth <= port.clientWidth) {
      port.scrollLeft = 0
      return
    }
    const style = getComputedStyle(area)
    const line = model.line_at(model.selection.head)
    const caret_x =
      area.getBoundingClientRect().left +
      css_px(style.paddingLeft) +
      column_at(line.text, model.selection.head - line.from)
    const viewport_left = port.getBoundingClientRect().left + port.clientLeft
    const left = viewport_left + css_px(style.paddingLeft)
    const right = viewport_left + port.clientWidth - css_px(style.paddingRight) - 1
    if (caret_x < left) port.scrollLeft += caret_x - left
    else if (caret_x > right) port.scrollLeft += caret_x - right
  }
  const offset_at_column = (text: string, target: number): number => {
    if (!text) return 0
    const { element, node } = measure_line(text)
    try {
      const target_column = Math.max(
        0,
        Math.min(target, element.getBoundingClientRect().width - 0.5),
      )
      // Keep the queried caret on screen even when a horizontally scrolled line is wider
      // than the viewport. Moving the measuring surface does not change its line layout.
      element.style.left = `${Math.min(0, node.ownerDocument.documentElement.clientWidth / 2 - target_column)}px`
      const box = element.getBoundingClientRect()
      const caret = node.ownerDocument.caretPositionFromPoint(
        box.left + target_column,
        box.top + box.height / 2,
      )
      if (!caret || caret.offsetNode !== node)
        throw new Error(`Cannot hit-test editor line at column ${target}`)
      // Browser hit-testing owns bidi/shaping; clamp to a complete grapheme boundary.
      return graphemes.segment(text).containing(caret.offset)?.index ?? text.length
    } finally {
      element.remove()
    }
  }
  let pointer_selection: { anchor: number; client_x: number; client_y: number } | null =
    null
  let selection_frame = 0
  const pointer_offset = (client_x: number, client_y: number): number => {
    const port = scrollport
    const area = textarea
    if (!port || !area) return model.selection.head
    const box = port.getBoundingClientRect()
    const line_idx = Math.max(
      0,
      Math.min(
        model.line_count - 1,
        Math.floor((client_y - box.top + port.scrollTop) / line_height),
      ),
    )
    const line = model.line(line_idx)
    const column =
      client_x - box.left + port.scrollLeft - css_px(getComputedStyle(area).paddingLeft)
    return line.from + offset_at_column(line.text, Math.max(0, column))
  }
  const stop_pointer_selection = (): void => {
    pointer_selection = null
    if (selection_frame) cancelAnimationFrame(selection_frame)
    selection_frame = 0
  }
  onDestroy(stop_pointer_selection)
  const update_pointer_selection = (): void => {
    const port = scrollport
    const selection = pointer_selection
    if (!port || !selection) return
    const box = port.getBoundingClientRect()
    const outside =
      selection.client_y < box.top
        ? selection.client_y - box.top
        : Math.max(0, selection.client_y - box.bottom)
    const outside_x =
      selection.client_x < box.left
        ? selection.client_x - box.left
        : Math.max(0, selection.client_x - box.right)
    if (outside_x)
      port.scrollLeft += Math.sign(outside_x) * Math.min(Math.abs(outside_x), 60)
    if (outside) {
      port.scrollTop += Math.sign(outside) * Math.min(Math.abs(outside), line_height * 3)
      scroll_top = port.scrollTop
    }
    const head = pointer_offset(selection.client_x, selection.client_y)
    update_locally(() => model.set_selection({ anchor: selection.anchor, head }))
    refresh_input()
    if (outside || outside_x)
      selection_frame = requestAnimationFrame(update_pointer_selection)
  }
  const on_pointer_down = (event: PointerEvent): void => {
    // Touch gestures retain native selection handles and scrolling.
    if (event.pointerType === `touch` || event.button !== 0 || composing) return
    event.preventDefault()
    const area = textarea
    if (!area) return
    area.focus({ preventScroll: true })
    const head = pointer_offset(event.clientX, event.clientY)
    pointer_selection = {
      anchor: event.shiftKey ? model.selection.anchor : head,
      client_x: event.clientX,
      client_y: event.clientY,
    }
    preferred_column = null
    area.setPointerCapture(event.pointerId)
    update_pointer_selection()
  }
  const on_pointer_move = (event: PointerEvent): void => {
    if (!pointer_selection) return
    pointer_selection.client_x = event.clientX
    pointer_selection.client_y = event.clientY
    if (selection_frame) cancelAnimationFrame(selection_frame)
    update_pointer_selection()
  }
  const on_pointer_click = (event: MouseEvent): void => {
    if (event.detail < 2) return
    const offset = pointer_offset(event.clientX, event.clientY)
    const line = model.line_at(offset)
    if (event.detail >= 3) {
      model.set_selection({
        anchor: line.from,
        head: Math.min(model.length, line.to + 1),
      })
      return
    }
    const word = words.segment(line.text).containing(offset - line.from)
    if (word) {
      model.set_selection({
        anchor: line.from + word.index,
        head: line.from + word.index + word.segment.length,
      })
    }
  }
  const on_keydown = (event: KeyboardEvent): void => {
    const area = textarea
    if (!area || event.isComposing) return
    if (editing_disabled && event.key === `Tab`) return
    if (event.key === `Tab` && tab_moves_focus) {
      tab_moves_focus = false
      return
    }
    tab_moves_focus = false
    const command_modifier = event.metaKey || event.ctrlKey
    const lower_key = event.key.toLowerCase()
    const vertical =
      !command_modifier &&
      !event.altKey &&
      (event.key === `ArrowUp` || event.key === `ArrowDown`)
    if (!vertical) preferred_column = null
    if (command_modifier && lower_key === `a`) {
      event.preventDefault()
      model.set_selection({ anchor: 0, head: model.length })
      return
    }
    const selection = selection_of(area)
    const move_caret = (head: number): void =>
      model.set_selection({ anchor: event.shiftKey ? selection.anchor : head, head })
    if (
      (command_modifier && (event.key === `Home` || event.key === `End`)) ||
      (event.metaKey && (event.key === `ArrowUp` || event.key === `ArrowDown`))
    ) {
      event.preventDefault()
      move_caret(event.key === `Home` || event.key === `ArrowUp` ? 0 : model.length)
      return
    }
    if (vertical || event.key === `PageUp` || event.key === `PageDown`) {
      event.preventDefault()
      const line = model.line_at(selection.head)
      if (vertical && selection.head !== preferred_head) preferred_column = null
      const column = preferred_column ?? column_at(line.text, selection.head - line.from)
      if (vertical) preferred_column = column
      const direction = event.key === `ArrowUp` || event.key === `PageUp` ? -1 : 1
      const distance = vertical
        ? 1
        : Math.max(1, Math.floor(viewport_height / line_height))
      const target_idx = line.line_idx + direction * distance
      let head = target_idx < 0 ? 0 : model.length
      if (target_idx >= 0 && target_idx < model.line_count) {
        const target = model.line(target_idx)
        head = target.from + offset_at_column(target.text, column)
      }
      if (vertical) preferred_head = head
      move_caret(head)
      return
    }
    if (event.key === `Home` || event.key === `End`) {
      event.preventDefault()
      const line = model.line_at(selection.head)
      move_caret(event.key === `Home` ? line.from : line.to)
      return
    }
    // Recenter before native navigation/deletion reaches either edge of the input slice.
    sync_selection()
    refresh_input(true)
    if (editing_disabled) return
    if (
      command_modifier &&
      !event.altKey &&
      (lower_key === `z` || (!event.metaKey && lower_key === `y`))
    ) {
      event.preventDefault()
      ;(lower_key === `y` || event.shiftKey ? model.redo : model.undo)()
      return
    }
    if (lower_key === `s` && command_modifier && !event.altKey && on_save) {
      event.preventDefault()
      void run_save()
      return
    }
    const { anchor, head } = selection_of(area)
    const state: EditorState = {
      model,
      selection_start: Math.min(anchor, head),
      selection_end: Math.max(anchor, head),
    }
    if (event.key === `Tab`) {
      event.preventDefault() // a no-op dedent must not move focus
      apply_command(
        event,
        (event.shiftKey ? dedent_selection : indent_selection)(state, indent),
      )
      return
    }
    if (event.key === `Enter` && !command_modifier && !event.altKey) {
      apply_command(event, auto_indent_newline(state, indent))
      return
    }
    if (event.key === `/` && command_modifier && comment_token) {
      apply_command(event, toggle_line_comment(state, comment_token))
      return
    }
    if (command_modifier || event.altKey) return
    apply_command(event, auto_close_pair(state, event.key), `input`)
  }
  export const save = run_save
  export const focus = (): void => textarea?.focus()
  export const undo = (): boolean => model.undo()
  export const redo = (): boolean => model.redo()
</script>

<div
  {...rest}
  aria-busy={(doc_info === null && error_message === null) || saving}
  class={[`code-editor`, rest.class]}
  style:--editor-font-size={`${font_size}px`}
  style:--editor-line-height={`${line_height}px`}
  style:--editor-tab-size={tab_size}
>
  <span class="sr-only" id={keyboard_help_id}>{msg.keyboard_help}</span>
  {#if error_message}
    <div class="editor-error" role="alert">{error_message}</div>
  {/if}
  <div class="editor-body">
    {#if show_line_numbers}
      <div class="gutter" aria-hidden="true" style:width={`${gutter_digits + 1}ch`}>
        <div
          class="layer"
          style:height={`${total_height}px`}
          style:transform={`translateY(${-scroll_top}px)`}
        >
          {#each visible_rows as row (row.line_idx)}
            <div
              class={[`gutter-line`, { active: row.line_idx === caret_line }]}
              style:top={`${row.top}px`}
            >
              {row.line_idx + 1}
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <div
      class="content"
      bind:this={scrollport}
      onscroll={on_scroll}
      bind:clientHeight={viewport_height}
      bind:clientWidth={viewport_width}
    >
      <div
        class="scroll-space"
        aria-hidden="true"
        style:height={`${total_height}px`}
        style:width={`${overlay_width}px`}
      ></div>
      <pre
        aria-hidden="true"
        class="token-layer layer"
        style:height={`${total_height}px`}
        style:min-width={`${overlay_width}px`}>{#each visible_rows as row (row.line_idx)}<div
            class="line"
            style:top={`${row.top}px`}>{#each row.tokens as token (token.start)}<span
                class={token.css}>{token.text}</span
              >{/each}</div>{/each}</pre>
      <textarea
        aria-describedby={keyboard_help_id}
        data-input-from={input_from}
        style:min-width={`${overlay_width}px`}
        aria-label={aria_label ?? `${model.uri} source`}
        autocapitalize="off"
        autocomplete="off"
        bind:this={textarea}
        {...{ autocorrect: `off` }}
        onbeforeinput={on_before_input}
        onblur={on_blur}
        oncompositionend={on_composition_end}
        oncompositionstart={on_composition_start}
        onfocus={on_focus}
        oninput={on_input}
        onkeydown={on_keydown}
        onkeyup={() => {
          sync_selection()
          refresh_input(true)
        }}
        onclick={on_pointer_click}
        onpointerdown={on_pointer_down}
        onpointermove={on_pointer_move}
        onpointercancel={stop_pointer_selection}
        onlostpointercapture={stop_pointer_selection}
        onpointerup={() => {
          stop_pointer_selection()
          rendered_selection = null
          preferred_column = null
          sync_selection()
        }}
        onselect={sync_selection}
        readonly={editing_disabled}
        spellcheck="false"
        wrap="off"></textarea>
    </div>
  </div>
</div>

<style>
  .code-editor {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--page-bg, light-dark(#fff, #0d0f14));
    --editor-pad-x: 8px;
  }
  .editor-error {
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    color: var(--error-color, #cf222e);
    background: color-mix(in srgb, var(--error-color, #f85149) 10%, transparent);
    font-size: 0.78rem;
  }
  .editor-body {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
  .gutter {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
    border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
    color: var(--editor-gutter-color);
    text-align: right;
    user-select: none;
  }
  .gutter-line {
    position: absolute;
    right: 0.5ch;
    height: var(--editor-line-height);
    &.active {
      color: var(--editor-gutter-active-color);
    }
  }
  .content {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow: auto;
    overflow-anchor: none;
  }
  .scroll-space {
    pointer-events: none;
  }
  .layer,
  .gutter,
  textarea {
    font-family: var(--editor-font);
    font-size: var(--editor-font-size);
    font-variant-ligatures: none;
    line-height: var(--editor-line-height);
    letter-spacing: normal;
    word-spacing: normal;
    tab-size: var(--editor-tab-size);
    text-indent: 0;
  }
  .token-layer,
  textarea {
    position: absolute;
    inset: 0 auto auto 0;
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    white-space: pre;
    overflow-wrap: normal;
  }
  .line {
    position: absolute;
    left: var(--editor-pad-x);
    height: var(--editor-line-height);
  }
  .token-layer {
    pointer-events: none;
    border-radius: 0;
    background: none;
  }
  textarea {
    height: 100%;
    padding: 0 var(--editor-pad-x);
    color: transparent;
    caret-color: var(--text-color, light-dark(#24292e, #e6edf3));
    background: transparent;
    outline: none;
    resize: none;
    overflow: hidden;
    &::selection {
      background: var(--editor-selection-bg);
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
