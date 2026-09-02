<script lang="ts" module>
  let next_doc_seq = 0
</script>

<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { SvelteMap } from 'svelte/reactivity'
  import { register_escape_layer } from '../attachments/index'
  import { CODE_EDITOR_LABELS, type CodeEditorLabels } from '../labels'
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

  const msg = $derived({ ...CODE_EDITOR_LABELS, ...labels })
  let textarea = $state<HTMLTextAreaElement>()
  let doc_info = $state<EditorDocumentInfo | null>(null)
  let error_message = $state<string | null>(null)
  let model_revision = $state(0)
  // Bumped when highlight spans land, so the viewport LRU touch re-runs then
  let token_revision = $state(0)
  let scroll_top = $state(0)
  let scroll_left = $state(0)
  let viewport_height = $state(0)
  let viewport_width = $state(0)
  let overlay_width = $state(0)
  let caret_line = $state(0)
  let saving = $state(false)
  let local_model_update = false
  let tab_moves_focus = false
  let composing = false
  let composition_seq = 0
  let composition_range: EditorSelection | null = null
  let unregister_escape: (() => void) | undefined
  type InputSnapshot = EditorSelection & { input_type: string; value_length: number }
  let before_snapshot: InputSnapshot | null = null
  let active_client: ReturnType<typeof create_highlight_client> | null = null
  const token_cache = new SvelteMap<number, SpanList>()
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
  // Drop only the cached spans an edit can actually have invalidated. Every line before
  // the first edit's offset is untouched text, so its spans stay correct; clearing the
  // whole cache on each transaction left the entire viewport unhighlighted until the
  // debounced re-highlight returned, and evicted the full LRU on every keystroke.
  const invalidate_tokens = (
    active_model: EditorModel,
    transaction: EditorTransaction,
    previous_line_count: number,
  ): void => {
    const { edits } = transaction
    if (edits.length === 0) return
    // `validate_edits` rejects `from < previous_end`, so edits ascend and the first one
    // starts earliest. Text before it is identical in both documents, so this line index
    // means the same thing before and after the transaction.
    const first_line = active_model.line_at(edits[0].from).line_idx
    // A lone edit that inserts no newline and leaves the line count alone cannot have
    // removed one either, so it is confined to its own line. That is ordinary typing.
    const single_line_edit =
      edits.length === 1 &&
      !edits[0].insert.includes(`\n`) &&
      active_model.line_count === previous_line_count
    if (single_line_edit) {
      token_cache.delete(first_line)
      return
    }
    // snapshot first: deleting while iterating the live map's keys
    const stale = [...token_cache.keys()].filter((line_idx) => line_idx >= first_line)
    for (const line_idx of stale) token_cache.delete(line_idx)
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
  const set_dom_selection = (
    area: HTMLTextAreaElement,
    { anchor, head }: EditorSelection,
  ): void => {
    const direction = anchor > head ? `backward` : `forward`
    area.setSelectionRange(Math.min(anchor, head), Math.max(anchor, head), direction)
  }
  const sync_dom_from_model = (update: EditorUpdate): void => {
    const area = textarea
    if (!area || local_model_update) return
    const { anchor, head } = selection_of(area)
    const moved = anchor !== update.selection.anchor || head !== update.selection.head
    if (update.transaction) area.value = model.text()
    // Re-selecting an unchanged range would still cancel an active IME composition.
    if (update.transaction || moved) set_dom_selection(area, update.selection)
    area.scrollTop = scroll_top
    area.scrollLeft = scroll_left
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
    untrack(() => token_cache.clear())
    doc_info = null
    error_message = null
    scroll_top = 0
    scroll_left = 0
    overlay_width = 0
    caret_line = active_model.line_at(active_model.selection.head).line_idx
    before_snapshot = null
    // Line count as of the previous notification, so a transaction can be classified as
    // moving a line boundary or not without re-deriving the old document.
    let previous_line_count = active_model.line_count
    const unsubscribe = active_model.subscribe((update) => {
      if (!is_current()) return
      caret_line = active_model.line_at(update.selection.head).line_idx
      if (update.transaction) {
        // Only a transaction changes the text, and `line_count`/`visible_rows` read this
        // to know when to re-read lines from the rope. The model also notifies on a bare
        // selection change, and bumping it there re-read every visible line on each caret
        // move — up to two rope descents per row, per keypress.
        model_revision += 1
        invalidate_tokens(active_model, update.transaction, previous_line_count)
        active.apply_transaction(update.transaction)
      }
      previous_line_count = active_model.line_count
      sync_dom_from_model(update)
      on_update?.(update)
    })
    queueMicrotask(() => {
      if (!is_current() || !textarea) return
      textarea.value = active_model.text()
      textarea.scrollTop = 0
      textarea.scrollLeft = 0
      set_dom_selection(textarea, active_model.selection)
      measure_overlay_width()
    })
    active
      .open()
      .then((result) => {
        if (!is_current()) return
        doc_info = {
          ...result,
          uri: active_model.uri,
          lineCount: active_model.line_count,
          eol: active_model.eol,
          hadBom: active_model.had_bom,
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
    // Spans arriving is what makes a previously-uncached window cached, so the LRU touch
    // below has to re-run then. This used to ride on `model_revision`, which every caret
    // move bumped; now that only a transaction does, the arrival needs its own signal.
    void token_revision
    const { start, end } = window_lines
    const cached = untrack(() => touch_tokens(start, end))
    if (doc_info?.highlightable && !cached) active_client?.request_highlight(start, end)
  })
  const measure_overlay_width = (): void => {
    const area = textarea
    if (!area) return
    const width = Math.max(area.scrollWidth, area.clientWidth)
    if (width !== overlay_width) overlay_width = width
  }
  $effect(() => {
    void viewport_height
    void viewport_width
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
  const selection_of = (area: HTMLTextAreaElement): EditorSelection =>
    area.selectionDirection === `backward`
      ? { anchor: area.selectionEnd, head: area.selectionStart }
      : { anchor: area.selectionStart, head: area.selectionEnd }
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
    if (!area || local_model_update || before_snapshot) return
    update_locally(() => model.set_selection(selection_of(area)))
  }
  const on_before_input = (event: InputEvent): void => {
    const area = textarea
    if (!area) return
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
    if (before.value_length !== model.length)
      throw new Error(
        `Editor input length mismatch: textarea=${before.value_length}, model=${model.length}`,
      )
    let from = Math.min(before.anchor, before.head)
    let to = Math.max(before.anchor, before.head)
    const delta = next_value.length - model.length
    if (before.input_type === `insertReplacementText` && from === to) {
      const window_from = Math.max(0, from - CONTEXT_CHECK_CHARS)
      const window_to = Math.min(model.length, to + CONTEXT_CHECK_CHARS)
      const old_window = model.slice(window_from, window_to)
      const new_window = next_value.slice(window_from, window_to + delta)
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
        (prefix_length === 0 && window_from > 0) ||
        (suffix_length === 0 && window_to < model.length)
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
    const prefix_from = Math.max(0, from - CONTEXT_CHECK_CHARS)
    const suffix_to = Math.min(model.length, to + CONTEXT_CHECK_CHARS)
    if (
      model.slice(prefix_from, from) !== next_value.slice(prefix_from, from) ||
      model.slice(to, suffix_to) !== next_value.slice(to + delta, suffix_to + delta)
    )
      throw new Error(`Editor input context diverged for ${before.input_type}`)
    return { from, to, insert: next_value.slice(from, from + insert_length) }
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
      area.value = model.text()
      before_snapshot = null
      return
    }
    const snapshot = before_snapshot
    try {
      if (!snapshot) throw new Error(`Input arrived without a beforeinput snapshot`)
      update_locally(() => {
        const next_selection = selection_of(area)
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
        if (snapshot.input_type === `insertFromComposition`) composition_range = null
      })
    } catch (error) {
      area.value = model.text()
      if (snapshot) set_dom_selection(area, snapshot)
      report_error(error)
    } finally {
      before_snapshot = null
    }
    sync_selection()
    measure_overlay_width()
  }
  const on_scroll = (): void => {
    const area = textarea
    if (!area) return
    scroll_top = area.scrollTop
    scroll_left = area.scrollLeft
  }
  const on_composition_start = (): void => {
    composing = true
    composition_seq += 1
    if (textarea) composition_range = selection_of(textarea)
  }
  const on_composition_end = (): void => {
    composing = false
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
      area.setSelectionRange(anchor, head)
      sync_selection()
      return
    }
    try {
      update_locally(() => {
        area.setRangeText(insert, from, to, `end`)
        area.setSelectionRange(anchor, head)
        model.transact([{ from, to, insert }], {
          selection: { anchor, head },
          source,
        })
      })
    } catch (error) {
      area.value = model.text()
      set_dom_selection(area, model.selection)
      report_error(error)
      return
    }
    sync_selection()
    measure_overlay_width()
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
        lineCount: saving_model.line_count,
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
  const on_keydown = (event: KeyboardEvent): void => {
    const area = textarea
    if (!area || editing_disabled || event.isComposing) return
    if (event.key === `Tab` && tab_moves_focus) {
      tab_moves_focus = false
      return
    }
    tab_moves_focus = false
    const command_modifier = event.metaKey || event.ctrlKey
    const lower_key = event.key.toLowerCase()
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
    const state: EditorState = {
      model,
      selection_start: area.selectionStart,
      selection_end: area.selectionEnd,
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
      bind:clientHeight={viewport_height}
      bind:clientWidth={viewport_width}
    >
      <pre
        aria-hidden="true"
        class="token-layer layer"
        style:height={`${total_height}px`}
        style:min-width={`${overlay_width}px`}
        style:transform={`translate(${-scroll_left}px, ${-scroll_top}px)`}>{#each visible_rows as row (row.line_idx)}<div
            class="line"
            style:top={`${row.top}px`}>{#each row.tokens as token (token.start)}<span
                class={token.css}>{token.text}</span
              >{/each}</div>{/each}</pre>
      <textarea
        aria-describedby={keyboard_help_id}
        aria-label={aria_label ?? `${model.uri} source`}
        autocapitalize="off"
        autocomplete="off"
        bind:this={textarea}
        autocorrect="off"
        onbeforeinput={on_before_input}
        onblur={on_blur}
        oncompositionend={on_composition_end}
        oncompositionstart={on_composition_start}
        onfocus={on_focus}
        oninput={on_input}
        onkeydown={on_keydown}
        onkeyup={sync_selection}
        onpointerup={sync_selection}
        onscroll={on_scroll}
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
    overflow: hidden;
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
    will-change: transform;
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
    overflow: auto;
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
