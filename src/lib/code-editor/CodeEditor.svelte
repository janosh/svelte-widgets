<script lang="ts" module>
  let next_doc_seq = 0
</script>

<script lang="ts">
  // Editable code view: a transparent textarea supplies selection, caret, keyboard
  // input, and native undo while a virtualized pre paints the current text and tokens.
  import { untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import {
    auto_close_pair,
    auto_indent_newline,
    dedent_selection,
    editor_line_height,
    indent_selection,
    toggle_line_comment,
    visible_line_window,
  } from './edit-ops'
  import type { EditorState, RangeEdit } from './edit-ops'
  import { create_highlight_client } from './highlight-client'
  import type { HighlightClient, HighlightSpansEvent } from './highlight-client'
  import { indent_unit, line_comment_token } from './languages'
  import { editor_text, line_at_offset, splice_within_limits } from './text-delta'
  import type { BeforeInputSnapshot } from './text-delta'
  import { render_tokens } from './tokens'
  import { resolve_editor_backend, to_error } from './types'
  import type { CodeEditorOptions, EditorBackend, OpenDocResult, SpanList } from './types'

  type SaveHandler = (text: string, document: OpenDocResult) => Promise<void> | void

  let {
    text = $bindable(``),
    filename,
    options = {},
    read_only = false,
    aria_label,
    backend,
    on_dirty_change,
    on_ready,
    on_save,
    on_error,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    // The editable buffer. Initial CRLF/BOM input is normalized to textarea text.
    text?: string
    filename: string
    options?: CodeEditorOptions
    read_only?: boolean
    aria_label?: string
    backend?: EditorBackend
    on_dirty_change?: (dirty: boolean) => void
    on_ready?: (document: OpenDocResult) => void
    // Persistence is deliberately host-owned. Successful resolution marks the
    // current buffer clean; rejection leaves it dirty and reaches on_error.
    on_save?: SaveHandler
    on_error?: (message: string) => void
  } = $props()

  const OVERSCAN_ROWS = 8

  let textarea = $state<HTMLTextAreaElement>()
  let doc_info = $state<OpenDocResult | null>(null)
  let error_message = $state<string | null>(null)
  let doc_revision = $state(0)
  let tokens_revision = $state(0)
  let scroll_top = $state(0)
  let scroll_left = $state(0)
  let viewport_height = $state(0)
  let overlay_width = $state(0)
  let caret_line = $state(0)
  let saving = $state(false)
  let baseline_text = $state(``)
  let last_reported_dirty = false
  let last_local_write = $state<string | null>(null)
  let tokens_by_line: (SpanList | undefined)[] = []
  let before_snapshot: BeforeInputSnapshot | null = null

  const normalized_text = $derived(text === last_local_write ? text : editor_text(text))
  const font_size = $derived.by(() => {
    const value = Number(options.font_size)
    return Number.isFinite(value) && value > 0 ? value : 13
  })
  const tab_size = $derived.by(() => {
    const integer = Math.floor(Number(options.tab_size))
    return Number.isFinite(integer) ? Math.min(Math.max(integer, 1), 16) : 2
  })
  const line_height = $derived(editor_line_height(font_size))
  const indent = $derived(indent_unit(tab_size, options.insert_spaces ?? true))
  const comment_token = $derived(
    options.line_comment === undefined
      ? line_comment_token(filename)
      : options.line_comment,
  )
  const show_line_numbers = $derived(options.line_numbers ?? true)
  const editing_disabled = $derived(read_only || doc_info?.editable !== true)

  const blank_tokens = (count: number): (SpanList | undefined)[] =>
    Array.from({ length: count })

  const report_error = (error: unknown): void => {
    const message = to_error(error).message
    error_message = message
    on_error?.(message)
  }

  const receive_spans = (event: HighlightSpansEvent): void => {
    tokens_by_line.splice(event.start_line, event.spans.length, ...event.spans)
    tokens_revision += 1
  }

  // Track the bound source separately so local writes reuse the client without joining
  // its full line index; a genuinely external replacement creates a new document.
  let open_document: {
    filename: string
    backend: EditorBackend
    source_text: string
    client: HighlightClient
  } | null = null
  const write_text = (active: HighlightClient, value: string): void => {
    last_local_write = value
    if (open_document?.client === active) open_document.source_text = value
    text = value
  }
  const client = $derived.by(() => {
    const normalized = normalized_text
    const resolved_backend = resolve_editor_backend(backend)
    const current = open_document
    if (
      current?.filename === filename &&
      current.backend === resolved_backend &&
      current.source_text === text
    ) {
      return current.client
    }
    next_doc_seq += 1
    const created = create_highlight_client({
      doc_id: `code-editor-${next_doc_seq}`,
      filename,
      text: normalized,
      raw_text: text,
      backend: resolved_backend,
      on_spans: receive_spans,
      on_error: report_error,
    })
    open_document = {
      filename,
      backend: resolved_backend,
      source_text: text,
      client: created,
    }
    return created
  })

  const line_count = $derived.by(() => {
    void doc_revision
    return client.line_count()
  })
  const window_lines = $derived.by(() => {
    void doc_revision
    return visible_line_window(
      scroll_top,
      viewport_height,
      line_height,
      client.line_count(),
      OVERSCAN_ROWS,
    )
  })
  const visible_rows = $derived.by(() => {
    void doc_revision
    void tokens_revision
    const lines = client.line_index().lines
    const { start, end } = window_lines
    return Array.from({ length: end - start }, (_unused, offset) => {
      const line_idx = start + offset
      return {
        line_idx,
        top: line_idx * line_height,
        tokens: render_tokens(lines[line_idx] ?? ``, tokens_by_line[line_idx] ?? []),
      }
    })
  })
  const total_height = $derived(line_count * line_height)
  const gutter_digits = $derived(Math.max(2, String(line_count).length))

  const report_dirty = (): void => {
    const dirty = current_text() !== baseline_text
    if (dirty === last_reported_dirty) return
    last_reported_dirty = dirty
    on_dirty_change?.(dirty)
  }

  $effect(() => {
    const active = client
    const document_filename = filename
    let cancelled = false
    const is_current = (): boolean => !cancelled && open_document?.client === active
    tokens_by_line = blank_tokens(active.line_count())
    doc_info = null
    error_message = null
    scroll_top = 0
    scroll_left = 0
    overlay_width = 0
    caret_line = 0
    before_snapshot = null
    const active_text = active.text()
    if (untrack(() => text) !== active_text) write_text(active, active_text)
    queueMicrotask(() => {
      if (!is_current() || !textarea) return
      textarea.scrollTop = 0
      textarea.scrollLeft = 0
      textarea.setSelectionRange(0, 0)
      measure_overlay_width()
    })
    const was_dirty = last_reported_dirty
    baseline_text = active_text
    last_reported_dirty = false
    if (was_dirty) on_dirty_change?.(false)
    active
      .open()
      .then((result) => {
        if (!is_current()) return
        doc_info = result
        error_message = null
        on_ready?.(result)
      })
      .catch((error) => {
        if (!is_current()) return
        report_error(error)
      })
    return () => {
      cancelled = true
      void active.close().catch((error) => {
        console.error(
          `Failed to close editor backend document for ${document_filename}`,
          error,
        )
      })
    }
  })

  $effect(() => {
    const { start, end } = window_lines
    if (doc_info?.highlightable) client.request_highlight(start, end)
  })

  const measure_overlay_width = (): void => {
    const area = textarea
    if (!area) return
    const width = Math.max(area.scrollWidth, area.clientWidth)
    if (width !== overlay_width) overlay_width = width
  }

  const track_viewport = (element: HTMLElement): (() => void) => {
    const measure = (): void => {
      viewport_height = element.clientHeight
      measure_overlay_width()
    }
    measure()
    if (typeof ResizeObserver === `undefined`) return () => undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }

  const current_text = (): string => textarea?.value ?? client.text()

  const sync_caret = (): void => {
    const area = textarea
    if (area) caret_line = line_at_offset(client.line_index(), area.selectionStart)
  }

  const on_before_input = (event: InputEvent): void => {
    const area = textarea
    if (!area) return
    before_snapshot = {
      selection_start: area.selectionStart,
      selection_end: area.selectionEnd,
      input_type: event.inputType,
      value_length: area.value.length,
    }
  }

  const on_input = (): void => {
    const area = textarea
    const snapshot = before_snapshot
    before_snapshot = null
    if (!area) return
    if (editing_disabled) {
      area.value = client.text()
      return
    }
    const active = client
    const next_value = area.value
    const splice = snapshot ? active.handle_input(snapshot, next_value) : null
    if (!snapshot) active.set_text(next_value)
    if (splice) {
      tokens_by_line = splice_within_limits(
        tokens_by_line,
        splice.start_line,
        splice.removed_count,
        blank_tokens(splice.inserted_lines.length),
      )
    } else tokens_by_line = blank_tokens(active.line_count())
    write_text(active, next_value)
    doc_revision += 1
    sync_caret()
    measure_overlay_width()
    report_dirty()
  }

  const on_scroll = (): void => {
    const area = textarea
    if (!area) return
    scroll_top = area.scrollTop
    scroll_left = area.scrollLeft
  }

  // execCommand preserves native undo where supported. setRangeText keeps commands
  // working elsewhere and dispatches the same input pair consumed above.
  const insert_text = (area: HTMLTextAreaElement, replacement: string): boolean => {
    area.focus()
    if (
      typeof document.execCommand === `function` &&
      document.execCommand(`insertText`, false, replacement)
    )
      return true
    const input_init = {
      bubbles: true,
      data: replacement,
      inputType: `insertText`,
    }
    const before_input = new InputEvent(`beforeinput`, {
      ...input_init,
      cancelable: true,
    })
    if (!area.dispatchEvent(before_input)) {
      before_snapshot = null
      return false
    }
    area.setRangeText(replacement, area.selectionStart, area.selectionEnd, `end`)
    area.dispatchEvent(new InputEvent(`input`, input_init))
    return true
  }

  const run_save = async (): Promise<boolean> => {
    if (!on_save || editing_disabled || saving) return false
    const info = doc_info
    if (!info) return false
    const active = client
    saving = true
    try {
      const content = current_text()
      await on_save(content, info)
      if (open_document?.client !== active) return true
      baseline_text = content
      error_message = null
      report_dirty()
      return true
    } catch (error) {
      if (open_document?.client === active) report_error(error)
      return false
    } finally {
      saving = false
    }
  }

  const on_keydown = (event: KeyboardEvent): void => {
    const area = textarea
    if (!area || editing_disabled || event.isComposing) return
    if (
      event.key.toLowerCase() === `s` &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      on_save
    ) {
      event.preventDefault()
      void run_save()
      return
    }
    const state: EditorState = {
      text: area.value,
      selection_start: area.selectionStart,
      selection_end: area.selectionEnd,
    }
    const apply_or_fall_through = (edit: RangeEdit | null): void => {
      if (!edit) return
      event.preventDefault()
      area.setSelectionRange(edit.range_start, edit.range_end)
      if (!insert_text(area, edit.replacement)) return
      area.setSelectionRange(edit.selection_start, edit.selection_end)
    }
    if (event.key === `Tab`) {
      apply_or_fall_through(
        (event.shiftKey ? dedent_selection : indent_selection)(state, indent),
      )
      return
    }
    if (event.key === `Enter` && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      const insertion = auto_indent_newline(state, indent)
      if (!insert_text(area, insertion.insert_text)) return
      const caret = area.selectionStart - insertion.cursor_back
      area.setSelectionRange(caret, caret)
      return
    }
    if (event.key === `/` && (event.metaKey || event.ctrlKey) && comment_token) {
      apply_or_fall_through(toggle_line_comment(state, comment_token))
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const pair = auto_close_pair(state, event.key)
    if (!pair) return
    event.preventDefault()
    if (pair.text === state.text) {
      area.setSelectionRange(pair.selection_start, pair.selection_end)
      return
    }
    const grown = pair.text.length - state.text.length
    const inserted = pair.text.slice(state.selection_start, state.selection_start + grown)
    if (!insert_text(area, inserted)) return
    area.setSelectionRange(pair.selection_start, pair.selection_end)
  }

  export const save = (): Promise<boolean> => run_save()
  export const focus = (): void => textarea?.focus()
</script>

<div
  {...rest}
  aria-busy={(doc_info === null && error_message === null) || saving}
  class={[`code-editor`, rest.class]}
  style:--editor-font-size={`${font_size}px`}
  style:--editor-line-height={`${line_height}px`}
  style:--editor-tab-size={tab_size}
>
  {#if error_message}
    <div class="editor-bar error" role="alert">{error_message}</div>
  {/if}
  <div class="editor-body">
    {#if show_line_numbers}
      <div class="gutter" aria-hidden="true" style:width={`${gutter_digits + 2}ch`}>
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
    <div class="content" {@attach track_viewport}>
      <!-- Whitespace inside pre is preserved, so source indentation between spans must
      remain absent. Text always comes from the line index; stale tokens never do. -->
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
        aria-label={aria_label ?? `${filename} source`}
        autocapitalize="off"
        autocomplete="off"
        bind:this={textarea}
        {...{ autocorrect: `off` }}
        onbeforeinput={on_before_input}
        oninput={on_input}
        onkeydown={on_keydown}
        onkeyup={sync_caret}
        onpointerup={sync_caret}
        onscroll={on_scroll}
        readonly={editing_disabled}
        spellcheck="false"
        value={normalized_text}
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
  .editor-bar {
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    color: var(--text-color-muted, light-dark(#5c6270, #aab0bf));
    font-size: 0.78rem;
  }
  .editor-bar.error {
    color: var(--error-color, #cf222e);
    background: color-mix(in srgb, var(--error-color, #f85149) 10%, transparent);
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
  }
  .gutter-line.active {
    color: var(--editor-gutter-active-color);
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
  }
  textarea::selection {
    background: var(--editor-selection-bg);
  }
</style>
