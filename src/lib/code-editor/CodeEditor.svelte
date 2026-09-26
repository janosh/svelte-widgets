<script lang="ts" module>
  let next_doc_seq = 0
</script>

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from '../Icon.svelte'
  import { Hash, TextSearch } from '../icons'
  import { claim_escape, css_px } from '../attachments/shared'
  import { merge_defaults, CODE_EDITOR_LABELS, type CodeEditorLabels } from '../labels'
  import { clamp, clamp_integer } from '../utils'
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
  import {
    iterate_editor_matches,
    replace_editor_matches,
    update_editor_matches,
  } from './search'
  import type { EditorMatch } from './search'
  import { render_tokens, type RenderedToken } from './tokens'
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
  const SEARCH_MATCH_LIMIT = 5000
  const graphemes = new Intl.Segmenter(undefined, { granularity: `grapheme` })
  const words = new Intl.Segmenter(undefined, { granularity: `word` })
  // Text metrics a hidden measuring line copies from the textarea
  const MEASURED_STYLES = [
    `font-family`,
    `font-size`,
    `font-style`,
    `font-weight`,
    `font-variant-ligatures`,
    `line-height`,
    `letter-spacing`,
    `word-spacing`,
    `tab-size`,
    `direction`,
  ]
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
  let search_panel = $state<`find` | `line` | null>(null)
  // The find query or line number field, whichever panel is open
  let panel_input = $state<HTMLInputElement>()
  let search_query = $state(``)
  let replacement = $state(``)
  let show_replace = $state(false)
  const search_options = $state({ case_sensitive: false, whole_word: false })
  let target_line = $state(1)
  let current_selection = $state<EditorSelection>({ anchor: 0, head: 0 })
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
  type InputSnapshot = EditorSelection & {
    input_type: string
    value_length: number
    event: InputEvent
  }
  let before_snapshot: InputSnapshot | null = null
  // A listener after ours can cancel beforeinput, and then no input event consumes the
  // snapshot. Drop it once seen so selection sync and input refreshes resume.
  const input_pending = (): boolean => {
    if (before_snapshot?.event.defaultPrevented) before_snapshot = null
    return before_snapshot !== null
  }
  let active_client: ReturnType<typeof create_highlight_client> | null = null
  // Plain Map, not SvelteMap: the LRU touch on every render pass made reactive entries
  // rebuild `visible_rows` and reconcile the DOM twice. `token_revision` sequences reads.
  // Stale entries (at or after an edit) keep painting until fresh spans replace them.
  const token_cache = new Map<number, { spans: SpanList; fresh: boolean }>()
  // Line count the cached indices refer to, so an edit can shift entries below it.
  let cached_line_count = 0
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
  const ordered = ({ anchor, head }: EditorSelection): [number, number] =>
    anchor <= head ? [anchor, head] : [head, anchor]
  type SearchResult = { matches: EditorMatch[]; truncated: boolean; revision: number }
  const search_all = (): SearchResult => {
    const matches: EditorMatch[] = []
    let truncated = false
    if (search_panel === `find`) {
      for (const match of iterate_editor_matches(model, search_query, search_options)) {
        if (matches.length === SEARCH_MATCH_LIMIT) {
          truncated = true
          break
        }
        matches.push(match)
      }
    }
    return { matches, truncated, revision: model.revision }
  }
  // Rescanned in full when the panel, query, options or model change. Transactions patch
  // it near their edits instead (`patch_search`), so typing never rescans the document.
  let search_result = $derived.by(search_all)
  const patch_search = ({ base_revision, revision, edits }: EditorTransaction): void => {
    const current = search_result
    if (current.revision === revision) return
    // A capped list lacks the matches beyond it, so only a rescan can refill it.
    if (current.truncated || current.revision !== base_revision) {
      search_result = search_all()
      return
    }
    const matches = update_editor_matches(
      model,
      search_query,
      current.matches,
      edits,
      search_options,
    )
    const truncated = matches.length > SEARCH_MATCH_LIMIT
    search_result = {
      matches: truncated ? matches.slice(0, SEARCH_MATCH_LIMIT) : matches,
      truncated,
      revision,
    }
  }
  const search_matches = $derived(search_result.matches)
  const current_match = $derived.by(() => {
    const [from, to] = ordered(current_selection)
    return search_matches.findIndex((match) => match.from === from && match.to === to)
  })
  const report_error = (error: unknown): void => {
    const message = to_error(error).message
    error_message = message
    on_error?.(message)
  }
  const touch_tokens = (start: number, end: number): boolean => {
    let complete = true
    for (let line_idx = start; line_idx < end; line_idx++) {
      const cached = token_cache.get(line_idx)
      if (!cached) {
        complete = false
        continue
      }
      complete &&= cached.fresh
      token_cache.delete(line_idx)
      token_cache.set(line_idx, cached)
    }
    return complete
  }
  // Lines before the first edit keep fresh spans. Later ones become stale: shifted by the
  // edit's line delta, they keep painting until re-highlighted. Dropping them repainted
  // every row below the caret unstyled on each keystroke until the backend answered.
  const invalidate_tokens = (
    active_model: EditorModel,
    transaction: EditorTransaction,
  ): void => {
    const { edits } = transaction
    if (edits.length === 0) return
    token_revision += 1
    const line_delta = active_model.line_count - cached_line_count
    cached_line_count = active_model.line_count
    // `validate_edits` rejects `from < previous_end`, so edits ascend; text before the first
    // is identical in both documents, so this line index means the same either side of it.
    const first_line = active_model.line_at(edits[0].from).line_idx
    // Even one character can open a multiline comment/string and change later tokens.
    const entries = [...token_cache]
    token_cache.clear()
    // Re-insert in LRU order. Lines swallowed by a deletion map at or above the edit and
    // are dropped rather than overwrite the edited line's own spans.
    for (const [line_idx, { spans, fresh }] of entries) {
      const next_idx = line_idx > first_line ? line_idx + line_delta : line_idx
      if (line_idx < first_line) token_cache.set(line_idx, { spans, fresh })
      else if (line_idx === first_line || next_idx > first_line)
        token_cache.set(next_idx, { spans, fresh: false })
    }
  }
  const receive_spans = ({ start_line, revision, spans }: HighlightSpansEvent): void => {
    if (revision !== model.revision) return
    for (const [offset, line_spans] of spans.entries()) {
      const line_idx = start_line + offset
      token_cache.delete(line_idx)
      token_cache.set(line_idx, { spans: line_spans, fresh: true })
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
  const search_tokens = (tokens: RenderedToken[], line_from: number): RenderedToken[] => {
    if (search_matches.length === 0) return tokens
    let low = 0
    let high = search_matches.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (search_matches[middle].to <= line_from) low = middle + 1
      else high = middle
    }
    let match_idx = low
    return tokens.flatMap((token) => {
      const pieces: RenderedToken[] = []
      let start = line_from + token.start
      const end = start + token.text.length
      const append = (to: number, css = token.css): void => {
        if (to <= start) return
        pieces.push({
          start: start - line_from,
          text: token.text.slice(
            start - line_from - token.start,
            to - line_from - token.start,
          ),
          css,
        })
        start = to
      }
      while (match_idx < search_matches.length && search_matches[match_idx].from < end) {
        const match = search_matches[match_idx]
        append(Math.max(start, match.from))
        append(
          Math.min(end, match.to),
          `${token.css} editor-search-match${match_idx === current_match ? ` current` : ``}`,
        )
        if (match.to > end) break
        match_idx += 1
      }
      append(end)
      return pieces
    })
  }
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
        tokens: search_tokens(
          render_tokens(line.text, token_cache.get(line_idx)?.spans ?? []),
          line.from,
        ),
      }
    })
  })
  const total_height = $derived(line_count * line_height)
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
    const [start, end] = ordered({ anchor, head }).map((offset) =>
      clamp(offset - input_from, 0, area.value.length),
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
    if (!area || composing || input_pending()) return
    if (reveal) reveal_selection()
    // read the model directly: window_lines' line_count only refreshes on a revision bump
    const window = visible_line_window(
      scroll_top,
      viewport_height,
      line_height,
      model.line_count,
      OVERSCAN_ROWS,
    )
    const [from, to] = ordered(model.selection)
    if (from !== to || reveal) {
      window.start = Math.min(window.start, model.line_at(from).line_idx)
      window.end = Math.max(window.end, model.line_at(to).line_idx + 1)
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
      cached_line_count = active_model.line_count
      token_revision += 1
    })
    doc_info = null
    error_message = null
    scroll_top = 0
    overlay_width = 0
    caret_line = active_model.line_at(active_model.selection.head).line_idx
    current_selection = active_model.selection
    before_snapshot = null
    const unsubscribe = active_model.subscribe((update) => {
      if (!is_current()) return
      caret_line = active_model.line_at(update.selection.head).line_idx
      current_selection = update.selection
      if (update.transaction) {
        // Bumped only for transactions, which `line_count`/`visible_rows` read to re-read
        // the rope; bumping on bare selection changes re-read every row on each caret move.
        model_revision += 1
        invalidate_tokens(active_model, update.transaction)
        if (search_panel === `find`) patch_search(update.transaction)
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
    // Untracked: it writes `overlay_width`, and reading that back re-ran this whole effect.
    untrack(measure_overlay_width)
  })
  const on_focus = (): void => {
    // Escape is fully consumed here, never reaching outer layers such as a host dialog.
    unregister_escape ??= claim_escape(() => {
      if (search_panel) close_search()
      else tab_moves_focus = true
    })
  }
  // Register above the editor/outer dialog while search controls own focus.
  const search_escape = (element: HTMLElement): (() => void) => {
    let release: (() => void) | undefined
    const activate = (): void => {
      release?.()
      release = claim_escape(close_search)
    }
    const deactivate = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget))
        return
      release?.()
      release = undefined
    }
    element.addEventListener(`focusin`, activate)
    element.addEventListener(`focusout`, deactivate)
    element.addEventListener(`keydown`, handle_search_shortcut)
    return () => {
      release?.()
      element.removeEventListener(`focusin`, activate)
      element.removeEventListener(`focusout`, deactivate)
      element.removeEventListener(`keydown`, handle_search_shortcut)
    }
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
    const [from, to] = ordered(model.selection)
    if (
      preserve_clamped &&
      (from < input_from || to > input_to) &&
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
    if (!area || local_model_update || refreshing_input || input_pending()) return
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
    const snapshot = {
      ...(composition ?? selection_of(area)),
      input_type: event.inputType,
      value_length: area.value.length,
      event,
    }
    before_snapshot = snapshot
    // Browsers dispatch input in the same task as its beforeinput, but a no-op deletion
    // (Backspace at offset 0, Delete at the end) fires beforeinput alone. Drop a snapshot
    // still unconsumed afterwards so it stops blocking selection sync, and catch up on the
    // input refreshes that model updates skipped meanwhile.
    setTimeout(() => {
      if (before_snapshot !== snapshot) return
      before_snapshot = null
      refresh_input()
    }, 0)
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
    let [from, to] = ordered(before)
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
      from = ordered(next_selection)[0]
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
    if (scrollport) scroll_top = scrollport.scrollTop
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
  export const save = async (): Promise<boolean> => {
    const info = doc_info
    const save_handler = on_save
    const save_error_handler = on_error
    const saving_model = model
    if (!save_handler || editing_disabled || saving || !info) return false
    // The written text's history state: undoing back to it after mid-save edits is clean.
    const saving_state = saving_model.checkpoint()
    saving = true
    try {
      await save_handler(saving_model.disk_text(), {
        ...info,
        line_count: saving_model.line_count,
      })
      saving_model.mark_saved(saving_state)
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
    source: `command` | `input` = `command`,
  ): void => {
    const area = textarea
    if (!edit || !area) return
    event.preventDefault()
    const { from, to, insert, anchor, head } = edit
    if (from === to && insert === ``) {
      model.set_selection({ anchor, head })
      return
    }
    try {
      update_locally(() =>
        model.transact([{ from, to, insert }], { selection: { anchor, head }, source }),
      )
    } catch (error) {
      area.value = model.slice(input_from, input_to)
      set_dom_selection(area, model.selection)
      report_error(error)
      return
    }
    refresh_input(true)
  }
  const measure_line = (text: string): { element: HTMLDivElement; node: Text } => {
    const area = textarea
    if (!area) throw new Error(`Cannot measure editor text before mounting`)
    const style = getComputedStyle(area)
    const element = area.ownerDocument.createElement(`div`)
    element.dataset.editorMeasure = ``
    element.style.cssText = `position: fixed; top: 0; left: 0; z-index: 2147483647; opacity: 0; white-space: pre`
    element.style.width = `${area.clientWidth - css_px(style.paddingLeft) - css_px(style.paddingRight)}px`
    for (const name of MEASURED_STYLES)
      element.style.setProperty(name, style.getPropertyValue(name))
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
    const line_idx = clamp(
      Math.floor((client_y - box.top + port.scrollTop) / line_height),
      0,
      model.line_count - 1,
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
    // Signed distance past the viewport along one axis, 0 while inside it
    const past = (value: number, min: number, max: number): number =>
      value < min ? value - min : Math.max(0, value - max)
    const outside = past(selection.client_y, box.top, box.bottom)
    const outside_x = past(selection.client_x, box.left, box.right)
    if (outside_x) port.scrollLeft += clamp(outside_x, -60, 60)
    if (outside) {
      port.scrollTop += clamp(outside, -3 * line_height, 3 * line_height)
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
    if (word)
      model.set_selection({
        anchor: line.from + word.index,
        head: line.from + word.index + word.segment.length,
      })
  }
  const select_match = (match: EditorMatch | undefined): boolean => {
    if (!match) return false
    model.set_selection({ anchor: match.from, head: match.to })
    return true
  }
  const select_nearest_match = (): void => {
    const [from] = ordered(model.selection)
    select_match(search_matches.find((match) => match.from >= from) ?? search_matches[0])
  }
  const close_search = (): void => {
    search_panel = null
    textarea?.focus({ preventScroll: true })
    refresh_input(true)
  }
  const focus_panel_input = async (): Promise<void> => {
    await tick()
    panel_input?.focus()
    panel_input?.select()
  }
  export const open_search = async (replace = false): Promise<void> => {
    if (document.activeElement === textarea) sync_selection()
    const [from, to] = ordered(model.selection)
    if (from !== to) search_query = model.slice(from, to)
    search_panel = `find`
    show_replace = replace && !editing_disabled
    await focus_panel_input()
    select_nearest_match()
  }
  export const find_next = (direction: 1 | -1 = 1): boolean => {
    search_panel = `find`
    const [start, end] = ordered(model.selection)
    const match =
      direction === 1
        ? (search_matches.find(({ from }) => from >= end) ?? search_matches[0])
        : (search_matches.findLast(({ to }) => to <= start) ?? search_matches.at(-1))
    return select_match(match)
  }
  export const replace_current = (): boolean => {
    if (editing_disabled || composing) return false
    const match = search_matches[current_match]
    if (!match) {
      find_next()
      return false
    }
    const insert = replacement.replaceAll(/\r\n?/g, `\n`)
    const head = match.from + insert.length
    model.transact([{ ...match, insert }], {
      source: `command`,
      selection: { anchor: head, head },
    })
    find_next()
    return true
  }
  export const replace_all = (): number => {
    if (editing_disabled || composing || search_panel !== `find`) return 0
    return replace_editor_matches(model, search_query, replacement, search_options)
  }
  // Public line numbers are one-based, matching the gutter. Invalid input is a no-op.
  export const go_to_line = (line_number: number): boolean => {
    if (
      !Number.isInteger(line_number) ||
      line_number < 1 ||
      line_number > model.line_count
    )
      return false
    const head = model.line(line_number - 1).from
    model.set_selection({ anchor: head, head })
    close_search()
    return true
  }
  const open_line_search = async (): Promise<void> => {
    target_line = model.line_at(model.selection.head).line_idx + 1
    search_panel = `line`
    await focus_panel_input()
  }
  const on_search_enter =
    (action: (event: KeyboardEvent) => unknown) =>
    (event: KeyboardEvent): void => {
      if (event.key !== `Enter` || event.isComposing) return
      event.preventDefault()
      action(event)
    }
  const handle_search_shortcut = (event: KeyboardEvent): boolean => {
    if (event.isComposing) return false
    const key = event.key.toLowerCase()
    const command = event.ctrlKey || event.metaKey
    if (command && key === `f` && !event.altKey) void open_search()
    else if (
      (event.ctrlKey && !event.metaKey && !event.altKey && key === `h`) ||
      (event.metaKey && event.altKey && key === `f`)
    )
      void open_search(true)
    else if (command && key === `g` && !event.altKey) void open_line_search()
    else if (event.key === `F3` && !command && !event.altKey)
      find_next(event.shiftKey ? -1 : 1)
    else return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  const on_keydown = (event: KeyboardEvent): void => {
    const area = textarea
    if (!area || event.isComposing) return
    if (handle_search_shortcut(event)) return
    const release_focus = tab_moves_focus
    tab_moves_focus = false
    // Leave Tab native (moving focus) when it cannot indent or follows Escape.
    if (event.key === `Tab` && (editing_disabled || release_focus)) return
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
      void save()
      return
    }
    const [selection_start, selection_end] = ordered(selection_of(area))
    const state: EditorState = { model, selection_start, selection_end }
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
  <button
    class="search-toggle"
    type="button"
    onclick={() => void open_search()}
    aria-label={msg.find}
    title={`${msg.find} (Ctrl/Cmd+F)`}
    ><Icon icon={TextSearch} aria-hidden="true" /></button
  >
  {#if search_panel}
    <div
      class="editor-search"
      class:line-search={search_panel === `line`}
      role="search"
      aria-label={search_panel === `find` ? msg.find : msg.go_to_line}
      {@attach search_escape}
    >
      <div>
        {#if search_panel === `find`}
          <input
            type="search"
            aria-label={msg.find}
            placeholder={msg.find}
            bind:this={panel_input}
            value={search_query}
            oninput={(event) => {
              search_query = event.currentTarget.value
              select_nearest_match()
            }}
            onkeydown={on_search_enter((event) => find_next(event.shiftKey ? -1 : 1))}
          />
          <span role="status"
            >{search_matches.length
              ? search_result.truncated
                ? msg.match_position_truncated(current_match + 1, search_matches.length)
                : msg.match_position(current_match + 1, search_matches.length)
              : msg.no_matches}</span
          >
          {#each [-1, 1] as const as direction}
            <button
              type="button"
              aria-label={direction === -1 ? msg.previous_match : msg.next_match}
              title={direction === -1 ? `Shift+Enter / Shift+F3` : `Enter / F3`}
              disabled={!search_matches.length}
              onclick={() => find_next(direction)}>{direction === -1 ? `↑` : `↓`}</button
            >
          {/each}
        {:else}
          <input
            type="number"
            min="1"
            max={line_count}
            required
            aria-label={msg.line_number}
            bind:this={panel_input}
            bind:value={target_line}
            onkeydown={on_search_enter(() => go_to_line(target_line))}
          />
          <button type="button" onclick={() => go_to_line(target_line)}>{msg.go}</button>
        {/if}
        <button
          type="button"
          aria-label={msg.close_search}
          title="Escape"
          onclick={close_search}>×</button
        >
      </div>
      {#if search_panel === `find`}
        <div>
          {#each [[`case_sensitive`, msg.match_case], [`whole_word`, msg.whole_word]] as const as [option, label]}
            <label
              ><input
                type="checkbox"
                checked={search_options[option]}
                onchange={(event) => {
                  search_options[option] = event.currentTarget.checked
                  select_nearest_match()
                }}
              />{label}</label
            >
          {/each}
          {#if !editing_disabled}
            <button
              type="button"
              aria-pressed={show_replace}
              onclick={() => (show_replace = !show_replace)}>{msg.replace}</button
            >
          {/if}
          <button
            type="button"
            onclick={() => void open_line_search()}
            aria-label={msg.go_to_line}
            title={`${msg.go_to_line} (Ctrl/Cmd+G)`}
            ><Icon icon={Hash} aria-hidden="true" /></button
          >
        </div>
        {#if show_replace && !editing_disabled}
          <div>
            <input
              type="text"
              aria-label={msg.replacement}
              placeholder={msg.replacement}
              bind:value={replacement}
              onkeydown={on_search_enter(replace_current)}
            />
            <button
              type="button"
              disabled={!search_matches.length}
              onclick={replace_current}>{msg.replace}</button
            >
            <button type="button" disabled={!search_matches.length} onclick={replace_all}
              >{msg.replace_all}</button
            >
          </div>
        {/if}
      {/if}
    </div>
  {/if}
  {#if error_message}
    <div class="editor-error" role="alert">{error_message}</div>
  {/if}
  <div class="editor-body">
    {#if show_line_numbers}
      <div
        class="gutter"
        aria-hidden="true"
        style:width={`${String(line_count).length + 1}ch`}
      >
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
        style:pointer-events="none"
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
    position: relative;
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
  .search-toggle,
  .editor-search {
    position: absolute;
    inset-inline-end: 0.375rem;
    z-index: 2;
    background: var(--page-bg, light-dark(#fff, #0d0f14));
  }
  .search-toggle {
    top: 0.375rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0.25em;
    font-size: 1rem;
    transition: opacity 0.15s;
  }
  @media (hover: hover) {
    .code-editor:not(:hover, :focus-within) .search-toggle {
      opacity: 0;
      pointer-events: none;
    }
  }
  .editor-search {
    top: 2.375rem;
    box-sizing: border-box;
    width: 22rem;
    max-width: calc(100% - 0.75rem);
    max-height: calc(100% - 2.75rem);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    border-radius: 0.3rem;
    box-shadow: 0 2px 8px #0002;
    font-size: 0.8rem;
    button {
      font: inherit;
      padding: 0.1rem 0.35rem;
    }
    &.line-search {
      width: 14rem;
    }
    input:not([type='checkbox']) {
      flex: 1;
      min-width: 5rem;
      width: 9rem;
      font: inherit;
    }
    label {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
    }
    > div {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: inherit;
    }
    label + button {
      margin-inline-start: auto;
    }
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
    :global(.editor-search-match) {
      background: var(--editor-search-bg, #eac54f66);
      &.current {
        outline: 1px solid var(--editor-search-active-color, #ba8300);
      }
    }
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
