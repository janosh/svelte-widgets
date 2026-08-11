<script lang="ts">
  // Side-by-side/unified DiffBackend renderer. The backend already pairs replacements;
  // we only flatten hunks, elisions, and no-newline markers for virtualization.
  import { untrack } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import type { HTMLAttributes } from 'svelte/elements'
  import { tooltip } from '../attachments/index'
  import { editor_line_height, split_text_lines, visible_line_window } from './edit-ops'
  import { render_tokens } from './tokens'
  import { resolve_diff_backend, to_error } from './types'
  import type {
    DiffBackend,
    DiffLayout,
    DiffLine,
    DiffResult,
    DiffRow,
    DiffTextArgs,
    DiffViewOptions,
    RowKind,
  } from './types'

  let {
    old_text,
    new_text,
    filename,
    options,
    old_label = `Original`,
    new_label = `Modified`,
    single_col = false,
    on_error,
    backend,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    // The two versions as written to disk; the backend normalizes CRLF itself.
    old_text: string
    new_text: string
    // Drives grammar detection; comes back as `DiffResult.language`, shown in the header.
    filename: string
    // `context_lines` re-diffs when it changes, `layout` seeds the toggle once,
    // `font_size` drives the integral row height.
    options: DiffViewOptions
    // Column headings for unsaved-changes or history diffs.
    old_label?: string
    new_label?: string
    // Created file: one plain column, no empty left side or header/layout toggle.
    single_col?: boolean
    // Called once per failed diff, in addition to the inline error row.
    on_error?: (message: string) => void
    // Override set_diff_backend for tests or multi-engine hosts.
    backend?: DiffBackend
  } = $props()

  type Side = `old` | `new`
  // Single-column mode: unified-shaped rows without old gutter, signs, or tones.
  type RowLayout = DiffLayout | `solo`
  // Which side a cell is toned as; `equal` is unchanged context and takes no tone.
  type Cell = Side | `equal`
  // Both gutter numbers, since a unified row shows the other side's number too.
  type Gutters = { old_no: number | null; new_no: number | null }

  // One scroller row: side-by-side emits a pair; unified/solo a single per side.
  // Separate shapes keep the virtualized list flat and indexable.
  type DisplayRow =
    | { kind: `gap`; gap_idx: number; skipped: number }
    | { kind: `pair`; row_kind: RowKind; old: DiffLine | null; new: DiffLine | null }
    | ({ kind: `single`; row_kind: RowKind; side: Cell; line: DiffLine } & Gutters)
    | { kind: `no_newline`; sides: Side[] }

  const NO_NEWLINE_TEXT = String.raw`\ No newline at end of file`
  // Rows kept above/below the viewport so a fast scroll shows content, not blank space.
  const OVERSCAN_ROWS = 8

  let diff = $state<DiffResult | null>(null)
  let error_message = $state<string | null>(null)
  let is_loading = $state(false)
  // Seed once from options; the toggle owns layout afterward.
  let layout = $state<DiffLayout>(untrack(() => options.layout))
  const row_layout = $derived<RowLayout>(single_col ? `solo` : layout)
  let scroll_top = $state(0)
  let viewport_height = $state(0)
  let scroll_container = $state<HTMLDivElement | null>(null)
  // Gap index -> expanded. The trailing gap uses index `hunks.length`.
  const expanded_gaps = new SvelteSet<number>()

  // Share one integer height with CSS; measuring it back from DOM can drift virtualization.
  const row_height = $derived(editor_line_height(options.font_size))

  let load_generation = 0

  const load_diff = async (args: DiffTextArgs) => {
    const generation = ++load_generation
    is_loading = true
    try {
      const result = await resolve_diff_backend(backend).diff_text(args)
      // A slower earlier request must not overwrite a newer one that already finished.
      if (generation !== load_generation) return
      diff = result
      error_message = null
      expanded_gaps.clear()
      // New diff rows invalidate the old scroll offset.
      scroll_to_row(0)
    } catch (error) {
      if (generation !== load_generation) return
      diff = null
      // Use the local, not error_message: reading that state inside this $effect would
      // self-subscribe and double-report synchronous resolver failures.
      const message = to_error(error).message
      error_message = message
      on_error?.(message)
    } finally {
      if (generation === load_generation) is_loading = false
    }
  }

  $effect(() => {
    void load_diff({
      oldText: old_text,
      newText: new_text,
      filename,
      contextLines: options.context_lines,
    })
  })

  // Rebuild expanded gaps from props; DiffResult only keeps hunk lines. Gap text is
  // unchanged but has no spans, so renders unhighlighted.
  const old_lines = $derived(split_text_lines(old_text))
  const new_lines = $derived(split_text_lines(new_text))

  const plain_line = (lines: string[], line_no: number): DiffLine | null => {
    const text = lines[line_no - 1]
    return text === undefined ? null : { lineNo: line_no, text, spans: [] }
  }

  // Discard gap rows beyond both source texts when backend line counts disagree.
  const build_gap_rows = (old_from: number, new_from: number, count: number): DiffRow[] =>
    Array.from({ length: count }, (_unused, offset) => ({
      kind: `equal` as const,
      old: plain_line(old_lines, old_from + offset),
      new: plain_line(new_lines, new_from + offset),
    })).filter((row) => row.old !== null || row.new !== null)

  const pair_rows_of = (row: DiffRow): DisplayRow[] => [
    { kind: `pair`, row_kind: row.kind, old: row.old, new: row.new },
  ]

  const single_rows_of = (row: DiffRow): DisplayRow[] => {
    const base = { kind: `single`, row_kind: row.kind } as const
    // Emit equal text once; one-sided reconstructed gaps remain unsigned context.
    if (row.kind === `equal`) {
      const line = row.old ?? row.new
      if (!line) return []
      const [old_no, new_no] = [row.old?.lineNo ?? null, row.new?.lineNo ?? null]
      return [{ ...base, side: `equal`, line, old_no, new_no }]
    }
    // Unified order is delete then insert; only the source side gets a line number.
    return ([`old`, `new`] as const).flatMap((side) => {
      const line = row[side]
      if (!line) return []
      const [old_no, new_no] = side === `old` ? [line.lineNo, null] : [null, line.lineNo]
      return [{ ...base, side, line, old_no, new_no }]
    })
  }

  const display_rows_of = (
    result: DiffResult,
    current_layout: RowLayout,
    expanded: ReadonlySet<number>,
  ): DisplayRow[] => {
    const rows_of = current_layout === `side-by-side` ? pair_rows_of : single_rows_of
    const rows: DisplayRow[] = []

    const push_gap = (gap_idx: number, skipped: number, starts: [number, number]) => {
      if (skipped <= 0) return
      if (expanded.has(gap_idx)) {
        rows.push(...build_gap_rows(...starts, skipped).flatMap(rows_of))
      } else rows.push({ kind: `gap`, gap_idx, skipped })
    }

    result.hunks.forEach((hunk, hunk_idx) => {
      // 1-based starts: the elided run is [start - skippedBefore, start).
      const skipped = hunk.skippedBefore
      push_gap(hunk_idx, skipped, [hunk.oldStart - skipped, hunk.newStart - skipped])
      for (const row of hunk.rows) rows.push(...rows_of(row))
    })

    if (result.hunks.length === 0) return rows

    // The trailing elided run is unchanged: the last `skippedAfter` lines of a side.
    const { skippedAfter: skipped } = result
    push_gap(result.hunks.length, skipped, [
      result.oldLineCount - skipped + 1,
      result.newLineCount - skipped + 1,
    ])

    const missing: Side[] = []
    // Solo has no old column to mark, and the side it would mark is empty anyway.
    if (current_layout !== `solo` && !result.oldEndsWithNewline) missing.push(`old`)
    if (!result.newEndsWithNewline) missing.push(`new`)
    if (missing.length === 0) return rows
    // Only side-by-side has two columns to mark at once.
    if (current_layout !== `side-by-side`) {
      for (const side of missing) rows.push({ kind: `no_newline`, sides: [side] })
    } else rows.push({ kind: `no_newline`, sides: missing })
    return rows
  }

  const display_rows = $derived(
    diff ? display_rows_of(diff, row_layout, expanded_gaps) : [],
  )

  const row_window = $derived(
    visible_line_window(
      scroll_top,
      viewport_height,
      row_height,
      display_rows.length,
      OVERSCAN_ROWS,
    ),
  )
  const visible_rows = $derived(display_rows.slice(row_window.start, row_window.end))
  const pad_top = $derived(row_window.start * row_height)
  const pad_bottom = $derived((display_rows.length - row_window.end) * row_height)

  // Keep as helper: Svelte preserves newlines between adjacent markup expressions.
  const line_noun = (count: number): `line` | `lines` => (count === 1 ? `line` : `lines`)
  const line_count_label = (result: DiffResult): string =>
    `${result.newLineCount} ${line_noun(result.newLineCount)}`
  const is_change_row = (entry: DisplayRow | undefined): boolean =>
    (entry?.kind === `pair` || entry?.kind === `single`) && entry.row_kind !== `equal`

  // First row of each run of changed rows, so prev/next steps between edits, not lines.
  const change_anchors = $derived(
    display_rows.flatMap((entry, row_idx) =>
      is_change_row(entry) && !is_change_row(display_rows[row_idx - 1]) ? [row_idx] : [],
    ),
  )
  let navigation_row = $derived(Math.round(scroll_top / row_height))
  const previous_change = $derived(
    change_anchors.findLast((row_idx) => row_idx < navigation_row),
  )
  const next_change = $derived(change_anchors.find((row_idx) => row_idx > navigation_row))

  const scroll_to_row = (row_idx: number) => {
    const target = Math.max(0, row_idx * row_height)
    // Keep virtualization on the browser-clamped offset but navigation on the requested row.
    if (scroll_container) scroll_container.scrollTop = target
    scroll_top = scroll_container?.scrollTop ?? target
    navigation_row = row_idx
  }

  const go_to_change = (direction: 1 | -1) => {
    const target = direction === 1 ? next_change : previous_change
    if (target !== undefined) scroll_to_row(target)
  }

  // Must wrap token spans on both replace sides: editor.css colors .tok-emph through
  // this ancestor. `equal` is row kind side-by-side, row side in unified.
  const cell_class = (side: Cell): string =>
    side === `old` ? `diff-row-delete` : side === `new` ? `diff-row-insert` : ``

  // Absent side gets spacer fill; changed present side gets +/- tone.
  const gutter_tone = (line: DiffLine | null, row_kind: RowKind, side: Side): string =>
    !line ? `spacer` : row_kind === `equal` ? `` : side === `old` ? `del` : `ins`

  const UNIFIED_SIGNS: Record<Cell, string> = { old: `-`, new: `+`, equal: ` ` }
