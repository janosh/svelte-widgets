// Defaults for the table components' `labels` overrides, merged with `merge_defaults`

export const COLUMN_PICKER_LABELS = {
  // text of the default trigger, and its aria-label when a `trigger` snippet replaces it
  trigger: `Columns`,
  filter: `Filter columns`,
  filter_placeholder: `Filter columns…`,
  no_matches: `No matching columns`,
  // aria-label of the hover popover holding a column's description
  details: `Column details`,
  all_columns: `all columns`,
  // reset button aria-label, named for `all_columns` or a group
  reset: (name: string) => `Reset ${name} to defaults`,
}
export type ColumnPickerLabels = typeof COLUMN_PICKER_LABELS

export const COLUMN_FILTER_LABELS = {
  trigger: (column: string) => `Filter ${column}`,
  min: `Min`,
  max: `Max`,
  contains: `Contains…`,
  // checklist entry for empty-string values
  blank: `(blank)`,
  clear: `Clear filter`,
}
export type ColumnFilterLabels = typeof COLUMN_FILTER_LABELS
