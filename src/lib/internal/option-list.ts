import type { GroupedOptions, Option, OptionListProps } from '../types'
import { fuzzy_match, get_label, has_group, is_object } from '../utils'
import { virtual_window } from '../virtual'

export const option_disabled = (option: Option): boolean =>
  Boolean(is_object(option) && option.disabled)

export const option_matches = (option: Option, search: string, fuzzy = true): boolean =>
  !search ||
  (fuzzy
    ? fuzzy_match(search, `${get_label(option)}`)
    : `${get_label(option)}`.toLowerCase().includes(search.toLowerCase()))

export function group_options<T extends Option>(
  options: T[],
  config: {
    collapsed: ReadonlySet<string>
    sort: `none` | `asc` | `desc` | ((left: string, right: string) => number)
    ungrouped: `first` | `last`
  },
): GroupedOptions<T>[] {
  const grouped = Map.groupBy(options, (option) =>
    has_group(option) ? option.group : null,
  )
  const groups = [...grouped].filter(([group]) => group !== null)
  if (config.sort !== `none`)
    groups.sort(([left], [right]) => {
      if (left === null || right === null) return 0
      return typeof config.sort === `function`
        ? config.sort(left, right)
        : left.localeCompare(right) * (config.sort === `desc` ? -1 : 1)
    })
  const ungrouped = grouped.get(null)
  if (ungrouped) {
    if (config.ungrouped === `first`) groups.unshift([null, ungrouped])
    else groups.push([null, ungrouped])
  }
  return groups.map(([group, items]) => ({
    group,
    options: items,
    collapsed: group !== null && config.collapsed.has(group),
  }))
}

export type OptionGroupRow<T extends Option> = GroupedOptions<T> & {
  kind: `header`
  group: string
  render_key: symbol
  selectable: T[]
}
type OptionRow<T extends Option> =
  | {
      kind: `option`
      option: T
      flat_idx: number
      render_key: unknown
      group: string | null
    }
  | OptionGroupRow<T>

// Each control owns its header keys; symbols cannot collide with option keys.
export function create_option_rows<T extends Option>() {
  const header_keys = new Map<string, symbol>()
  return (
    groups: GroupedOptions<T>[],
    key: (option: T) => unknown,
    collapsible: boolean,
    limit: number,
  ): OptionRow<T>[] => {
    const rows: OptionRow<T>[] = []
    let flat_idx = 0
    for (const { group, options, collapsed } of groups) {
      const hidden = collapsed && collapsible
      const selectable: T[] = []
      if (group !== null) {
        const render_key = header_keys.get(group) ?? Symbol(`sms-header-${group}`)
        header_keys.set(group, render_key)
        rows.push({ kind: `header`, group, options, collapsed, selectable, render_key })
      }
      for (const option of options) {
        // Count hidden occurrences too, so collapsing a group cannot rekey later duplicates.
        const render_key = key(option)
        const visible = !hidden && flat_idx < limit
        if (group !== null && (hidden || visible) && !option_disabled(option))
          selectable.push(option)
        if (hidden) continue
        if (visible) rows.push({ kind: `option`, option, flat_idx, render_key, group })
        flat_idx++
      }
    }
    return rows
  }
}

// Both option controls use fixed-height rows, including their group headers.
export function option_window(
  config: OptionListProps[`virtual_list`],
  scroll: number,
  viewport: number,
  count: number,
) {
  if (!config) return null
  const { item_height = 30, overscan = 10 } = typeof config === `object` ? config : {}
  return {
    ...virtual_window({ scroll, viewport, count, item_size: item_height, overscan }),
    item_height,
  }
}

// The optional trailing row is used by controls that can create a new option.
export function next_option_index(
  options: Option[],
  active: number | null,
  direction: 1 | -1,
  extra_row = false,
): number | null {
  const count = options.length + Number(extra_row)
  const start = active ?? (direction === 1 ? -1 : 0)
  for (let offset = 1; offset <= count; offset++) {
    const index = (start + direction * offset + count) % count
    if (index === options.length || !option_disabled(options[index])) return index
  }
  return null
}

// Shared controls reject invalid windows and pagination before deriving rows or fetching.
export function validate_option_list_config(
  {
    max_options,
    load_options,
    virtual_list,
    sticky_group_headers,
    has_grouped_options,
  }: Pick<
    OptionListProps,
    `max_options` | `load_options` | `virtual_list` | `sticky_group_headers`
  > & { has_grouped_options: boolean },
  component = `OptionList`,
): void {
  const invalid_config = (message: string): never => {
    throw new TypeError(`${component}: ${message}`)
  }
  const is_integer_at_least = (value: number, minimum: number): boolean =>
    Number.isInteger(value) && value >= minimum
  if (max_options != null && !is_integer_at_least(max_options, 0)) {
    invalid_config(
      `max_options must be null, undefined, or a non-negative integer, got ${max_options}`,
    )
  }
  if (load_options && typeof load_options === `object`) {
    const { batch_size, debounce_ms } = load_options
    if (batch_size !== undefined && !is_integer_at_least(batch_size, 1)) {
      invalid_config(
        `load_options.batch_size must be a positive integer, got ${batch_size}`,
      )
    }
    if (debounce_ms !== undefined && (!Number.isFinite(debounce_ms) || debounce_ms < 0)) {
      invalid_config(
        `load_options.debounce_ms must be finite and non-negative, got ${debounce_ms}`,
      )
    }
  }
  if (typeof virtual_list === `object`) {
    const { item_height, overscan } = virtual_list
    if (
      item_height !== undefined &&
      (!Number.isFinite(item_height) || item_height <= 0)
    ) {
      invalid_config(`virtual_list.item_height must be positive, got ${item_height}`)
    }
    if (overscan !== undefined && !is_integer_at_least(overscan, 0)) {
      invalid_config(
        `virtual_list.overscan must be a non-negative integer, got ${overscan}`,
      )
    }
  }
  if (virtual_list && sticky_group_headers && has_grouped_options) {
    invalid_config(
      `virtual_list cannot be combined with sticky_group_headers for grouped options`,
    )
  }
}
