// A single normalized view for rendering and toggling controlled selections.
// Reject mismatched modes instead of silently hiding a caller's selection.
export function selection_values<Value>(
  mode: `single` | `multiple`,
  value: Value | Value[] | null | undefined,
): Value[] {
  if (value === undefined) return []
  if (mode === `multiple` && Array.isArray(value)) return value
  if (mode === `single` && !Array.isArray(value)) return value === null ? [] : [value]
  throw new TypeError(
    `Selection mode=${mode} received incompatible value=${JSON.stringify(value)}`,
  )
}
