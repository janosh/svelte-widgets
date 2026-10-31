## Table building blocks

`svelte-widgets/table` holds the parts of a data table that are tedious to get right, without owning your markup or row model: `ColumnPicker` (show/hide columns), `ColumnFilter` (a per-column range, checklist or substring filter), `CellSelection` with the `cell_range_select` attachment (drag-select cells and copy them as TSV), and serializers to CSV, TSV, JSON, Markdown and LaTeX.

### Composed table

Click a header to sort, open a funnel to filter that column, toggle columns from the menu, drag across cells (Shift/Cmd/Ctrl-drag adds ranges) and press Cmd/Ctrl+C to copy them, or download the visible rows.

```svelte example id="table-composed"
<script lang="ts">
  import { download } from 'svelte-widgets/download'
  import {
    CellSelection,
    ColumnFilter,
    ColumnPicker,
    cell_range_select,
    filter_rows,
    table_to_json,
    table_to_text,
    type ColumnFilterValue,
    type TableColumn,
  } from 'svelte-widgets/table'
  import { untrack } from 'svelte'

  type Row = {
    name: string
    symbol: string
    number: number
    mass: number
    state: string
    year: number | null
  }
  const rows: Row[] = [
    { name: `Hydrogen`, symbol: `H`, number: 1, mass: 1.008, state: `gas`, year: 1766 },
    { name: `Helium`, symbol: `He`, number: 2, mass: 4.0026, state: `gas`, year: 1868 },
    { name: `Carbon`, symbol: `C`, number: 6, mass: 12.011, state: `solid`, year: null },
    { name: `Nitrogen`, symbol: `N`, number: 7, mass: 14.007, state: `gas`, year: 1772 },
    { name: `Oxygen`, symbol: `O`, number: 8, mass: 15.999, state: `gas`, year: 1774 },
    { name: `Sodium`, symbol: `Na`, number: 11, mass: 22.99, state: `solid`, year: 1807 },
    { name: `Iron`, symbol: `Fe`, number: 26, mass: 55.845, state: `solid`, year: null },
    {
      name: `Bromine`,
      symbol: `Br`,
      number: 35,
      mass: 79.904,
      state: `liquid`,
      year: 1826,
    },
    {
      name: `Silver`,
      symbol: `Ag`,
      number: 47,
      mass: 107.87,
      state: `solid`,
      year: null,
    },
    {
      name: `Mercury`,
      symbol: `Hg`,
      number: 80,
      mass: 200.59,
      state: `liquid`,
      year: null,
    },
  ]

  type Column = TableColumn & { id: keyof Row; numeric: boolean }
  let columns = $state<Column[]>([
    { id: `name`, label: `Name`, group: `Identity`, numeric: false, disabled: true },
    { id: `symbol`, label: `Symbol`, group: `Identity`, numeric: false },
    {
      id: `number`,
      label: `Z`,
      group: `Identity`,
      numeric: true,
      description: `Atomic number`,
    },
    {
      id: `mass`,
      label: `Mass`,
      group: `Physical`,
      numeric: true,
      description: `Standard atomic weight in u`,
    },
    {
      id: `state`,
      label: `State`,
      group: `Physical`,
      numeric: false,
      description: `Phase at room temperature`,
    },
    { id: `year`, label: `Discovered`, group: `History`, numeric: true, visible: false },
  ])
  let filters = $state<Partial<Record<keyof Row, ColumnFilterValue>>>({})
  let open_filter = $state<keyof Row | null>(null)
  let sort = $state<{ key: keyof Row; dir: 1 | -1 }>({ key: `number`, dir: 1 })

  const visible = $derived(columns.filter((col) => col.visible !== false))
  const collator = new Intl.Collator(undefined, { numeric: true })
  // missing values sink to the bottom in either direction
  const compare = (row_a: Row, row_b: Row): number => {
    const [val_a, val_b] = [row_a[sort.key], row_b[sort.key]]
    if (val_a === null || val_b === null)
      return Number(val_a === null) - Number(val_b === null)
    return sort.dir * collator.compare(String(val_a), String(val_b))
  }
  const shown = $derived(filter_rows(rows, filters).toSorted(compare))
  const cell_text = (row: Row, col: Column): string => String(row[col.id] ?? ``)

  // selection coordinates index `shown` and `visible`, so a re-sort, re-filter or column
  // toggle clears them
  const selection = new CellSelection()
  $effect(() => {
    void [shown, visible]
    untrack(selection.clear)
  })

  const toggle_sort = (key: keyof Row) =>
    (sort = { key, dir: sort.key === key && sort.dir === 1 ? -1 : 1 })
  // file extension, button label and MIME type per download format
  const formats = [
    [`csv`, `CSV`, `text/csv`],
    [`tsv`, `TSV`, `text/tab-separated-values`],
    [`json`, `JSON`, `application/json`],
    [`md`, `Markdown`, `text/markdown`],
    [`tex`, `LaTeX`, `application/x-tex`],
  ] as const
  function export_as(format: (typeof formats)[number][0], mime: string) {
    const text =
      format === `json`
        ? table_to_json(shown, visible)
        : table_to_text(
            {
              headers: visible.map((col) => col.label),
              rows: shown.map((row) => visible.map((col) => cell_text(row, col))),
              numeric: visible.map((col) => col.numeric),
            },
            format,
          )
    download(text, `elements.${format}`, mime)
  }
</script>

<div class="toolbar">
  <ColumnPicker bind:columns collapsed_groups={[`History`]} />
  {#each formats as [format, label, mime] (format)}
    <button type="button" onclick={() => export_as(format, mime)}>{label}</button>
  {/each}
  <span>{shown.length} of {rows.length} rows · {selection.size} cells selected</span>
</div>

<div style="overflow-x: auto">
  <table class="demo-table">
    <thead>
      <tr>
        {#each visible as col (col.id)}
          <th
            aria-sort={sort.key === col.id
              ? sort.dir === 1
                ? `ascending`
                : `descending`
              : `none`}
          >
            <button type="button" class="sort" onclick={() => toggle_sort(col.id)}>
              {col.label}{sort.key === col.id ? (sort.dir === 1 ? ` ↑` : ` ↓`) : ``}
            </button>
            <ColumnFilter
              column={col.label}
              values={() => rows.map((row) => row[col.id])}
              options={{ numeric: col.numeric }}
              bind:filter={filters[col.id]}
              bind:open={
                () => open_filter === col.id,
                (open) => (open_filter = open ? col.id : null)
              }
            />
          </th>
        {/each}
      </tr>
    </thead>
    <tbody
      {@attach cell_range_select(selection, {
        cell_text: (row, col) =>
          shown[row] && visible[col] ? cell_text(shown[row], visible[col]) : undefined,
      })}
    >
      {#each shown as row, row_idx (row.symbol)}
        <tr>
          {#each visible as col, col_idx (col.id)}
            <td
              data-row={row_idx}
              data-col={col_idx}
              class={{ numeric: col.numeric, selected: selection.has(row_idx, col_idx) }}
              >{row[col.id] ?? `–`}</td
            >
          {/each}
        </tr>
      {:else}
        <tr><td colspan={visible.length}>No rows match the filters</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    span {
      margin-left: auto;
      opacity: 0.7;
    }
  }
  .demo-table {
    width: 100%;
    border-collapse: collapse;
    user-select: none;
    th,
    td {
      padding: 0.3em 0.6em;
      border-bottom: 1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.12));
      text-align: left;
      white-space: nowrap;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .sort {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    td.selected {
      background: color-mix(in srgb, var(--accent-color, #4a9eff) 25%, transparent);
    }
  }
</style>
```