</script>

{#snippet layout_option(option: DiffLayout, label: string, divider: string)}
  <button
    aria-label={label}
    aria-pressed={layout === option}
    class="icon-btn"
    onclick={() => (layout = option)}
    title={label}
    type="button"
    {@attach tooltip()}
  >
    <svg viewBox="0 0 16 16">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d={divider} />
    </svg>
  </button>
{/snippet}

{#snippet nav_button(label: string, direction: 1 | -1, glyph: string)}
  <button
    aria-label={label}
    class="icon-btn"
    disabled={(direction === 1 ? next_change : previous_change) === undefined}
    onclick={() => go_to_change(direction)}
    title={label}
    type="button"
    {@attach tooltip()}>{glyph}</button
  >
{/snippet}

{#snippet gutter_cell(line_no: number | null, tone: string)}
  <span class="gutter {tone}">{line_no ?? ``}</span>
{/snippet}

{#snippet code_cell(line: DiffLine | null, row_class: string, side: string)}
  <!-- white-space: pre makes stray text nodes real spaces. Fragment-boundary trimming
  avoids them; the diff-view test pins indented-line reassembly. -->
  {#if line}
    <span class="code {row_class}" data-side={side}>
      {#each render_tokens(line.text, line.spans) as token (token.start)}
        <span class={token.css}>{token.text}</span>
      {/each}
    </span>
  {:else}
    <span class="code spacer" data-spacer={side}></span>
  {/if}
{/snippet}

{#snippet pair_side(line: DiffLine | null, row_kind: RowKind, side: Side)}
  {@render gutter_cell(line?.lineNo ?? null, gutter_tone(line, row_kind, side))}
  {@render code_cell(line, cell_class(row_kind === `equal` ? `equal` : side), side)}
{/snippet}

{#snippet no_newline_cell(sides: Side[], side: Side)}
  {#if sides.includes(side)}
    <span class="code no-newline-note" data-no-newline={side}>{NO_NEWLINE_TEXT}</span>
  {:else}
    <span class="code spacer" data-spacer={side}></span>
  {/if}
{/snippet}

<div
  {...rest}
  aria-busy={is_loading}
  class={[`diff-view`, rest.class]}
  style:--editor-font-size={`${options.font_size}px`}
  style:--editor-line-height={`${row_height}px`}
  style:--diff-old-gutter={`${String(diff?.oldLineCount ?? 1).length + 2}ch`}
  style:--diff-new-gutter={`${String(diff?.newLineCount ?? 1).length + 2}ch`}
>
  {#if !single_col}
    <header class="panel-header">
      <div class="panel-summary">
        <strong class="truncate">{old_label} → {new_label}</strong>
        <span>
          {#if diff}
            {diff.language}
            <span class="added">+{diff.added}</span>
            <span class="removed">-{diff.removed}</span>
          {:else if is_loading}
            Diffing {filename}...
          {/if}
        </span>
      </div>
      <div class="panel-actions">
        {@render nav_button(`Previous change`, -1, `↑`)}
        {@render nav_button(`Next change`, 1, `↓`)}
        <div class="segmented layout-toggle">
          {@render layout_option(`side-by-side`, `Side by side`, `M8 3v10`)}
          {@render layout_option(`unified`, `Unified`, `M2 8h12`)}
        </div>
      </div>
    </header>
  {/if}

  {#if error_message}
    <div class="diff-note error" role="alert">{error_message}</div>
  {/if}
  {#if diff?.truncated}
    <div class="diff-note" data-note="truncated">
      Word-level highlighting is incomplete: the diff hit its refinement budget.
      Line-level changes are still exact.
    </div>
  {/if}

  {#if diff && diff.hunks.length === 0}
    <div class="diff-empty" data-empty>
      <strong>{single_col ? `Empty file` : `No changes`}</strong>
      {#if !single_col}
        <span>{old_label} and {new_label} are identical ({line_count_label(diff)}).</span>
      {/if}
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- enables keyboard scrolling -->
    <div
      aria-label="{old_label} → {new_label} diff"
      bind:this={scroll_container}
      bind:clientHeight={viewport_height}
      class="diff-scroll"
      onscroll={(event) => {
        scroll_top = event.currentTarget.scrollTop
      }}
      role="region"
      tabindex="0"
    >
      <div class="diff-body" style="padding-block: {pad_top}px {pad_bottom}px">
        {#each visible_rows as entry, entry_idx (row_window.start + entry_idx)}
          {#if entry.kind === `gap`}
            <button
              aria-expanded="false"
              class="diff-gap"
              onclick={() => expanded_gaps.add(entry.gap_idx)}
              type="button"
            >
              ⋯ {entry.skipped} unchanged {line_noun(entry.skipped)}
            </button>
          {:else if entry.kind === `pair`}
            <div class="diff-row pair">
              {@render pair_side(entry.old, entry.row_kind, `old`)}
              {@render pair_side(entry.new, entry.row_kind, `new`)}
            </div>
          {:else if entry.kind === `single` && row_layout === `solo`}
            <!-- Every line is new, so tones would paint the whole file one color. -->
            <div class="diff-row solo">
              {@render gutter_cell(entry.new_no ?? entry.old_no, ``)}
              {@render code_cell(entry.line, ``, entry.side)}
            </div>
          {:else if entry.kind === `single`}
            <div class="diff-row unified">
              {@render gutter_cell(entry.old_no, entry.side === `old` ? `del` : ``)}
              {@render gutter_cell(entry.new_no, entry.side === `new` ? `ins` : ``)}
              <span class="sign {entry.side}">{UNIFIED_SIGNS[entry.side]}</span>
              {@render code_cell(entry.line, cell_class(entry.side), entry.side)}
            </div>
          {:else if row_layout === `solo`}
            <div class="diff-row solo">
              {@render gutter_cell(null, ``)}
              {@render no_newline_cell(entry.sides, `new`)}
            </div>
          {:else if row_layout === `unified`}
            <div class="diff-row unified">
              {@render gutter_cell(null, ``)}
              {@render gutter_cell(null, ``)}
              <span class="sign"></span>
              {@render no_newline_cell(entry.sides, entry.sides[0])}
            </div>
          {:else}
            <div class="diff-row pair">
              {@render gutter_cell(null, ``)}
              {@render no_newline_cell(entry.sides, `old`)}
              {@render gutter_cell(null, ``)}
              {@render no_newline_cell(entry.sides, `new`)}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .diff-view {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--page-bg, light-dark(#fff, #0d0f14));
  }
  .panel-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.125rem 1rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 9%, transparent);
    background: var(--surface-bg, light-dark(#f6f8fa, #181b22));
  }
  .panel-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.5rem;
    min-width: 0;
    font-size: 0.82rem;
  }
  .panel-summary > * {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel-summary span {
    color: var(--text-color-muted, light-dark(#5c6270, #aab0bf));
    font-size: 0.74rem;
  }
  .panel-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
  }
  .icon-btn {
    --icon-size: 16px;
    box-sizing: border-box;
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    inline-size: var(--icon-btn-size, 24px);
    block-size: var(--icon-btn-size, 24px);
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-color-muted, light-dark(#5c6270, #aab0bf));
    font: inherit;
    cursor: pointer;
  }
  .icon-btn > svg {
    inline-size: var(--icon-size);
    block-size: var(--icon-size);
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon-btn:hover:not(:disabled) {
    color: var(--text-color, light-dark(#24292e, #fff));
  }
  .icon-btn:disabled {
    cursor: not-allowed;
  }
  .icon-btn[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--active-color, #6ea8ff) 45%, transparent);
    background: color-mix(
      in srgb,
      var(--active-color, #6ea8ff) 22%,
      var(--btn-bg, light-dark(#e8ebf0, #242936))
    );
    color: color-mix(
      in srgb,
      var(--active-color, #6ea8ff) 45%,
      var(--text-color, light-dark(#24292e, white))
    );
  }
  .icon-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--active-color, #6ea8ff) 60%, transparent);
    outline-offset: 1px;
  }
  .segmented {
    display: inline-flex;
    gap: 1px;
  }
  .segmented .icon-btn:not(:first-child) {
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }
  .segmented .icon-btn:not(:last-child) {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
  }
  /* Quiet icon toggle; size the button because .icon-btn sets --icon-size itself. */
  .layout-toggle .icon-btn {
    --icon-btn-size: 18px;
    --icon-size: 12px;
    opacity: 0.6;
  }
  .layout-toggle .icon-btn:hover {
    opacity: 1;
  }
  .diff-note {
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 9%, transparent);
    color: var(--text-color-muted, #aab0bf);
    font-size: 0.78rem;
  }
  .diff-note.error {
    color: var(--error-color, #ff7b72);
  }
  .diff-empty {
    display: grid;
    flex: 1 1 auto;
    gap: 0.4rem;
    place-content: center;
    justify-items: center;
    color: var(--text-color-muted, #aab0bf);
    font-size: 0.85rem;
  }
  .diff-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    font-family: var(--editor-font);
    font-size: var(--editor-font-size);
  }
  .diff-scroll:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--active-color, #6ea8ff) 60%, transparent);
    outline-offset: -2px;
  }
  /* max-content lets long lines scroll and keeps both columns equally wide. */
  .diff-body {
    min-width: max-content;
  }
  .diff-row {
    display: grid;
    box-sizing: border-box;
    height: var(--editor-line-height);
    line-height: var(--editor-line-height);
  }
  .diff-row.pair {
    grid-template-columns:
      var(--diff-old-gutter) 1fr var(--diff-new-gutter)
      1fr;
  }
  .diff-row.unified {
    grid-template-columns:
      var(--diff-old-gutter) var(--diff-new-gutter)
      1.6ch 1fr;
  }
  .diff-row.solo {
    grid-template-columns: var(--diff-new-gutter) 1fr;
  }
  .gutter {
    padding-inline: 0.4rem;
    overflow: hidden;
    color: var(--editor-gutter-color);
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
  }
  .sign {
    color: var(--editor-gutter-color);
    text-align: center;
    user-select: none;
  }
  .panel-summary .removed,
  .gutter.del,
  .sign.old {
    color: var(--diff-del-marker);
  }
  .panel-summary .added,
  .gutter.ins,
  .sign.new {
    color: var(--diff-add-marker);
  }
  .code {
    padding-inline: 0.4rem;
    color: var(--tok-plain);
    tab-size: 4;
    white-space: pre;
  }
  .code.diff-row-delete {
    background: var(--diff-del-bg);
  }
  .code.diff-row-insert {
    background: var(--diff-add-bg);
  }
  .spacer {
    background: var(--diff-spacer-bg);
  }
  .no-newline-note {
    color: var(--text-color-muted, #aab0bf);
    font-style: italic;
  }
  .diff-gap {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    height: var(--editor-line-height);
    padding-inline: 0.6rem;
    border: 0;
    background: var(--diff-skip-bg);
    color: var(--text-color-muted, #aab0bf);
    font-size: 0.75rem;
    text-align: left;
  }
  .diff-gap:hover {
    color: var(--text-color, light-dark(#24292e, #fff));
  }
  @media (max-width: 800px) {
    .panel-header {
      align-items: stretch;
      flex-direction: column;
      gap: 0.4rem;
    }
    .panel-actions {
      flex-wrap: wrap;
    }
  }
</style>
