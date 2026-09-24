// Binary-prefixed file size, e.g. 1536 -> `1.50 KiB`.
const BYTE_UNITS = [`B`, `KiB`, `MiB`, `GiB`, `TiB`, `PiB`] as const
export const format_bytes = (bytes?: number): string => {
  if (bytes === undefined || !Number.isFinite(bytes)) return `Unknown`
  // Bytes are integral; a fractional input (an averaged size) must not print as `1023.5 B`
  let [value, unit_idx] = [Math.round(bytes), 0]
  // Step up on the displayed (rounded) value so 1048575 reads `1.00 MiB`, not `1024.00 KiB`
  while (Math.abs(Number(value.toFixed(2))) >= 1024 && unit_idx < BYTE_UNITS.length - 1) {
    value /= 1024
    unit_idx++
  }
  if (unit_idx === 0) return `${value} B`
  return `${value.toFixed(2)} ${BYTE_UNITS[unit_idx]}`
}