### Headless pieces

Every part works without the others. Filters are plain data, so `filter_rows(rows, filters)` (or `compile_filter(filter)` for a reusable per-cell test) applies them anywhere, including on a server. Missing cells (`null`, `undefined`, `NaN`, invalid dates) never match a category filter, while real `''` cells list and match as blank. `filter_panel(values)` decides which control a column gets: `numeric` when every value parses as a number, `category` for up to `CATEGORY_LIMIT` (40) distinct values, else `text`, and reads the numeric extent the range inputs show as placeholders. Pass `to_text`, `to_number` and `is_missing` when cells hold markup, units or uncertainties.

```ts
import { CellSelection, compile_filter, table_to_text } from 'svelte-widgets/table'

compile_filter({ kind: `numeric`, min: 1, max: 2 })(`1.5`) // true
compile_filter({ kind: `text`, text: `e2o` })(`Fe2O3`) // true

const selection = new CellSelection()
selection.start_drag({ row: 0, col: 0 }, false)
selection.extend_drag({ row: 1, col: 1 })
selection.end_drag()
selection.size // 4
selection.to_tsv((row, col) => `r${row}c${col}`) // `r0c0\tr0c1\nr1c0\tr1c1`
// out-of-range cells (text undefined) are skipped
selection.to_tsv((row, col) => (row < 1 ? `r${row}c${col}` : undefined)) // `r0c0\tr0c1`

table_to_text(
  { headers: [`Name`, `Z`], rows: [[`Iron`, `26`]], numeric: [false, true] },
  `md`,
)
// | Name | Z |
// | :--- | ---: |
// | Iron | 26 |
```

Selection coordinates index your current rows and columns, so clear the selection (`selection.clear()`) whenever those change: after a sort, filter, or hiding or reordering columns. A forgotten clear doesn't throw, as long as `cell_text` returns `undefined` for cells out of range.

### Main API

| Export                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ColumnPicker`                            | `bind:columns` of `TableColumn` (`id`, `label`, `group`, `description`, `visible`, `default_visible`, `disabled`). Sections by `group` (`bind:collapsed_groups`), searches past `search_threshold` columns, resets per section or globally to each column's default. Snippets: `trigger`, `header`, `toggle_label`, `description`. `on_toggle(column, visible)` reports every change, resets included. |
| `ColumnFilter`                            | `bind:filter` (a `ColumnFilterValue`) and `bind:open` for the `column` it names. `values()` is read lazily while open; `options` (what `filter_panel` takes: `kind`, `numeric`, `category_limit` and the cell readers) and `format_bound` tune the panel. Snippets: `trigger`, `option`.                                                                                                               |
| `CellSelection`                           | Reactive rectangles with `has(row, col)`, `size`, `start_drag` / `extend_drag` / `end_drag`, `step` for Shift+arrow growth, `clear` and `to_tsv`. Clear it whenever the rows or columns change.                                                                                                                                                                                                        |
| `cell_range_select(selection, options)`   | Attachment wiring pointer drags, Escape, outside presses and copy events (Cmd/Ctrl+C, Edit > Copy, given `cell_text`) onto cells marked `data-row` / `data-col` (or your own `cell_at`). Touch presses scroll instead of selecting.                                                                                                                                                                    |
| `table_to_text(matrix, format)`           | CSV (RFC 4180 via `svelte-widgets/csv`), TSV, Markdown or LaTeX from a `TableMatrix` of plain-text headers and rows.                                                                                                                                                                                                                                                                                   |
| `table_to_json(rows, columns, to_value?)` | Rows as objects keyed by stable column IDs, so renamed or repeated headers never collide.                                                                                                                                                                                                                                                                                                              |

Both components take `labels` for translation, `class`, `style` and other attributes on their root, and CSS custom properties prefixed `--column-picker-` and `--column-filter-` (see [theming](theming)).
