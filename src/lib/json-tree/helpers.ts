const BYTE_UNITS = [`B`, `KiB`, `MiB`, `GiB`, `TiB`, `PiB`] as const
export const format_bytes = (bytes?: number): string => {
  if (bytes === undefined || !Number.isFinite(bytes)) return `Unknown`
  let [value, unit_idx] = [bytes, 0]
  while (Math.abs(value) >= 1024 && unit_idx < BYTE_UNITS.length - 1) {
    value /= 1024
    unit_idx++
  }
  // Bytes are integral; a fractional input (an averaged size) must not print as `1023.5 B`
  if (unit_idx === 0) return `${Math.round(value)} B`
  return `${value.toFixed(2)} ${BYTE_UNITS[unit_idx]}`
}

export function make_change_detector(): (value: unknown) => boolean {
  const unset = Symbol(`unset`)
  let prev: unknown = unset
  return (value: unknown) => {
    const changed = prev !== unset && value !== prev
    prev = value
    return changed
  }
}
