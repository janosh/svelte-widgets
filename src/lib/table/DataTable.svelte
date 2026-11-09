<script lang="ts" generics="Row extends object, Prefs extends ColumnPrefs = ColumnPrefs">
  // Sortable, filterable, resizable data table built from this package's table pieces: header
  // sort (Shift for multi-sort), per-column filters, a column picker, search, pagination or
  // row virtualization, drag/keyboard cell selection with copy, column drag reorder, drag or
  // keyboard column resizing, left/right pinned columns, summary rows and export. Hosts own
  // number formatting, HTML rendering and cell colors through props (see MatterViz's
  // HeatmapTable for a color-scale wrapper).
  import { prefersReducedMotion } from 'svelte/motion'
  import ActionMenu from '../ActionMenu.svelte'
  import Icon from '../Icon.svelte'
  import Popover from '../Popover.svelte'
  import { tooltip } from '../attachments/index'
  import { download } from '../download'
  import { Columns, Cross, Download, Search as SearchIcon } from '../icons'
  import type { IconData } from '../icons'
  import type { CmdAction, CmdSection } from '../types'
  import { clamp, escape_html, html_to_text } from '../utils'
  import { virtual_window } from '../virtual'
  import ColumnFilter from './ColumnFilter.svelte'
  import ColumnPicker from './ColumnPicker.svelte'
  import DateTimeFormatMenu from './DateTimeFormatMenu.svelte'
  import type {
    CellColor,
    CellSnippet,
    CellVal,
    ColorStats,
    Column,
    ColumnPrefs,
    ColumnStats,
    DateTimeFormatMode,
    Pagination,
    PinSide,
    RowData,
    RowId,
    Search,
    SortHint,
    SummaryStat,
    TableExportFormat,
    TableSort,
    VirtualScroll,
    DataTableProps,
  } from './data-table'
  import { compute_column_stats, NULL_CELL_COLOR, resolve_domain } from './data-table'
  import {
    cell_readers,
    cell_text,
    DATETIME_MODES_BY_KIND,
    default_format_number,
    discover_columns,
    escape_markup,
    format_datetime,
    infer_datetime_kind,
    is_html_str,
    is_plain_object,
    is_invalid,
    MIDDLE_ELLIPSIS_MIN_LENGTH,
    middle_ellipsis_parts,
    parse_datetime_val,
    parse_numeric_val,
    same_while_equal,
    sort_table_rows,
    text_matches_query,
    with_defaults,
  } from './data'
  import { table_to_json, table_to_text, tsv_cell } from './export'
  import { compile_filter } from './filter'
  import {
    cell_range_select,
    CellSelection,
    INTERACTIVE_SELECTOR,
  } from './selection.svelte'
  import type { CellPos, ColumnFilterValue, TableMatrix } from './types'
  import { type Snippet, tick, untrack } from 'svelte'
  import { flip } from 'svelte/animate'
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    data: input_data = [],
    columns: given_columns = [],
    sort_hint = undefined,
    cell,
    controls,
    sort = $bindable([]),
    default_num_format = undefined,
    format_number = default_format_number,
    render_html = escape_markup,
    column_color,
    menu_sections,
    on_row_click,
    on_row_double_click,
    on_row_hover,
    highlighted_row_id = null,
    column_order = $bindable([]),
    column_prefs = $bindable({}),
    export_formats = [],
    export_filename = `table-export`,
    on_export,
    show_column_toggle = false,
    show_filters = false,
    summary = false,
    density = `cosy`,
    keyboard_cells = false,
    search = false,
    search_query = $bindable(``),
    show_row_select = false,
    pagination = false,
    virtual = false,
    row_key,
    row_animation_ms = 0,
    selected_ids = $bindable([]),
    visible_rows = $bindable([]),
    hidden_columns = $bindable(),
    scroll_style,
    root_style,
    show_row_numbers = false,
    allow_better_toggle = false,
    allow_pinning = true,
    show_controls = `hover`,
    controls_props,
    controls_active = false,
    container_el = $bindable(),
    ...rest
  }: DataTableProps<Row, Prefs> = $props()

  // Split rendered markup at a grapheme boundary, retaining inline formatting on both sides.
  // A link crossing the split is split inside itself, so it stays one link (one hover state,
  // accessible name and tab stop) and nodes beside it (e.g. a marker) stay unclipped. Only
  // these HTML-owned nodes move; Svelte cell snippets stay untouched.
  function ellipsize_html(element: HTMLSpanElement) {
    const text = element.textContent ?? ``
    if (text.length <= MIDDLE_ELLIPSIS_MIN_LENGTH) return
    let offset = middle_ellipsis_parts(text)[0].length
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node && offset > (node.textContent?.length ?? 0)) {
      offset -= node.textContent?.length ?? 0
      node = walker.nextNode()
    }
    if (!node) return
    const box = node.parentElement?.closest(`a`) ?? element
    const range = document.createRange()
    range.selectNodeContents(box)
    range.setStart(node, offset)
    const end = document.createElement(`span`)
    end.append(range.extractContents())
    const start = document.createElement(`span`)
    start.append(...box.childNodes)
    box.append(start, end)
    box.classList.add(`middle-ellipsis-html`)
    // wrappers around the link shrink with it so its head can clip
    for (let host = box; host !== element && host.parentElement;) {
      host = host.parentElement
      host.classList.add(`middle-ellipsis-host`)
    }
    element.dataset.title = text
  }

  // Keyed cell access is internal; callers can use ordinary typed row interfaces. With row_key,
  // a row equal to its id's previous one keeps that object: a live refresh (a trajectory
  // frame's fresh rows) then re-renders only the rows whose values changed. Plain objects
  // only: own keys and values are all a cell can read of them (a class row's getters aren't).
  let prev_rows = new Map<RowId, Row & RowData>()
  const data = $derived.by(() => {
    const rows = input_data as (Row & RowData)[]
    if (row_key === undefined) return rows
    const prev = prev_rows
    prev_rows = new Map()
    return rows.map((row) => {
      const id = get_row_id(row)
      const old = prev.get(id)
      const kept =
        old &&
        is_plain_object(row) &&
        same_parts(Object.keys(old), Object.keys(row)) &&
        same_parts(Object.values(old), Object.values(row))
          ? old
          : row
      prev_rows.set(id, kept)
      return kept
    })
  })

  const join_styles = (...parts: (string | null | undefined)[]): string | undefined =>
    parts.filter(Boolean).join(`; `) || undefined
  // Elementwise === of two lists, for the memoized deriveds below
  const same_parts = (parts: readonly unknown[], prev: readonly unknown[]): boolean =>
    parts.length === prev.length && parts.every((part, idx) => part === prev[idx])

  // Discovered columns keep their identity while the same keys are found, so a data update
  // doesn't rebuild every column view (and with it every cell)
  let discovered: Column<Row>[] = []
  let columns = $derived.by(() => {
    let resolved = given_columns
    if (resolved.length === 0) {
      const found = discover_columns<Row>(data)
      const id_list = (list: Column<Row>[]) => list.map((col) => col.id)
      if (!same_parts(id_list(found), id_list(discovered))) discovered = found
      resolved = discovered
    }
    const ids = new Set<string>()
    for (const col of resolved) {
      if (!col.id || ids.has(col.id))
        throw new Error(`Column id must be nonempty and unique: ${col.id}`)
      ids.add(col.id)
    }
    return resolved
  })
  // A column keyed to no row field (id `Energy` for rows with `energy`) renders all n/a
  $effect(() => {
    if (cell || !data.length) return
    for (const col of given_columns) {
      if (!col.cell && !data.some((row) => cell_key(col) in row))
        console.warn(`DataTable column ${col.id}: key ${cell_key(col)} is in no row`)
    }
  })

  // === Config normalisation ===
  let pagination_config = $derived(with_defaults(pagination, { page_size: 25 }))
  // Writable: the page-size selector overrides it until the parent changes pagination
  let page_size = $derived(pagination_config?.page_size ?? 25)
  let search_config = $derived(
    with_defaults(search, { placeholder: `Filter...`, expanded: false }),
  )
  let search_expanded = $derived(search_config?.expanded ?? false)
  let virtual_config = $derived(
    pagination_config ? null : with_defaults(virtual, { overscan: 10, min_window: 60 }),
  )
  let hint_config = $derived(
    sort_hint
      ? {
          position: `bottom` as const,
          permanent: false,
          ...(typeof sort_hint === `string` ? { text: sort_hint } : sort_hint),
        }
      : null,
  )
  let summary_stats = $derived<SummaryStat[]>(
    summary === true ? [`mean`] : summary === false ? [] : summary,
  )

  let export_menu_open = $state(false)
  let columns_open = $state(false)
  // At most one header popover open: one column's filter panel or date/time format list
  type PopoverKind = `filter` | `datetime`
  let header_popover = $state<{ kind: PopoverKind; col_id: string } | null>(null)
  const popover_open = (kind: PopoverKind, col_id: string): boolean =>
    header_popover?.kind === kind && header_popover.col_id === col_id
  const toggle_popover = (kind: PopoverKind, col_id: string) => {
    header_popover = popover_open(kind, col_id) ? null : { kind, col_id }
  }
  // A close clears the entry only while this popover still owns it, never a newer one
  const set_popover = (kind: PopoverKind, col_id: string, open: boolean) => {
    if (open) header_popover = { kind, col_id }
    else if (popover_open(kind, col_id)) header_popover = null
  }

  // === Per-column preferences ===
  // Everything the user tunes per column lives in the bindable column_prefs record, so a
  // host can persist and restore it wholesale. Reads fall back to the column's config.
  const prefs_of = (col_id: string): ColumnPrefs => column_prefs[col_id] ?? {}
  function set_pref<Key extends keyof ColumnPrefs>(
    col_id: string,
    key: Key,
    value: ColumnPrefs[Key],
  ) {
    // Rebuild without the key rather than deleting it, so clearing a pref leaves no
    // undefined-valued entry behind for hosts that serialize column_prefs
    const { [key]: _dropped, ...kept } = prefs_of(col_id)
    // Prefs extends ColumnPrefs, so a copy with one ColumnPrefs field changed still is one
    const next = (value === undefined ? kept : { ...kept, [key]: value }) as Prefs
    column_prefs = { ...column_prefs, [col_id]: next }
  }
  const better_of = (col: Column<Row>): `higher` | `lower` | undefined =>
    prefs_of(col.id).better ?? col.better

  // === Column identity and order ===
  let columns_by_id = $derived(new Map(columns.map((col) => [col.id, col])))
  const key_of_id = (col_id: string): string => columns_by_id.get(col_id)?.key ?? col_id
  const cell_key = (col: Column<Row>): string => col.key ?? col.id

  // column_order first (stale IDs skipped), then any column it doesn't mention. Groups are made
  // contiguous: the header emits one colspan per group, so a split group mislabels its members.
  let ordered_columns = $derived.by(() => {
    const ordered = [...new Set(column_order)]
      .map((identifier) => columns_by_id.get(identifier))
      .filter((col) => col != null)
    const ordered_ids = new Set(ordered.map((col) => col.id))
    const merged = [...ordered, ...columns.filter((col) => !ordered_ids.has(col.id))]
    const groups = Map.groupBy(merged, (col) => col.group)
    return merged.flatMap((col) => {
      if (!col.group) return [col]
      const members = groups.get(col.group) ?? []
      groups.delete(col.group) // emitted whole at its first member, skipped at the rest
      return members
    })
  })
  // Write the resolved order back to the bindable prop so hosts persist a complete, valid list.
  // Only on a real change: a fresh array reference would re-trigger this effect forever. Left
  // alone while columns are empty, so a persisted order survives until the data arrives.
  $effect(() => {
    if (columns.length === 0) return
    const new_order = ordered_columns.map((col) => col.id)
    if (!same_parts(new_order, column_order)) column_order = new_order
  })
  // Kept while the same columns show in the same order: the mount-time column_order write-back
  // (a fresh but equal ordered_columns) then re-scans no column statistics
  let prev_visible_columns: Column<Row>[] = []
  // hidden_columns, else the columns hidden by default
  let hidden_ids = $derived(
    new Set(
      hidden_columns ??
        columns.filter((col) => col.visible === false).map((col) => col.id),
    ),
  )
  let visible_columns = $derived.by(() => {
    const next = ordered_columns.filter((col) => !hidden_ids.has(col.id))
    if (same_parts(next, prev_visible_columns)) return prev_visible_columns
    return (prev_visible_columns = next)
  })
  let has_group_header = $derived(visible_columns.some((col) => col.group))
  // Cells rendered before the data columns: the select checkbox and the row number
  let leading_cols = $derived((show_row_select ? 1 : 0) + (show_row_numbers ? 1 : 0))
  let body_colspan = $derived(visible_columns.length + leading_cols)
  // Keeps the resize handle's click from sorting its parent header
  const stop_event = (event: Event) => event.stopPropagation()

  // === Date/time columns ===
  let datetime_column_kinds = $derived.by(() => {
    const kinds = new Map<string, `date` | `time` | `datetime`>()
    const sample = data.slice(0, 25)
    for (const col of columns) {
      const data_key = cell_key(col)
      const kind = infer_datetime_kind(
        col,
        sample.map((row) => row[data_key]),
      )
      if (kind) kinds.set(col.id, kind)
    }
    return kinds
  })
  // Ticks once a minute while any column shows relative times so "Xm ago" cells stay fresh.
  let relative_now_ms = $state(Date.now())
  // A boolean, so the timer restarts only when relative mode toggles, not per view rebuild
  let shows_relative = $derived.by(() => cols.some((view) => view.dt_mode === `relative`))
  $effect(() => {
    if (!shows_relative) return
    relative_now_ms = Date.now() // refresh immediately when relative mode turns on
    const interval = setInterval(() => (relative_now_ms = Date.now()), 60_000)
    return () => clearInterval(interval)
  })
  function format_datetime_cell(
    val: CellVal,
    col: Column<Row>,
    mode: DateTimeFormatMode,
  ) {
    const timestamp = parse_datetime_val(val, col)
    return timestamp === null ? null : format_datetime(timestamp, mode, relative_now_ms)
  }

  // Every column's cells read as numbers once per data change (NaN where a cell has none),
  // shared by alignment, column colors and the column statistics, which re-parsed every
  // cell on each search keystroke (~290 ms at 50k x 30). `all_numeric`: every non-empty cell is
  // numeric. Row-major: a column-at-a-time pass walks every row object per column, and those
  // scattered loads cost ~8x the parsing (50k x 30: 155 -> 19 ms, mount 480 -> 250 ms).
  let parsed_columns = $derived.by(() => {
    const cols = [...new Set(columns.map(cell_key))].map((key) => ({
      key,
      nums: new Float64Array(data.length),
      any_numeric: false,
      all_numeric: true,
    }))
    for (let row_idx = 0; row_idx < data.length; row_idx++) {
      const row = data[row_idx]
      for (const col of cols) {
        const val = row[col.key]
        const num = parse_numeric_val(val)
        col.nums[row_idx] = num ?? NaN
        if (num !== null) col.any_numeric = true
        else if (!is_invalid(val) && val !== ``) col.all_numeric = false
      }
    }
    return new Map(cols.map((col) => [col.key, col]))
  })

  // Right-align all-numeric columns (not dates or custom cells). Checks every row, not a
  // sample, since a column may turn to text near the end.
  let numeric_columns = $derived.by(() => {
    const is_numeric = (col: Column<Row>) => {
      const parsed = parsed_columns.get(cell_key(col))
      return (
        !datetime_column_kinds.has(col.id) &&
        !col.cell &&
        parsed?.any_numeric &&
        parsed.all_numeric
      )
    }
    return new Set(columns.filter(is_numeric).map((col) => col.id))
  })

  // === Filtering ===
  // Per-column filters over all columns (hiding one mustn't change which rows show). Cached
  // by content since column_prefs also holds widths: else each resize pointermove would
  // re-filter every row and wipe the cell selection.
  const keep_filters = same_while_equal<{ key: string; filter: ColumnFilterValue }[]>()
  let active_filters = $derived(
    keep_filters(
      columns
        // plain copies: column_prefs is a deep proxy, read per row and filter otherwise
        .map((col) => ({
          key: cell_key(col),
          filter: $state.snapshot(prefs_of(col.id).filter),
        }))
        .filter((entry): entry is { key: string; filter: ColumnFilterValue } =>
          Boolean(entry.filter),
        ),
    ),
  )

  // A keystroke re-filters every row and rebuilds one d3 scale per column (60 ms at 10k x 30).
  // Clearing applies at once, since waiting reads as a hang.
  let debounced_query = $state(untrack(() => search_query))
  $effect(() => {
    const query = search_query
    if (!query.trim()) return void (debounced_query = query)
    const timer = setTimeout(() => (debounced_query = query), 150)
    return () => clearTimeout(timer)
  })

  // Searched values and their lowercased text (filled lazily once a query reaches a cell) per
  // row object. An entry outlives data updates while its row's searched values are unchanged,
  // so a live refresh re-reads only replaced or edited rows (50k x 30, one row replaced under a
  // query: 537 -> 132 ms). Objects and Dates can change inside, so their text is never cached.
  type SearchEntry = { values: CellVal[]; text: string[] }
  const search_cache = new WeakMap<object, SearchEntry>()
  // Every row with its index in `data`. None is skipped: a row whose fields are all undefined
  // still renders (as n/a), and cell-snippet columns may read no row field at all. Without
  // search.keys only column data is searched, not row style/class or other fields.
  let search_index = $derived.by(() => {
    const keys = search_config?.keys ?? columns.map(cell_key)
    const index: { row: Row & RowData; row_idx: number; entry: SearchEntry }[] = []
    for (let row_idx = 0; row_idx < data.length; row_idx++) {
      const row = data[row_idx]
      const cached = search_cache.get(row)
      const entry =
        cached?.values.length === keys.length &&
        keys.every((key, key_idx) => Object.is(cached.values[key_idx], row[key]))
          ? cached
          : { values: keys.map((key) => row[key]), text: [] }
      if (entry !== cached) search_cache.set(row, entry)
      index.push({ row, row_idx, entry })
    }
    return index
  })

  // One compiled test per filter, rebuilt when the filters or data change. Numeric filters
  // read the column's parsed numbers by row index, so a search keystroke re-parses no cell.
  const nan_to_null = (num: number): number | null => (Number.isNaN(num) ? null : num)
  let filter_tests = $derived(
    active_filters.map(
      ({ key, filter }): ((row: Row & RowData, row_idx: number) => boolean) => {
        if (filter.kind !== `numeric`) {
          const test = compile_filter(filter, cell_readers)
          return (row) => test(row[key])
        }
        const parsed = parsed_columns.get(key)
        if (!parsed) throw new Error(`Numeric filter on ${key}, which no column reads`)
        const test = compile_filter(filter, { to_number: nan_to_null })
        return (_row, row_idx) => test(parsed.nums[row_idx])
      },
    ),
  )

  // Rows surviving the global query and every per-column filter, with their index in `data`
  let filtered_items = $derived.by(() => {
    const query = debounced_query.toLowerCase().trim()
    const [tests, fuzzy] = [filter_tests, search_config?.fuzzy]
    return search_index.filter(
      ({ row, row_idx, entry: { values, text } }) =>
        tests.every((test) => test(row, row_idx)) &&
        (!query ||
          values.some((val, val_idx) =>
            text_matches_query(
              val !== null && typeof val === `object`
                ? cell_text(val).toLowerCase()
                : (text[val_idx] ??= cell_text(val).toLowerCase()),
              query,
              fuzzy,
            ),
          )),
    )
  })
  let filtered_data = $derived(filtered_items.map(({ row }) => row))

  // === Sorting ===
  // `sort` holds column IDs; the row sort reads their data keys
  let sort_criteria = $derived(
    sort
      .filter(({ column }) => columns_by_id.has(column)) // skip entries for removed columns
      .map(({ column, dir }) => ({ column: key_of_id(column), dir })),
  )
  let sorted_data = $derived(
    sort_criteria.length === 0
      ? filtered_data
      : sort_table_rows(filtered_data, sort_criteria),
  )
  $effect(() => {
    visible_rows = sorted_data
  })

  function sort_rows(col: Column<Row>, event: MouseEvent | KeyboardEvent) {
    if (col.sortable === false) return
    const { id: column } = col
    // The first direction puts the better end on top; the user's pref wins over the config
    const first_dir = better_of(col) === `lower` ? `asc` : `desc`
    // Shift-click adds this column as the last sort key, or removes it
    if (event.shiftKey) {
      sort = sort.some((entry) => entry.column === column)
        ? sort.filter((entry) => entry.column !== column)
        : [...sort, { column, dir: first_dir }]
      return
    }
    // A plain click cycles a column's sole sort: first direction, flipped, then cleared back
    // to the data's order (whatever the initial sort was). Any other sort gives way to it.
    const [only] = sort.length === 1 ? sort : []
    if (only?.column !== column) sort = [{ column, dir: first_dir }]
    else if (only.dir === first_dir)
      sort = [{ column, dir: first_dir === `asc` ? `desc` : `asc` }]
    else sort = []
  }

  // Header click, or Enter/Space while it has focus, sorts — unless a drag is in progress,
  // whose release would otherwise register as a click
  function activate_header(event: MouseEvent | KeyboardEvent, col: Column<Row>) {
    if (drag_col_id) return
    if (event instanceof KeyboardEvent) {
      if (event.key !== `Enter` && event.key !== ` `) return
      event.preventDefault()
    }
    sort_rows(col, event)
  }

  // Sort arrow for an actively sorted column, plus its 1-based place under multi-sort
  const sort_indicator = (
    col_id: string,
  ): { ascending: boolean; rank: number | null } | null => {
    const idx = sort.findIndex((entry) => entry.column === col_id)
    return idx === -1
      ? null
      : { ascending: sort[idx].dir === `asc`, rank: sort.length > 1 ? idx + 1 : null }
  }

  // === Pagination and row virtualisation ===
  // Writable; resets to 1 when row count, query or sort change (clamped below). Not keyed on
  // sorted_data: a same-length live-data refresh must not bounce the user to page 1.
  let row_count = $derived(sorted_data.length)
  let current_page = $derived.by(() => {
    void [row_count, debounced_query, sort]
    return 1
  })
  let total_pages = $derived(Math.max(1, Math.ceil(sorted_data.length / page_size)))
  let page = $derived(Math.min(current_page, total_pages))
  // The size picker stays while some size (or the current one) splits the rows, so picking a
  // size that fits them all can be undone; once every size fits, no pick would change anything.
  // The current size is always an option: else the select showed a size the table didn't use.
  let page_sizes = $derived.by(() => {
    const sizes = pagination_config?.page_sizes
    if (!sizes || sorted_data.length <= Math.min(page_size, ...sizes)) return null
    return sizes.includes(page_size)
      ? sizes
      : [...sizes, page_size].toSorted((size_a, size_b) => size_a - size_b)
  })

  let scroll_el = $state<HTMLDivElement>()
  let scroll_top = $state(0)
  let viewport_height = $state(0)
  let avg_row_height = $state(33) // refined from rendered rows after mount
  let row_height_measured = $state(false)
  // Destructured into primitives, so scroll events inside one row keep virtual_range, and with
  // it the rendered rows, as they are
  let { start: virtual_start, end: virtual_end } = $derived(
    virtual_config
      ? virtual_window({
          scroll: scroll_top,
          viewport: viewport_height,
          item_size: avg_row_height,
          count: row_count,
          ...virtual_config,
        })
      : { start: 0, end: row_count },
  )
  let virtual_range = $derived({ start: virtual_start, end: virtual_end })

  // Scroll events only read offsets; clientHeight can force layout, so only measure on request
  const sync_viewport = (measure_size = false) => {
    if (!scroll_el || !virtual_config) return
    scroll_top = scroll_el.scrollTop
    if (measure_size) viewport_height = scroll_el.clientHeight
  }

  // Measured once, then only on width or density change: re-measuring on every append forces
  // layout and makes heterogeneous rows jump under a fixed scrollTop.
  const measure_row_height = (): boolean => {
    if (!scroll_el) return false
    const rows = scroll_el.querySelectorAll<HTMLTableRowElement>(
      `tbody tr:not(.virtual-spacer):not(.empty-row)`,
    )
    let height_sum = 0
    for (const row of rows) height_sum += row.offsetHeight
    const measured = rows.length ? height_sum / rows.length : 0
    if (measured <= 0) return false
    if (Math.abs(measured - untrack(() => avg_row_height)) > 0.5)
      avg_row_height = clamp(measured, 8, 400)
    return true
  }
  // Measures once rows exist, and again under a new density preset
  let measured_density: string | null = null
  $effect(() => {
    if (!virtual_config || !scroll_el || sorted_data.length === 0) return
    if (row_height_measured && density === measured_density) return
    measured_density = density
    row_height_measured = measure_row_height()
    sync_viewport(true)
  })
  // Track scroll-container resizes (e.g. dashboard card resizing)
  $effect(() => {
    if (!virtual_config || !scroll_el || typeof ResizeObserver === `undefined`) return
    let observed_width: number | undefined
    const observer = new ResizeObserver(([entry]) => {
      const next_width = entry?.contentRect.width
      const width_changed = observed_width !== undefined && next_width !== observed_width
      observed_width = next_width
      sync_viewport(true)
      // Retry directly when the previous attempt had no layout box: writing false over false
      // would not re-trigger the measuring effect when a hidden table becomes visible
      if (width_changed || !row_height_measured)
        row_height_measured = measure_row_height()
    })
    observer.observe(scroll_el)
    return () => observer.disconnect()
  })
  // A new query or filter scrolls to the top, else an old scroll_top lands past the matches.
  // Seeded so the first run isn't mistaken for a filter change.
  let prev_narrowing: unknown[] = untrack(() => [debounced_query, active_filters])
  $effect(() => {
    const narrowing = [debounced_query, active_filters]
    const narrowed = narrowing.some((part, idx) => part !== prev_narrowing[idx])
    prev_narrowing = narrowing
    if (!narrowed || !virtual_config || !scroll_el) return
    scroll_el.scrollTop = 0
    sync_viewport()
  })

  // Window of sorted_data rendered in the DOM (one page, or the virtual window). `start` is
  // the absolute index of the first rendered row (row numbering, cell-selection coordinates).
  let display_range = $derived.by(() => {
    if (!pagination_config) return virtual_range
    const start = (page - 1) * page_size
    return { start, end: Math.min(sorted_data.length, start + page_size) }
  })
  let display_rows = $derived(sorted_data.slice(display_range.start, display_range.end))
  // Both zero without virtualization, where virtual_range spans every row
  let spacer_top = $derived(virtual_range.start * avg_row_height)
  let spacer_bottom = $derived((sorted_data.length - virtual_range.end) * avg_row_height)

  // === Column statistics and colors ===
  // One numeric pass per visible column, shared by color scales, summary row, best-cell
  // highlighting and data bars, carrying its resolved color domain. Quantiles only on request.
  let needs_median = $derived(summary_stats.includes(`median`))
  let column_stats = $derived.by(() => {
    const stats = new Map<string, ColumnStats & { domain: [number, number] }>()
    const groups = new Map<string, [number, number]>()
    for (const col of visible_columns) {
      const parsed = parsed_columns.get(cell_key(col))
      if (!parsed?.any_numeric) continue
      const { nums } = parsed
      const col_stats = compute_column_stats(
        filtered_items.map(({ row_idx }) => nums[row_idx]),
        needs_median || col.normalize === `quantile`,
      )
      if (!col_stats) continue
      let domain = resolve_domain(col_stats, col.normalize)
      const group = col.domain_group
      const shared_domain = group && groups.get(group)
      if (shared_domain) {
        // Earlier columns retain this tuple, so widening it updates the whole group.
        shared_domain[0] = Math.min(shared_domain[0], domain[0])
        shared_domain[1] = Math.max(shared_domain[1], domain[1])
        domain = shared_domain
      } else if (group) groups.set(group, domain)
      stats.set(col.id, { ...col_stats, domain })
    }
    return stats
  })

  // === Pinned columns ===
  // A user pin (column_prefs) wins over the column config
  const pin_of = (col: Column<Row>): PinSide | null => {
    const pref = prefs_of(col.id).pinned
    return pref === undefined ? (col.pin ?? null) : pref
  }
  // Offset the second sticky header row by the first row's height
  let group_header_height = $state(0)
  // Pinned columns stack from their edge, so each must clear the measured widths of the ones
  // before it on that side. Headers report their width through this attachment.
  let pinned_widths = $state<Record<string, number>>({})
  const track_pinned_width = (header_cell: HTMLElement) => {
    const col_id = header_cell.dataset.colId ?? ``
    const measure = () => (pinned_widths[col_id] = header_cell.offsetWidth)
    measure()
    if (typeof ResizeObserver === `undefined`) return
    const observer = new ResizeObserver(measure)
    observer.observe(header_cell)
    return () => observer.disconnect()
  }
  let pin_offsets = $derived.by(() => {
    const offsets: Record<string, { side: PinSide; offset: number }> = {}
    for (const side of [`left`, `right`] as const) {
      const pinned = visible_columns.filter((col) => pin_of(col) === side)
      let offset = 0
      for (const col of side === `left` ? pinned : pinned.toReversed()) {
        offsets[col.id] = { side, offset }
        offset += pinned_widths[col.id] ?? 0
      }
    }
    return offsets
  })

  // === Column view model ===
  // Per-column cell inputs, resolved once per column rather than per cell (a 60x30 window is
  // 1800 cells). Views are cached by column id and survive data updates; every field is its
  // own derived signal, so a cell re-runs only when a field it reads changes value. New data
  // rebuilds column_stats, but a column keeps its color stats, and with them its color
  // function and bar domain, while they are equal: an edit that moves no range repaints one
  // cell, with no caching needed in the host's column_color.
  // (Fields are $derived.by closures: they read `col`, which the constructor assigns.)
  type ColorFn = (num: number | null) => CellColor
  class ColumnView {
    col: Column<Row>
    id: string
    constructor(col: Column<Row>) {
      this.col = col
      this.id = col.id
    }
    key = $derived.by(() => cell_key(this.col))
    bar = $derived.by(() => this.col.render_as === `bar` || this.col.render_as === `both`)
    numeric = $derived.by(() => numeric_columns.has(this.id))
    width = $derived.by(() => prefs_of(this.id).width)
    // Every cell of the column carries these, from group header to summary row
    pin = $derived.by(() => pin_offsets[this.id])
    pin_class = $derived.by(() => this.pin && [`pinned`, `pinned-${this.pin.side}`])
    pin_style = $derived.by(() => this.pin && `${this.pin.side}: ${this.pin.offset}px`)
    #size = (edge: `min-width` | `max-width`) =>
      this.width ? `width: ${this.width}px; ${edge}: ${this.width}px` : undefined
    head_style = $derived.by(() =>
      join_styles(this.col.style, this.#size(`min-width`), this.pin_style),
    )
    cell_style = $derived.by(() =>
      join_styles(
        this.col.cell_style ?? this.col.style,
        this.#size(`max-width`),
        this.pin_style,
      ),
    )
    dt_kind = $derived.by(() => datetime_column_kinds.get(this.id))
    dt_options = $derived.by(() => this.dt_kind && DATETIME_MODES_BY_KIND[this.dt_kind])
    dt_mode = $derived.by((): DateTimeFormatMode | null => {
      if (!this.dt_kind || !this.dt_options) return null
      const selected =
        prefs_of(this.id).datetime_format ?? this.col.datetime_format ?? this.dt_kind
      return this.dt_options.includes(selected) ? selected : this.dt_options[0]
    })
    better = $derived.by(() => better_of(this.col))
    // A new object on every data update: cells read the narrower fields below instead
    stats = $derived.by(() => column_stats.get(this.id))
    best = $derived.by(() =>
      this.col.highlight_best && this.stats && this.better
        ? this.stats[this.better === `lower` ? `min` : `max`]
        : null,
    )
    // Kept while its numbers are equal, so the derivations below re-run only on a change
    #color_stats: ColorStats | undefined
    color_stats = $derived.by(() => {
      const [prev, stats] = [this.#color_stats, this.stats]
      if (!stats) return (this.#color_stats = undefined)
      const { min, max, min_positive, domain } = stats
      const same =
        prev &&
        same_parts(
          [min, max, min_positive, ...domain],
          [prev.min, prev.max, prev.min_positive, ...prev.domain],
        )
      // a copy of the domain: a domain_group shares (and widens) one tuple
      if (!same) this.#color_stats = { min, max, min_positive, domain: [...domain] }
      return this.#color_stats
    })
    domain = $derived.by(() => this.color_stats?.domain)
    // Undefined when the host paints nothing here (or the column holds no number)
    color = $derived.by((): ColorFn | undefined =>
      this.color_stats ? column_color?.(this.col, this.color_stats) : undefined,
    )
  }
  // One view per visible column, reused while its definition object is unchanged
  let view_cache = new Map<string, ColumnView>()
  let cols = $derived.by(() => {
    const views = visible_columns.map((col) => {
      const cached = view_cache.get(col.id)
      return cached?.col === col ? cached : new ColumnView(col)
    })
    view_cache = new Map(views.map((view) => [view.id, view]))
    return views
  })

  // Fraction of the column's domain a value fills, for in-cell data bars. Clamped so a
  // quantile-clipped domain saturates instead of overflowing the cell.
  const bar_fraction = (num: number | null, view: ColumnView): number | null => {
    if (num === null || !view.domain) return null
    const [lower, upper] = view.domain
    const frac = upper === lower ? 1 : (num - lower) / (upper - lower)
    // `lower is better` puts the best value at the full end, matching the color scale
    const oriented = view.better === `lower` ? 1 - frac : frac
    return clamp(oriented, 0, 1)
  }

  // === Column drag reorder (within a group, so group headers stay contiguous) ===
  let drag_col_id = $state<string | null>(null)
  let drag_over_col_id = $state<string | null>(null)
  const drag_col_group = () =>
    ordered_columns.find((col) => col.id === drag_col_id)?.group
  // Which side of the hovered header the dragged column would land on
  const drag_side = (target_col_id: string): `left` | `right` | null => {
    if (drag_over_col_id !== target_col_id || !drag_col_id) return null
    const drag_idx = column_order.indexOf(drag_col_id)
    const target_idx = column_order.indexOf(target_col_id)
    if (drag_idx === -1 || target_idx === -1) return null
    return drag_idx < target_idx ? `right` : `left`
  }
  const reset_drag_state = () => {
    drag_col_id = null
    drag_over_col_id = null
  }
  function handle_drag_start(event: DragEvent, col_id: string) {
    if (!event.dataTransfer) return
    drag_col_id = col_id
    event.dataTransfer.effectAllowed = `move`
    event.dataTransfer.setData(`text/html`, ``)
  }
  function handle_drag_over(event: DragEvent, col: Column<Row>) {
    event.preventDefault()
    if (!event.dataTransfer) return
    const same_group = drag_col_group() === col.group
    event.dataTransfer.dropEffect = same_group ? `move` : `none`
    drag_over_col_id = same_group ? col.id : null
  }
  function handle_drop(event: DragEvent, target_col: Column<Row>) {
    event.preventDefault()
    if (drag_col_id && drag_col_group() === target_col.group)
      move_column_to(drag_col_id, target_col.id)
    reset_drag_state()
  }
  // Remove `col_id` from column_order and reinsert it at `target_id`'s position
  function move_column_to(col_id: string, target_id: string) {
    const from = column_order.indexOf(col_id)
    const target = column_order.indexOf(target_id)
    if (from === -1 || target === -1 || from === target) return
    const next = [...column_order]
    next.splice(from, 1)
    next.splice(target, 0, col_id)
    column_order = next
  }
  // Shift a column one step left/right within its group (keyboard counterpart of dragging)
  function move_column(col: Column<Row> | undefined, step: number) {
    if (!col) return
    const neighbour = visible_columns[visible_columns.indexOf(col) + step]
    if (neighbour && neighbour.group === col.group) move_column_to(col.id, neighbour.id)
  }

  // === Cell range selection, keyboard navigation and copy ===
  const selection = new CellSelection()
  // Roving tabindex anchor: exactly one cell is tabbable, and arrow keys move it
  let active_cell = $state({ row: 0, col: 0 })
  // Stale (row, col) coordinates must not survive a change of the row set or column layout.
  // Not the page or virtual window: coordinates are absolute, so scrolling/paging keeps them.
  // Rows are compared by id under row_key, else by object, so a live refresh that keeps
  // every row in place (fresh values, same ids and order) keeps the selection.
  let prev_row_identities: unknown[] = []
  let row_identities = $derived.by(() => {
    const next = sorted_data.map((row) => (row_key === undefined ? row : get_row_id(row)))
    if (same_parts(next, prev_row_identities)) return prev_row_identities
    return (prev_row_identities = next)
  })
  $effect(() => {
    void row_identities
    void visible_columns
    untrack(() => selection.clear()) // untracked: clear() reads the selection
  })

  // active_cell clamped to rendered cells, else an off-page anchor would leave every cell at
  // tabindex=-1 and drop the table out of the tab order.
  let tab_stop = $derived.by(() => {
    if (display_rows.length === 0 || visible_columns.length === 0)
      return { row: -1, col: -1 }
    const first_row = display_range.start
    return {
      row: clamp(active_cell.row, first_row, first_row + display_rows.length - 1),
      col: Math.min(active_cell.col, visible_columns.length - 1),
    }
  })
  // Cells read numbers, not tab_stop: that is a new object each time the rows change
  const tab_row = $derived(tab_stop.row)
  const tab_col = $derived(tab_stop.col)

  const is_interactive_cell_target = (target: EventTarget | null): boolean =>
    target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR))

  // Body events are delegated to <tbody>; cells and rows carry their absolute index. Only
  // this table's own rows/cells count (a nested DataTable has the same attributes). tbody
  // comes from currentTarget since bind:this resolves late, after a keydown right at mount.
  type BodyEvent = Event & { currentTarget: HTMLTableSectionElement }
  const cell_in = (target: EventTarget | null, tbody: Element): CellPos | null => {
    let cell_el =
      target instanceof Element ? target.closest<HTMLElement>(`td[data-row-idx]`) : null
    while (cell_el && cell_el.parentElement?.parentElement !== tbody) {
      cell_el = cell_el.parentElement?.closest<HTMLElement>(`td[data-row-idx]`) ?? null
    }
    if (!cell_el) return null
    return { row: Number(cell_el.dataset.rowIdx), col: Number(cell_el.dataset.colIdx) }
  }
  const cell_under = (event: BodyEvent) => cell_in(event.target, event.currentTarget)
  const row_under = ({ target, currentTarget: tbody }: BodyEvent): number | null => {
    let row_el =
      target instanceof Element ? target.closest<HTMLElement>(`tr[data-row-idx]`) : null
    while (row_el && row_el.parentElement !== tbody) {
      row_el = row_el.parentElement?.closest<HTMLElement>(`tr[data-row-idx]`) ?? null
    }
    return row_el ? Number(row_el.dataset.rowIdx) : null
  }
  // Direct children only, for the same reason. These run after a tick, once bind:this is set.
  let tbody_el = $state<HTMLTableSectionElement>()
  const own_row_el = (row: number) =>
    tbody_el?.querySelector<HTMLElement>(`:scope > tr[data-row-idx="${row}"]`)
  const own_cell_el = (row: number, col: number) =>
    own_row_el(row)?.querySelector<HTMLElement>(`:scope > td[data-col-idx="${col}"]`)
  // Spacer and empty rows carry no index, so row actions skip them. So do clicks on a
  // control in a cell: a row-select checkbox toggles its row itself, and a toggling row
  // action would undo it.
  const row_handler =
    (action: (event: MouseEvent, row: Row) => void) =>
    (event: MouseEvent & BodyEvent) => {
      const row = row_under(event)
      if (row !== null && !is_interactive_cell_target(event.target))
        action(event, sorted_data[row])
    }

  // The row under the pointer, re-reported when the rows under a still pointer change (an
  // index into sorted_data) and cleared on unmount, so a linked highlight never goes stale
  let hovered_row: number | null = null
  let hovered_row_data: Row | null = null
  const report_hover = (row: number | null) => {
    hovered_row = row
    const row_data = row === null ? null : (sorted_data[row] ?? null)
    if (row_data === hovered_row_data) return
    hovered_row_data = row_data
    on_row_hover?.(row_data)
  }
  const handle_body_pointerover = (event: PointerEvent & BodyEvent) => {
    const row = row_under(event)
    if (row !== hovered_row) report_hover(row)
  }
  const handle_body_pointerleave = () => {
    if (hovered_row !== null) report_hover(null)
  }
  $effect(() => {
    void sorted_data
    untrack(() => {
      if (hovered_row !== null) report_hover(hovered_row)
    })
  })
  $effect(() => () => {
    if (hovered_row_data !== null) on_row_hover?.(null)
  })
  // Tracked so a re-sort or new data that moves the named row scrolls to its new place
  const highlighted_row_idx = $derived(
    highlighted_row_id === null
      ? -1
      : sorted_data.findIndex((row) => get_row_id(row) === highlighted_row_id),
  )
  // Scrolls only the table's own scroller (never the page) to a row named from outside; a row
  // under the pointer named itself and stays put
  $effect(() => {
    const [target, row_idx, scroller] = [
      highlighted_row_id,
      highlighted_row_idx,
      scroll_el,
    ]
    if (row_idx === -1 || !scroller) return
    untrack(() => {
      if (hovered_row_data && get_row_id(hovered_row_data) === target) return
      const row_el = own_row_el(row_idx)
      if (!row_el) {
        if (virtual_config)
          scroller.scrollTop = row_idx * avg_row_height - scroller.clientHeight / 2
        return
      }
      const view = scroller.getBoundingClientRect()
      const head = scroller.querySelector(`thead`)?.getBoundingClientRect().height ?? 0
      const { top, bottom } = row_el.getBoundingClientRect()
      if (top < view.top + head) scroller.scrollTop -= view.top + head - top
      else if (bottom > view.bottom) scroller.scrollTop += bottom - view.bottom
    })
  })

  function handle_body_focusin(event: FocusEvent & BodyEvent) {
    // One of this table's own cells, not a link or nested table inside it: that focus leaves
    // the tab stop where it was
    const target = event.target
    if (!keyboard_cells || !(target instanceof Element)) return
    if (target.parentElement?.parentElement !== event.currentTarget) return
    const pos = cell_under(event)
    if (pos) active_cell = pos
  }
  function handle_body_contextmenu(event: MouseEvent & BodyEvent) {
    const pos = cell_under(event)
    // keep the native context menu for links/buttons/inputs inside cells
    if (pos && !is_interactive_cell_target(event.target))
      open_column_context_menu(event, cols[pos.col].id)
  }
  // Drag-select cells and copy them as TSV. Attached to the whole container, so presses on
  // the controls and context menu keep the selection; a press outside clears it. Cells out of
  // range read as undefined, which to_tsv skips.
  const selected_cell_text = (row: number, col: number) => {
    const [row_data, view] = [sorted_data[row], cols[col]]
    return row_data && view ? cell_text(row_data[view.key]) : undefined
  }
  const cell_selection = cell_range_select(selection, {
    cell_at: (target) => (tbody_el ? cell_in(target, tbody_el) : null),
    cell_text: selected_cell_text,
  })
  const copy_selected_cells = () =>
    void navigator.clipboard?.writeText(selection.to_tsv(selected_cell_text))
  // Every sorted+filtered value of one column (all pages), one per line
  const copy_column_values = (col_id: string) =>
    void navigator.clipboard?.writeText(
      sorted_data.map((row) => tsv_cell(cell_text(row[key_of_id(col_id)]))).join(`\n`),
    )

  // Arrow keys walk the active cell, Shift+arrow grows the selection rectangle from it,
  // Alt+Left/Right moves the whole column. Returns whether the key was consumed.
  const ARROW_DELTAS: Record<string, [row: number, col: number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }
  function handle_cell_keydown(event: KeyboardEvent, { row, col }: CellPos): boolean {
    const delta = ARROW_DELTAS[event.key]
    if (!delta || is_interactive_cell_target(event.target)) return false
    const [row_step, col_step] = delta
    // Alt+Up/Down means nothing here; leave it to the browser rather than swallowing it
    if (event.altKey && col_step === 0) return false
    event.preventDefault()
    if (event.altKey) {
      move_column(visible_columns[col], col_step)
      return true
    }
    const target = {
      row: clamp(row + row_step, 0, sorted_data.length - 1),
      col: clamp(col + col_step, 0, visible_columns.length - 1),
    }
    selection.step({ row, col }, target, event.shiftKey)
    focus_cell(target.row, target.col)
    return true
  }

  // Page to a row, or scroll a row outside the virtual window into it, so it exists to
  // receive focus. `align_bottom` puts the row at the bottom edge, keeping it visible when
  // travelling downwards.
  function reveal_row(row: number, align_bottom = false) {
    if (pagination_config) current_page = Math.floor(row / page_size) + 1
    if (!virtual_config || !scroll_el) return
    if (row >= virtual_range.start && row < virtual_range.end) return
    const leading_edge = align_bottom ? Math.max(0, viewport_height - avg_row_height) : 0
    scroll_el.scrollTop = Math.max(0, row * avg_row_height - leading_edge)
    sync_viewport()
  }

  // Move focus to a cell by absolute coordinates, paging/scrolling it into view first
  function focus_cell(row: number, col: number) {
    reveal_row(row)
    active_cell = { row, col }
    // The row may not be rendered yet (page flip or virtual window), so wait a tick
    void tick().then(() => own_cell_el(row, col)?.focus())
  }

  // Cell navigation first, then row keys: Enter/Space activate, Up/Down step by absolute
  // index (not DOM sibling: under virtualization the next sibling may be a spacer).
  async function handle_body_keydown(event: KeyboardEvent & BodyEvent) {
    const pos = cell_under(event)
    if (keyboard_cells && pos && handle_cell_keydown(event, pos)) return
    const abs_idx =
      on_row_click && !is_interactive_cell_target(event.target) ? row_under(event) : null
    if (abs_idx === null) return
    if (!event.defaultPrevented && (event.key === `Enter` || event.key === ` `)) {
      event.preventDefault()
      on_row_click?.(event, sorted_data[abs_idx])
      return
    }
    if (event.key !== `ArrowDown` && event.key !== `ArrowUp`) return
    event.preventDefault()
    const step = event.key === `ArrowDown` ? 1 : -1
    const target_idx = abs_idx + step
    if (target_idx < 0 || target_idx >= sorted_data.length) return
    reveal_row(target_idx, step > 0)
    await tick()
    own_row_el(target_idx)?.focus()
  }

  // === Context menu (right-click on a header or cell) ===
  let context_menu_col = $state<string | null>(null)
  let context_menu_at = $state<{ x: number; y: number } | null>(null)
  function open_column_context_menu(event: MouseEvent, col_id: string) {
    event.preventDefault()
    event.stopPropagation()
    context_menu_col = col_id
    context_menu_at = { x: event.clientX, y: event.clientY }
  }
  let context_menu_column = $derived(columns_by_id.get(context_menu_col ?? ``))
  // A radio section over one pref; re-picking the current option sets `cleared` (undefined
  // drops the pref, so all radios read unchecked; a null pin overrides a config pin)
  const pref_section = <Key extends `better` | `pinned`>(
    col_id: string,
    title: string,
    key: Key,
    current: ColumnPrefs[Key],
    cleared: ColumnPrefs[Key],
    options: [NonNullable<ColumnPrefs[Key]>, string][],
  ): CmdSection<CmdAction> => ({
    title,
    selected: current ?? ``,
    actions: options.map(([id, label]) => ({
      id,
      label,
      action: () => set_pref(col_id, key, current === id ? cleared : id),
    })),
  })
  let context_menu_actions = $derived([
    {
      title: `Copy`,
      actions: [
        {
          id: `copy_column`,
          label: `Copy column (${sorted_data.length} values)`,
          action: () => context_menu_col && copy_column_values(context_menu_col),
        },
        ...(selection.size > 0
          ? [
              {
                id: `copy_selection`,
                label: `Copy selection (${selection.size} cells)`,
                action: copy_selected_cells,
              },
            ]
          : []),
      ],
    },
    ...(context_menu_column ? column_menu_sections(context_menu_column) : []),
  ])
  function column_menu_sections(col: Column<Row>): CmdSection[] {
    const sections: CmdSection[] = []
    // Better direction only means something for columns holding numbers. Checked over
    // unfiltered data so the toggle doesn't vanish mid-search, and mixed-in "N/A" counts.
    if (allow_better_toggle && parsed_columns.get(cell_key(col))?.any_numeric) {
      sections.push(
        pref_section(
          col.id,
          `Better direction`,
          `better`,
          prefs_of(col.id).better,
          undefined,
          [
            [`higher`, `▲ Higher is better`],
            [`lower`, `▼ Lower is better`],
          ],
        ),
      )
    }
    if (allow_pinning) {
      sections.push(
        pref_section(col.id, `Pin column`, `pinned`, pin_of(col), null, [
          [`left`, `Pin left`],
          [`right`, `Pin right`],
        ]),
      )
    }
    return [...sections, ...(menu_sections?.(col) ?? [])]
  }

  // === Row selection ===
  function get_row_id(row: Row): RowId {
    const identifier =
      typeof row_key === `function`
        ? row_key(row)
        : row_key !== undefined
          ? row[row_key]
          : undefined
    if (
      typeof identifier !== `string` &&
      (typeof identifier !== `number` || !Number.isFinite(identifier))
    ) {
      throw new TypeError(
        `row_key must return a string or finite number; received ${String(identifier)}`,
      )
    }
    return identifier
  }
  // A boolean, so linked hovers that move highlighted_row_id between rows skip the O(n) pass
  let needs_row_ids = $derived(
    show_row_select || highlighted_row_id !== null || row_key !== undefined,
  )
  $effect(() => {
    if (!needs_row_ids) return
    if (row_key === undefined)
      throw new Error(`row_key is required with show_row_select or highlighted_row_id`)
    const ids = new Set<RowId>()
    for (const row of data) {
      const identifier = get_row_id(row)
      if (ids.has(identifier)) throw new Error(`Duplicate row id: ${identifier}`)
      ids.add(identifier)
    }
  })
  // Rows render keyed by id, else by object identity, else (one object listed twice, a
  // duplicate key that crashed the each block) by position
  let has_repeated_rows = $derived(
    row_key === undefined && new Set(data).size < data.length,
  )
  const row_each_key = (row: Row, abs_idx: number): unknown =>
    row_key !== undefined ? get_row_id(row) : has_repeated_rows ? abs_idx : row
  let selected_id_set = $derived(new Set(selected_ids))
  const is_row_selected = (row: Row): boolean => selected_id_set.has(get_row_id(row))
  // Outside row_attrs: a linked hover moving between rows re-applies no row's attributes
  const is_highlighted = (row: Row & RowData): boolean =>
    highlighted_row_id !== null && get_row_id(row) === highlighted_row_id
  // Shared by the animated and static row loops
  const row_attrs = (row: Row & RowData, abs_idx: number) => ({
    style: row.style,
    class: [row.class, { selected: show_row_select && is_row_selected(row) }],
    'data-row-idx': abs_idx,
    tabindex: on_row_click ? 0 : undefined,
  })
  function toggle_row_select(row: Row) {
    const row_id = get_row_id(row)
    selected_ids = selected_id_set.has(row_id)
      ? selected_ids.filter((identifier) => identifier !== row_id)
      : [...selected_ids, row_id]
  }
  // Select-all scope: the current page under pagination, every sorted+filtered row otherwise
  // (the virtual window is a rendering detail)
  let select_all_rows = $derived(pagination_config ? display_rows : sorted_data)
  let all_page_selected = $derived(
    show_row_select &&
      select_all_rows.length > 0 &&
      select_all_rows.every(is_row_selected),
  )
  function toggle_select_all() {
    if (all_page_selected) {
      const scope_ids = new Set(select_all_rows.map(get_row_id))
      selected_ids = selected_ids.filter((identifier) => !scope_ids.has(identifier))
    } else
      selected_ids = [
        ...selected_ids,
        ...select_all_rows.filter((row) => !is_row_selected(row)).map(get_row_id),
      ]
  }

  // === Export ===
  // Selected rows when any are selected (including ones the search or filters hide), else
  // all sorted+filtered rows. Either way in the table's current sort order.
  let export_rows = $derived.by(() => {
    if (!show_row_select || selected_ids.length === 0) return sorted_data
    const selected = data.filter(is_row_selected)
    return sort_criteria.length > 0 ? sort_table_rows(selected, sort_criteria) : selected
  })
  // Visible cells as plain text: the single extraction every exporter builds on
  const table_matrix = (): TableMatrix => ({
    headers: cols.map((view) => html_to_text(view.col.label)),
    rows: export_rows.map((row) => cols.map((view) => cell_text(row[view.key]))),
    numeric: cols.map((view) => view.numeric),
  })
  // CSV/TSV/Markdown/LaTeX share the text matrix; JSON keeps raw values under stable column ids
  const export_sources: Record<TableExportFormat, () => string> = {
    csv: () => table_to_text(table_matrix(), `csv`),
    tsv: () => table_to_text(table_matrix(), `tsv`),
    json: () =>
      table_to_json(
        export_rows,
        cols.map((view) => ({ id: view.col.id, key: view.key })),
        // numbers, dates and nested values are kept; string cells lose their markup
        (val) => (typeof val === `string` ? html_to_text(val) : val),
      ),
    md: () => table_to_text(table_matrix(), `md`),
    tex: () => table_to_text(table_matrix(), `tex`),
  }
  const EXPORT_FILES: Record<TableExportFormat, { mime: string; label: string }> = {
    csv: { mime: `text/csv`, label: `CSV` },
    tsv: { mime: `text/tab-separated-values`, label: `TSV (copy)` },
    json: { mime: `application/json`, label: `JSON` },
    md: { mime: `text/markdown`, label: `Markdown` },
    tex: { mime: `application/x-tex`, label: `LaTeX` },
  }
  // TSV pastes into spreadsheet columns, so it goes to the clipboard; the rest download
  const export_actions = $derived<CmdAction[]>(
    export_formats.map((format) => ({
      id: format,
      label: EXPORT_FILES[format].label,
      action: () => {
        const text = export_sources[format]()
        if (format === `tsv`) void navigator.clipboard?.writeText(text)
        else download(text, `${export_filename}.${format}`, EXPORT_FILES[format].mime)
        on_export?.({ format, text })
      },
    })),
  )

  // === Column picker ===
  // Keep the bindable `hidden_columns` list authoritative while ColumnPicker edits a projection.
  // `visible: false` columns are the picker's Reset baseline.
  function set_column_visible(col_id: string, visible: boolean) {
    const others = [...hidden_ids].filter((identifier) => identifier !== col_id)
    hidden_columns = visible ? others : [...others, col_id]
  }
  let toggle_columns = $derived(
    ordered_columns.map((col) => ({
      ...col,
      default_visible: col.visible !== false,
      visible: !hidden_ids.has(col.id),
    })),
  )

  // === Column resize ===
  // The handle captures the pointer, so moves and the release reach it even once the cursor
  // has left the header, and there are no document listeners to unregister.
  let resize = $state<{ col_id: string; start_x: number; start_width: number } | null>(
    null,
  )
  // A column's resize bounds, its own or the default 50-500 px
  const width_bounds = (col?: Column<Row>): [number, number] => [
    col?.min_width ?? 50,
    col?.max_width ?? 500,
  ]
  const clamp_width = (col_id: string, width: number): number =>
    clamp(width, ...width_bounds(columns_by_id.get(col_id)))
  function start_resize(
    event: PointerEvent & { currentTarget: HTMLElement },
    col_id: string,
  ) {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const start_width = handle.parentElement?.offsetWidth ?? 100
    resize = { col_id, start_x: event.clientX, start_width }
  }
  function resize_to(event: PointerEvent) {
    if (!resize) return
    const width = resize.start_width + event.clientX - resize.start_x
    set_pref(resize.col_id, `width`, clamp_width(resize.col_id, width))
  }
  const end_resize = () => (resize = null)
  // Keyboard counterpart of the drag: arrows step the width 10 px. Enter/Space stop here too,
  // or the header would sort (and Space scroll); Escape and Cmd+C still reach the window.
  function key_resize(
    event: KeyboardEvent & { currentTarget: HTMLElement },
    col_id: string,
  ) {
    if (![`ArrowLeft`, `ArrowRight`, `Enter`, ` `].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.key === `ArrowRight` ? 10 : event.key === `ArrowLeft` ? -10 : 0
    if (!step) return
    const width = prefs_of(col_id).width ?? event.currentTarget.parentElement?.offsetWidth
    set_pref(col_id, `width`, clamp_width(col_id, (width ?? 100) + step))
  }
  // Fit the header and rendered cells, including clipped text. Measuring all virtualized
  // or paged rows would require laying out the whole dataset off-screen.
  function autofit_column(event: MouseEvent, col_id: string) {
    event.preventDefault()
    event.stopPropagation()
    const col_idx = cols.findIndex((view) => view.id === col_id)
    const cells = [
      ...(container_el?.querySelectorAll<HTMLElement>(
        `:scope > .table-scroll > table > thead th[data-col-id="${CSS.escape(col_id)}"]`,
      ) ?? []),
      ...(tbody_el?.querySelectorAll<HTMLElement>(
        `:scope > tr > td[data-col-idx="${col_idx}"]`,
      ) ?? []),
    ]
    const widest = Math.max(
      0,
      ...cells.map((element) => {
        let width = element.scrollWidth + element.offsetWidth - element.clientWidth
        const rich = element.querySelector(`.middle-ellipsis-html`)
        if (rich) {
          const text_width = [...rich.children].reduce(
            (sum, part) => sum + part.scrollWidth,
            0,
          )
          width = Math.max(width, text_width + element.offsetWidth - rich.clientWidth)
        }
        return width
      }),
    )
    if (widest > 0) set_pref(col_id, `width`, clamp_width(col_id, widest + 8))
  }

  // Delegation keeps tooltips across re-rendered cells. Skipped: data-no-tooltip controls (a
  // resize handle's would pop up mid-drag)
  const table_tooltips = tooltip({
    delegate: `[title], [aria-label]:not([data-no-tooltip]), [data-title]`,
  })
  let root_styles = $derived(join_styles(rest.style, root_style))
</script>

{#snippet column_label(label: string, description?: string)}
  {#if description}
    <Popover
      trigger_mode="hover"
      trap_focus={false}
      placement="top"
      onclick={stop_event}
      onkeydown={stop_event}
    >
      {#snippet trigger(trigger_props)}
        <button type="button" {...trigger_props} style="all: unset; cursor: help"
          >{@html render_html(label)}</button
        >
      {/snippet}
      {@html render_html(description)}
    </Popover>
  {:else}
    {@html render_html(label)}
  {/if}
{/snippet}

{#snippet icon_btn(icon: IconData, tip: string, on_click: () => void)}
  <button
    class="icon-btn"
    aria-label={tip}
    onclick={on_click}
    {@attach tooltip({ content: tip, placement: `top` })}
  >
    <Icon {icon} />
  </button>
{/snippet}

{#snippet plain_text(text: string)}
  {#if text.length > MIDDLE_ELLIPSIS_MIN_LENGTH}
    {@const [start, end] = middle_ellipsis_parts(text)}
    <span class="middle-ellipsis">
      <span class="middle-ellipsis-raw">{text}</span>
      <span
        class="middle-ellipsis-visual"
        data-start={start}
        data-end={end}
        aria-hidden="true"
      ></span>
    </span>
  {:else}
    {text}
  {/if}
{/snippet}

{#snippet sort_hint_element(pos: `top` | `bottom`)}
  {#if hint_config?.position === pos}
    <div
      class={[`sort-hint`, hint_config.class, { permanent: hint_config.permanent }]}
      style={hint_config.style}
    >
      {hint_config.text}
    </div>
  {/if}
{/snippet}

{#snippet virtual_spacer(height: number)}
  <!-- preserves scroll geometry for the unrendered rows above/below the window -->
  {#if height > 0}
    <tr class="virtual-spacer" aria-hidden="true" style:height="{height}px">
      <td colspan={body_colspan}></td>
    </tr>
  {/if}
{/snippet}

<div
  {@attach table_tooltips}
  {@attach cell_selection}
  {...rest}
  style={root_styles}
  bind:this={container_el}
  class={[`table-container`, rest.class, { 'cell-dragging': selection.dragging }]}
  data-density={density}
>
  {#if show_controls !== `never`}
    <section
      {...controls_props}
      class={[`control-buttons`, `${show_controls}-visible`, controls_props?.class]}
      class:force-visible={controls_active || columns_open || export_menu_open}
    >
      {#if search_config}
        {#if search_expanded || search_query}
          <input
            type="search"
            class="search-input"
            placeholder={search_config.placeholder}
            bind:value={search_query}
            onblur={() => {
              if (!search_query) search_expanded = false
            }}
          />
          {@render icon_btn(Cross, `Clear`, () => {
            search_query = ``
            search_expanded = false
          })}
        {:else}
          {@render icon_btn(SearchIcon, `Search`, () => (search_expanded = true))}
        {/if}
      {/if}

      {#if show_column_toggle}
        <!-- the column list and the export menu overlap, so opening one closes the other -->
        <ColumnPicker
          columns={toggle_columns}
          bind:open={
            () => columns_open,
            (open) => {
              columns_open = open
              if (open) export_menu_open = false
            }
          }
          search_text={(col) =>
            [col.id, col.key, html_to_text(col.label), col.description, col.group]
              .filter(Boolean)
              .join(` `)}
          on_toggle={(col, visible) => set_column_visible(col.id, visible)}
        >
          {#snippet trigger({ open })}
            <span
              class={['icon-btn', { active: open }]}
              {@attach tooltip({ content: `Columns`, placement: `top` })}
              ><Icon icon={Columns} /></span
            >
          {/snippet}
          {#snippet toggle_label({ column })}{@html render_html(column.label)}{/snippet}
          {#snippet description({ column })}
            {@html render_html(column.description ?? ``)}
          {/snippet}
        </ColumnPicker>
      {/if}

      {#if export_actions.length}
        <ActionMenu
          actions={export_actions}
          bind:open={
            () => export_menu_open,
            (open) => {
              export_menu_open = open
              if (open) columns_open = false
            }
          }
          placement="bottom"
          align="end"
        >
          {#snippet trigger(trigger_props)}
            <button
              type="button"
              class="icon-btn"
              aria-label="Export"
              {...trigger_props}
              {@attach tooltip({ content: `Export`, placement: `top` })}
            >
              <Icon icon={Download} />
            </button>
          {/snippet}
        </ActionMenu>
      {/if}

      {#if show_row_select && selected_ids.length > 0}
        <button
          class="icon-btn selection-badge"
          onclick={() => (selected_ids = [])}
          title="Clear {selected_ids.length} selected rows"
        >
          <span class="badge">{selected_ids.length}</span>
          <Icon icon={Cross} />
        </button>
      {/if}

      {@render controls?.({ sources: export_sources })}
    </section>
  {/if}

  {@render sort_hint_element(`top`)}

  <div
    class={['table-scroll', { 'has-scroll': scroll_style }]}
    style={scroll_style}
    bind:this={scroll_el}
    onscroll={virtual_config ? () => sync_viewport() : undefined}
  >
    <table
      class="data-table"
      style:--group-header-height="{has_group_header ? group_header_height : 0}px"
    >
      <thead>
        {#if has_group_header}
          <tr class="group-header" bind:clientHeight={group_header_height}>
            {#if show_row_select}<th class="select-col"></th>{/if}
            {#if show_row_numbers}<th class="row-num-col"></th>{/if}
            {#each cols as { col, id: identifier, pin_class, pin_style } (identifier)}
              {#if !col.group}
                <th class={pin_class} style={pin_style}></th>
                <!-- the group header renders once per group, on the group's first column -->
              {:else if visible_columns.find((one) => one.group === col.group) === col}
                <th
                  colspan={visible_columns.filter((one) => one.group === col.group)
                    .length}
                >
                  {@render column_label(col.group)}
                </th>
              {/if}
            {/each}
          </tr>
        {/if}
        <tr>
          {#if show_row_select}
            <th class="select-col">
              <input
                type="checkbox"
                aria-label={all_page_selected
                  ? `Deselect all`
                  : `Select all on this page`}
                data-no-tooltip
                checked={all_page_selected}
                onchange={toggle_select_all}
              />
            </th>
          {/if}
          {#if show_row_numbers}<th class="row-num-col">#</th>{/if}
          {#each cols as view (view.id)}
            {@const { col, id: col_id, dt_mode } = view}
            {@const sorted_by = sort_indicator(col_id)}
            {@const sortable = col.sortable !== false}
            <th
              data-col-id={col_id}
              tabindex={sortable ? 0 : undefined}
              role="columnheader"
              oncontextmenu={(event) => open_column_context_menu(event, col_id)}
              onclick={(event) => activate_header(event, col)}
              onkeydown={(event) => activate_header(event, col)}
              style={view.head_style}
              class={view.pin_class}
              class:numeric-col={view.numeric}
              class:not-sortable={!sortable}
              class:resizing={resize?.col_id === col_id}
              class:popover-open={header_popover?.col_id === col_id}
              data-drag-side={drag_side(col_id)}
              draggable="true"
              aria-dropeffect="move"
              aria-sort={sort[0]?.column === col_id
                ? sort[0].dir === `asc`
                  ? `ascending`
                  : `descending`
                : `none`}
              aria-grabbed={drag_col_id === col_id ? `true` : undefined}
              ondragstart={(event) => handle_drag_start(event, col_id)}
              ondragover={(event) => handle_drag_over(event, col)}
              ondragleave={() => (drag_over_col_id = null)}
              ondrop={(event) => handle_drop(event, col)}
              ondragend={reset_drag_state}
              {@attach view.pin ? track_pinned_width : undefined}
            >
              {@render column_label(col.label, col.description)}
              {#if sorted_by}
                <span style="font-size: 0.8em"
                  >{sorted_by.ascending ? `↓` : `↑`}{#if sorted_by.rank}<sup
                      >{sorted_by.rank}</sup
                    >{/if}</span
                >
              {/if}
              {#if show_filters && col.filter !== false}
                <ColumnFilter
                  class="header-popover"
                  column={html_to_text(col.label)}
                  values={() => data.map((row) => row[view.key])}
                  options={{
                    kind: col.filter || `auto`,
                    numeric: view.numeric,
                    ...cell_readers,
                  }}
                  bind:filter={
                    () => prefs_of(col_id).filter,
                    (filter) => set_pref(col_id, `filter`, filter)
                  }
                  bind:open={
                    () => popover_open(`filter`, col_id),
                    (open) => set_popover(`filter`, col_id, open)
                  }
                />
              {/if}
              {#if dt_mode}
                <DateTimeFormatMenu
                  col_label={col.label}
                  mode={dt_mode}
                  options={view.dt_options ?? []}
                  open={popover_open(`datetime`, col_id)}
                  on_toggle={() => toggle_popover(`datetime`, col_id)}
                  on_change={(mode) => set_pref(col_id, `datetime_format`, mode)}
                />
              {/if}
              <!-- focusable column resize handle (drag or arrow keys); its click must not sort -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
              <span
                class="resize-handle"
                onpointerdown={(event) => start_resize(event, col_id)}
                onpointermove={resize_to}
                onpointerup={end_resize}
                onlostpointercapture={end_resize}
                onclick={stop_event}
                onkeydown={(event) => key_resize(event, col_id)}
                ondblclick={(event) => autofit_column(event, col_id)}
                role="separator"
                tabindex="0"
                aria-label="Resize {html_to_text(col.label)} column"
                data-no-tooltip
                aria-orientation="vertical"
                aria-valuenow={view.width}
                aria-valuemin={width_bounds(col)[0]}
                aria-valuemax={width_bounds(col)[1]}
              ></span>
            </th>
          {/each}
        </tr>
      </thead>
      <!-- One listener set for every row and cell: pointer/keyboard/focus events identify their
           row and cell from the data-row-idx/data-col-idx they carry instead of a closure per cell -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions (delegated cell navigation and row actions) -->
      <tbody
        bind:this={tbody_el}
        onpointerover={on_row_hover ? handle_body_pointerover : undefined}
        onpointerleave={on_row_hover ? handle_body_pointerleave : undefined}
        onfocusin={handle_body_focusin}
        oncontextmenu={handle_body_contextmenu}
        onkeydown={keyboard_cells || on_row_click
          ? (event) => void handle_body_keydown(event)
          : undefined}
        onclick={on_row_click ? row_handler(on_row_click) : undefined}
        ondblclick={on_row_double_click ? row_handler(on_row_double_click) : undefined}
      >
        {@render virtual_spacer(spacer_top)}
        {#snippet row_cells(row: Row & RowData, abs_idx: number)}
          {#if show_row_select}
            <td class="select-col">
              <input
                type="checkbox"
                aria-label="Select row {abs_idx + 1}"
                data-no-tooltip
                checked={is_row_selected(row)}
                onchange={() => toggle_row_select(row)}
              />
            </td>
          {/if}
          {#if show_row_numbers}<td class="row-num-col">{abs_idx + 1}</td>{/if}
          {#each cols as view, col_idx (view.id)}
            {@const { col } = view}
            {@const val = row[view.key]}
            <!-- num is parsed lazily: only colors, bars and best-cell rings read it -->
            {@const num = parse_numeric_val(val)}
            {@const color = view.color ? view.color(num) : NULL_CELL_COLOR}
            {@const is_html = is_html_str(val)}
            {@const date_val = view.dt_mode
              ? format_datetime_cell(val, col, view.dt_mode)
              : null}
            <!-- a per-cell boolean: a moved tab stop re-runs two cells' attributes, not all -->
            {@const tab_stop_cell = tab_row === abs_idx && tab_col === col_idx}
            <td
              data-col={col.label}
              data-row-idx={abs_idx}
              data-col-idx={col_idx}
              class={view.pin_class}
              class:numeric-col={view.numeric}
              class:cell-selected={selection.has(abs_idx, col_idx)}
              class:best-cell={view.best !== null && num === view.best}
              tabindex={keyboard_cells ? (tab_stop_cell ? 0 : -1) : undefined}
              style:--cell-bg={col.render_as === `bar` ? null : color.bg}
              style:color={col.render_as === `bar` ? null : color.text}
              style={view.cell_style}
            >
              {#if view.bar}
                {@const fraction = bar_fraction(num, view)}
                {#if fraction !== null}
                  <!-- behind the cell text. With `both` the cell is already color.bg, so the
                     bar uses the text color to stay visible. -->
                  <span
                    class="data-bar"
                    aria-hidden="true"
                    style:width="{fraction * 100}%"
                    style:background={col.render_as === `both`
                      ? `currentColor`
                      : (color.bg ?? `var(--accent-color, #4a9eff)`)}
                  ></span>
                {/if}
              {/if}
              {#if col.cell}
                {@render col.cell({ row, col, val })}
              {:else if cell}
                {@render cell({ row, col, val })}
              {:else if date_val != null}
                {@render plain_text(date_val)}
              {:else if typeof val === `number` && !Number.isNaN(val)}
                {format_number(val, col.format ?? default_num_format)}
              {:else if is_invalid(val)}
                <!-- data-title feeds the delegated tooltip, so no per-cell attachment -->
                <span data-title="Not available">n/a</span>
              {:else if typeof val === `string` && !is_html}
                {@render plain_text(val)}
              {:else}
                <!-- booleans and objects render their text, as cell_text gives it -->
                {@const html = render_html(
                  typeof val === `string` ? val : cell_text(val),
                )}
                {#key html}
                  <span {@attach ellipsize_html}>{@html html}</span>
                {/key}
              {/if}
            </td>
          {/each}
        {/snippet}
        {#if display_rows.length === 0}
          <tr class="empty-row"><td colspan={body_colspan}>No data</td></tr>
        {:else if !prefersReducedMotion.current && row_animation_ms > 0 && !virtual_config}
          {#each display_rows as row, row_idx (row_each_key(row, display_range.start + row_idx))}
            {@const abs_idx = display_range.start + row_idx}
            <tr
              animate:flip={{ duration: row_animation_ms }}
              {...row_attrs(row, abs_idx)}
              class:hovered={is_highlighted(row)}
            >
              {@render row_cells(row, abs_idx)}
            </tr>
          {/each}
        {:else}
          {#each display_rows as row, row_idx (row_each_key(row, display_range.start + row_idx))}
            {@const abs_idx = display_range.start + row_idx}
            <tr {...row_attrs(row, abs_idx)} class:hovered={is_highlighted(row)}>
              {@render row_cells(row, abs_idx)}
            </tr>
          {/each}
        {/if}
        {@render virtual_spacer(spacer_bottom)}
      </tbody>
      {#if summary_stats.length > 0}
        <tfoot>
          <!-- One row per stat over searched/filtered rows. The stat name goes in a leading
               cell when there is one, so a numeric first column keeps its value. -->
          {#each summary_stats as stat (stat)}
            <tr class="summary-row">
              {#if show_row_select}
                <td class="select-col">{show_row_numbers ? `` : stat}</td>
              {/if}
              {#if show_row_numbers}<td class="row-num-col">{stat}</td>{/if}
              {#each cols as { col, id: identifier, numeric, stats, pin_class, pin_style }, col_idx (identifier)}
                <td class={pin_class} class:numeric-col={numeric} style={pin_style}>
                  {#if col_idx === 0 && leading_cols === 0}
                    <span class="summary-label">{stat}</span>
                  {:else if stats && numeric && stats[stat] != null}
                    <!-- only columns that are numeric throughout get a statistic; a mixed
                         text column would otherwise report a mean of the few parseable cells -->
                    {format_number(stats[stat], col.format ?? default_num_format)}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tfoot>
      {/if}
    </table>
  </div>

  {@render sort_hint_element(`bottom`)}

  {#if virtual_config && sorted_data.length > display_rows.length}
    <div class="row-count-info">{display_rows.length} of {sorted_data.length} rows</div>
  {/if}

  <!-- named by aria-label (also its tooltip): the arrow glyph alone would be its name -->
  {#snippet page_btn(label: string, name: string, to_page: number, disabled: boolean)}
    <button
      class="page-btn"
      {disabled}
      onclick={() => (current_page = to_page)}
      aria-label={name}
    >
      {label}
    </button>
  {/snippet}

  {#if pagination_config && (total_pages > 1 || page_sizes)}
    <div class="pagination">
      {#if total_pages > 1}
        {@render page_btn(`«`, `First page`, 1, page === 1)}
        {@render page_btn(`‹`, `Previous page`, page - 1, page === 1)}
        <span class="page-info">
          Page
          <input
            type="number"
            class="page-input"
            min="1"
            max={total_pages}
            value={page}
            onchange={(event) => {
              const val = parseInt(event.currentTarget.value, 10)
              current_page = clamp(Number.isNaN(val) ? 1 : val, 1, total_pages)
              event.currentTarget.value = String(current_page)
            }}
          />
          of {total_pages}
          <span class="row-count">({sorted_data.length} rows)</span>
        </span>
        {@render page_btn(`›`, `Next page`, page + 1, page === total_pages)}
        {@render page_btn(`»`, `Last page`, total_pages, page === total_pages)}
      {/if}
      {#if page_sizes}
        <select
          class="page-size-select"
          onchange={(event) => {
            page_size = parseInt(event.currentTarget.value, 10)
            current_page = 1
            pagination_config.on_page_size_change?.(page_size)
          }}
        >
          {#each page_sizes as size (size)}
            <option value={size} selected={size === page_size}>{size} / page</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <!-- trigger="none": the right-click targets are the column headers and cells, which
  record which column was hit, so the menu must not also trigger off <body> -->
  <ActionMenu
    trigger="none"
    bind:at={context_menu_at}
    actions={context_menu_actions}
    on_execute={() => (context_menu_col = null)}
    style={[
      `--action-menu-bg: light-dark(#fff, #1e1e1e)`,
      `--action-menu-border: 1px solid light-dark(rgba(0,0,0,0.15), rgba(255,255,255,0.15))`,
      `--action-menu-section-border: 1px solid light-dark(rgba(0,0,0,0.15), rgba(255,255,255,0.15))`,
      `color: light-dark(#333, #eee)`,
      `--action-menu-item-hover-bg: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.1))`,
      `--action-menu-item-checked-bg: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.15))`,
      `--action-menu-z-index: 200`,
    ].join(`; `)}
  />
</div>

<style>
  /* Chrome of the header popovers: the inline wrapper and touch halo (ColumnFilter,
     DateTimeFormatMenu), and DateTimeFormatMenu's 14 px trigger and floating select.
     ColumnFilter's scoped trigger and panel rules win, so it's themed via --column-filter-*. */
  :global(.header-popover) {
    display: inline-flex;
    align-items: center;
    margin-left: 3px;
    position: relative;
    vertical-align: middle;
  }
  :global(.header-popover > button) {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    line-height: 1;
  }
  /* touch: the 14px glyph stays put inside a 24px button (adjacent triggers sit 3px apart, so
     a wider halo would overlap the neighbour); a vertical halo completes the ~32px target */
  @media (pointer: coarse) {
    :global(.header-popover > button) {
      position: relative;
      width: 24px;
      height: 24px;
    }
    :global(.header-popover > button::before) {
      content: '';
      position: absolute;
      inset: -4px 0;
    }
  }
  :global(.header-popover > button:is(:hover, [aria-expanded='true'])) {
    background: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.16));
  }
  :global(.header-popover > select) {
    border: 1px solid light-dark(rgba(0, 0, 0, 0.12), rgba(255, 255, 255, 0.18));
    border-radius: 4px;
    background: var(--table-header-bg, var(--page-bg, Canvas));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    color: inherit;
  }
  /* Density presets feed the same --table-cell-padding consumers can already set,
     so an explicit override still wins over the preset. */
  .table-container[data-density='compact'] {
    --table-density-padding: 0 4pt;
  }
  .table-container[data-density='cosy'] {
    --table-density-padding: 1pt 5pt;
  }
  .table-container[data-density='comfortable'] {
    --table-density-padding: 5pt 8pt;
  }
  .table-container {
    --table-accent: var(--accent-color, #4a9eff);
    --column-filter-active-color: var(--table-accent);
    --column-filter-panel-bg: var(--table-header-bg, var(--page-bg, Canvas));
    font-size: var(--table-font-size, 0.9em);
    width: fit-content;
    max-width: 100%;
    max-height: inherit;
    margin: 0 auto;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .table-scroll {
    position: relative;
    overflow: auto;
  }
  .table-scroll.has-scroll {
    border: 1px solid light-dark(rgba(0, 0, 0, 0.12), rgba(255, 255, 255, 0.12));
    border-radius: var(--border-radius, 3pt);
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    display: table; /* Override global display: block to enable sticky headers */
  }
  /* during a cell-range drag, native text selection would fight the rectangle highlight */
  .table-container.cell-dragging {
    cursor: cell;
    user-select: none;
  }
  /* Keep background-image free for the row-hover wash. */
  td.cell-selected {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--table-accent) 55%, transparent),
      inset 0 0 0 100vmax color-mix(in srgb, var(--table-accent) 30%, transparent);
  }
  th,
  td {
    padding: var(--table-cell-padding, var(--table-density-padding, 1pt 5pt));
    text-align: var(--table-text-align, left);
    border: var(--table-cell-border, none);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* --cell-bg is set inline per cell from column_color; hosts fade fills by setting
       --table-fill-opacity on the container */
    background-color: color-mix(
      in srgb,
      var(--cell-bg, transparent) var(--table-fill-opacity, 100%),
      transparent
    );
  }
  /* Cap data columns without constraining group headers or colspan spacer/empty cells.
     An explicit user-resized min-width still wins over this default maximum. */
  th[data-col-id],
  td[data-col] {
    max-width: var(--table-column-max-width, 20em);
  }
  .middle-ellipsis {
    position: relative;
    display: inline-block;
    max-width: 100%;
    vertical-align: bottom;
  }
  /* The real text stays as one selectable/accessibility string and establishes intrinsic
     width. A pseudo-element overlay handles visual truncation without duplicating DOM text. */
  .middle-ellipsis-raw {
    opacity: 0;
  }
  .middle-ellipsis-visual {
    position: absolute;
    inset: 0;
    display: flex;
    pointer-events: none;
    user-select: none;
    &::before {
      content: attr(data-start);
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &::after {
      content: attr(data-end);
      flex: none;
    }
  }
  .table-container :global(:is(.middle-ellipsis-host, .middle-ellipsis-html)) {
    display: inline-flex;
    max-width: 100%;
    min-width: 0;
    vertical-align: bottom;
  }
  .table-container :global(.middle-ellipsis-html) {
    > :global(span:first-child) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    > :global(span:last-child) {
      flex: none;
    }
  }
  /* a column description renders inside its header, but wraps as prose instead of taking
     the header's single bold line (which the popover's max-width then clips) */
  th :global(.popover) {
    white-space: normal;
    text-align: start;
    font-weight: normal;
  }
  th {
    background: var(--table-header-bg, var(--page-bg, Canvas));
    position: sticky;
    top: 0;
    z-index: 2;
    cursor: pointer;
    user-select: none;
    &:hover {
      background: var(--table-header-hover-bg, var(--surface-bg-hover));
    }
    &.popover-open {
      overflow: visible;
      z-index: 30;
    }
    /* styled off aria-grabbed rather than a second class computed from the same state */
    &[aria-grabbed='true'] {
      opacity: 0.4;
      cursor: grabbing;
    }
    &[data-drag-side='left'] {
      border-left: 4px solid var(--table-accent);
    }
    &[data-drag-side='right'] {
      border-right: 4px solid var(--table-accent);
    }
    &[draggable='true'] {
      cursor: grab;
    }
    &.not-sortable {
      cursor: default;
    }
  }
  /* clears the group-header row above it, which sticks at top: 0 (var unset without one) */
  thead tr:not(.group-header) th {
    top: var(--group-header-height, 0);
  }
  /* Data bars: a proportional fill behind the cell text. Magnitude by length reads more
     precisely than by color and survives color-vision deficiency. */
  td:has(.data-bar) {
    position: relative;
  }
  .data-bar {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: var(--table-data-bar-height, 70%);
    border-radius: 2px;
    opacity: var(--table-data-bar-opacity, 0.35);
    pointer-events: none;
  }
  /* Leaderboard marker for the column's winning value. Outline, not box-shadow: the
     selection ring is a box-shadow at equal specificity, and whichever rule came last
     would erase the other. */
  td.best-cell {
    outline: 2px solid var(--table-best-cell-color, var(--table-accent));
    outline-offset: -2px;
    font-weight: 600;
  }
  th.numeric-col,
  td.numeric-col {
    text-align: var(--table-numeric-text-align, right);
    font-variant-numeric: tabular-nums; /* equal digit widths, so decimals line up */
  }
  /* `left`/`right` is set inline from the measured widths of the pinned columns before it */
  th.pinned,
  td.pinned {
    border-right: 1px solid var(--border-color, #ddd);
  }
  th.pinned-right,
  td.pinned-right {
    border-right: none;
    border-left: 1px solid var(--border-color, #ddd);
  }
  th.pinned {
    z-index: 4; /* Higher than regular th (2) to stay above when both scroll */
  }
  /* Chromium antialiases sticky cell edges at fractional device-pixel row offsets, letting
     columns scrolling beneath bleed through as hairlines. Each cell's background (and
     selection shadow) extends 1px under the next row, which paints over it except in that
     seam; overflow: clip with a 1px clip margin lets the overhang render. */
  td.pinned {
    position: sticky;
    background: var(--table-sticky-cell-bg, var(--page-bg, Canvas));
    z-index: 1;
    overflow: clip;
    overflow-clip-margin: 1px;
  }
  td.pinned::before {
    content: '';
    position: absolute;
    inset: 0 0 -1px;
    z-index: -1;
    background: inherit;
    box-shadow: inherit;
  }
  /* separate odd-row var so consumers with striped rows can composite their stripe
  color over the opaque sticky background (which must stay opaque to occlude columns
  scrolling beneath it), e.g.
  --table-sticky-cell-odd-bg: linear-gradient(var(--stripe), var(--stripe)), var(--page-bg) */
  tbody tr:nth-child(odd) td.pinned {
    background: var(
      --table-sticky-cell-odd-bg,
      var(--table-sticky-cell-bg, var(--page-bg, Canvas))
    );
  }
  tbody tr {
    &:is(:hover, .hovered) {
      filter: var(--table-row-hover-filter, none);
    }
    /* Tint cells because their opaque backgrounds hide a row-level wash. */
    &:is(:hover, .hovered) td {
      background-image: linear-gradient(
        var(--table-row-hover-bg, rgba(128, 128, 128, 0.16)),
        var(--table-row-hover-bg, rgba(128, 128, 128, 0.16))
      );
    }
    &[tabindex] {
      cursor: pointer;
    }
    &:focus-visible {
      outline: 2px solid var(--table-accent);
      outline-offset: -2px;
    }
    /* hosts mark rows of interest with class="highlight" */
    &.highlight {
      background-color: var(--surface-bg-hover) !important;
      &,
      :global(a) {
        color: var(--table-accent) !important;
      }
    }
    &.selected {
      background: var(--highlight-bg, rgba(74, 158, 255, 0.15)) !important;
      td {
        border-top: 1px solid var(--table-accent);
        border-bottom: 1px solid var(--table-accent);
      }
    }
  }
  .group-header th {
    text-align: center;
    border-bottom: 1px solid var(--border-color);
    /* Sticky cells in group header row need higher z-index to clip scrolling group headers */
    &.pinned {
      z-index: 5;
    }
  }
  /* Floating control buttons above the table */
  .control-buttons {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 2px;
    margin-bottom: 1px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
  }
  /* keep visible while a dropdown/pane is open */
  .table-container:hover .control-buttons,
  .control-buttons:focus-within,
  .control-buttons.force-visible,
  .control-buttons.always-visible {
    opacity: 1;
    pointer-events: auto;
  }
  @media (hover: none) {
    .control-buttons {
      opacity: 1;
      pointer-events: auto;
    }
  }
  /* .pane-toggle = the settings-pane gear, which sits in the control row and
     must match the other .icon-btn buttons: uniform square ghost buttons */
  .icon-btn,
  .control-buttons > :global(button.pane-toggle) {
    box-sizing: border-box;
    inline-size: 22px;
    block-size: 22px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    /* dim resting color so the hover jump to full contrast reads clearly */
    color: light-dark(#6b7280, #98a0ae);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.8em;
    transition: color 0.02s linear;
    :global(svg) {
      width: 14px;
      height: 14px;
    }
    /* toolbar buttons give color-only hover feedback — no background shading */
    &:hover {
      background: transparent;
      color: light-dark(#000, #fff);
    }
  }
  .icon-btn.active {
    color: var(--table-accent);
  }
  .selection-badge {
    position: relative;
    /* row-count badge next to the clear icon makes this one wider */
    inline-size: auto;
    padding: 0 4px;
    .badge {
      background: var(--table-accent);
      color: var(--table-badge-color, white);
      font-size: 0.7em;
      padding: 1px 4px;
      border-radius: 8px;
      min-width: 14px;
      text-align: center;
    }
  }
  .search-input {
    padding: 2px 4px;
    border: 1px solid light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.2));
    border-radius: 3px;
    background: light-dark(rgba(255, 255, 255, 0.9), rgba(0, 0, 0, 0.3));
    color: light-dark(#333, #eee);
    font-size: 0.8em;
    width: 110px;
    box-sizing: border-box;
    &::placeholder {
      color: light-dark(#999, #666);
    }
  }
  .search-input:focus,
  .page-input:focus {
    outline: 1px solid var(--table-accent);
  }
  .sort-hint {
    text-align: center;
    font-size: 0.75em;
    color: var(--text-color-muted);
    padding: 4px 0;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .table-container:hover .sort-hint,
  .sort-hint.permanent {
    opacity: 1;
  }
  .select-col {
    width: 30px;
    text-align: center;
    vertical-align: middle;
    padding: 2px !important;
  }
  /* Spacers stand in for the rows outside the window and carry their whole size as
     height, so any padding or border would overshoot it */
  .virtual-spacer td {
    padding: 0;
    border: none;
  }
  .row-count-info {
    padding: 4px 8px;
    font-size: 0.8em;
    text-align: right;
    opacity: 0.6;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
  }
  .page-btn {
    padding: 4px 10px;
    border: 1px solid var(--border-color, #444);
    border-radius: 4px;
    background: var(--page-bg, Canvas);
    color: inherit;
    cursor: pointer;
    font-size: 1em;
    &:hover:not(:disabled) {
      background: var(--surface-bg-hover, #333);
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
  .page-info {
    font-size: 0.9em;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .page-input,
  .page-size-select {
    padding: 2px 4px;
    border: 1px solid light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2));
    border-radius: 3px;
    background: light-dark(#fff, #333);
    color: inherit;
  }
  .page-input {
    min-width: 1em !important; /* Override global min-width: 40px from app.css */
    font-size: inherit;
    text-align: center;
    appearance: textfield;
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }
  .page-size-select {
    font-size: 0.9em;
  }
  .row-count {
    color: var(--text-color-muted);
    font-size: 0.85em;
  }
  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
  }
  .resize-handle:is(:hover, :focus-visible),
  th.resizing .resize-handle {
    background: var(--table-accent);
  }
  .empty-row td {
    text-align: center;
    padding: 2em !important;
    color: var(--text-color-muted, #888);
    font-style: italic;
  }
  .row-num-col {
    text-align: var(--table-row-num-align, right);
    color: var(--text-color-muted, #888);
    font-size: 0.85em;
    width: 2em;
    /* left default matches the th,td --table-cell-padding fallback */
    padding-left: var(--table-row-num-padding-left, 5pt);
    padding-right: var(--table-row-num-padding-right, 8px) !important;
  }
</style>
