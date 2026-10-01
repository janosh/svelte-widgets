import type { GroupedOptions, LoadOptionsConfig, Option, OptionListProps } from '../types'
import { create_term_matcher, get_label, has_group, is_object } from '../utils'
import { virtual_window } from '../virtual'

export const option_disabled = (option: Option): boolean =>
  Boolean(is_object(option) && option.disabled)

// Filters call this per option with the same query, so reuse the last prepared matcher.
let last_matcher = { key: ``, matches: (_text: string) => true }
export const option_matches = (option: Option, search: string, fuzzy = true): boolean => {
  const key = `${fuzzy}:${search}`
  if (last_matcher.key !== key)
    last_matcher = { key, matches: create_term_matcher(search, { fuzzy, split: false }) }
  return last_matcher.matches(`${get_label(option)}`)
}

export function group_options<T extends Option>(
  options: T[],
  config: {
    collapsed: ReadonlySet<string>
    sort: `none` | `asc` | `desc` | ((left: string, right: string) => number)
    ungrouped: `first` | `last`
  },
): GroupedOptions<T>[] {
  const { collapsed, sort } = config
  const ungrouped_order = config.ungrouped === `first` ? -1 : 1
  // The sort is stable, so `none` keeps named groups in first-occurrence order.
  return [...Map.groupBy(options, (option) => (has_group(option) ? option.group : null))]
    .toSorted(([left], [right]) => {
      if (left === null) return ungrouped_order
      if (right === null) return -ungrouped_order
      if (sort === `none`) return 0
      if (typeof sort === `function`) return sort(left, right)
      return left.localeCompare(right) * (sort === `desc` ? -1 : 1)
    })
    .map(([group, items]) => ({
      group,
      options: items,
      collapsed: group !== null && collapsed.has(group),
    }))
}

// Keyboard order: every option outside collapsed groups.
export const navigable_options = <T extends Option>(
  groups: GroupedOptions<T>[],
  collapsible: boolean,
): T[] =>
  groups.flatMap(({ options, collapsed }) => (collapsible && collapsed ? [] : options))

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
      // Past the max_options limit a header would label an empty section.
      if (group !== null && flat_idx < limit) {
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

export const is_integer_at_least = (
  candidate: unknown,
  minimum: number,
): candidate is number =>
  typeof candidate === `number` && Number.isInteger(candidate) && candidate >= minimum

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
  const { batch_size, debounce_ms }: Partial<LoadOptionsConfig> =
    load_options && typeof load_options === `object` ? load_options : {}
  const { item_height, overscan } = typeof virtual_list === `object` ? virtual_list : {}
  const problem = [
    max_options != null &&
      !is_integer_at_least(max_options, 0) &&
      `max_options must be null, undefined, or a non-negative integer, got ${max_options}`,
    batch_size !== undefined &&
      !is_integer_at_least(batch_size, 1) &&
      `load_options.batch_size must be a positive integer, got ${batch_size}`,
    debounce_ms !== undefined &&
      (!Number.isFinite(debounce_ms) || debounce_ms < 0) &&
      `load_options.debounce_ms must be finite and non-negative, got ${debounce_ms}`,
    item_height !== undefined &&
      (!Number.isFinite(item_height) || item_height <= 0) &&
      `virtual_list.item_height must be positive, got ${item_height}`,
    overscan !== undefined &&
      !is_integer_at_least(overscan, 0) &&
      `virtual_list.overscan must be a non-negative integer, got ${overscan}`,
    virtual_list &&
      sticky_group_headers &&
      has_grouped_options &&
      `virtual_list cannot be combined with sticky_group_headers for grouped options`,
  ].find((check) => typeof check === `string`)
  if (problem) throw new TypeError(`${component}: ${problem}`)
}
