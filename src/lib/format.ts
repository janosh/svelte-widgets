// Binary-prefixed file size, e.g. 1536 -> `1.5 KiB`.
const BYTE_UNITS = [`B`, `KiB`, `MiB`, `GiB`, `TiB`, `PiB`] as const
export const format_bytes = (bytes?: number): string => {
  if (bytes === undefined || !Number.isFinite(bytes)) return `Unknown`
  // One decimal below 10, whole numbers from there: `1.5 KiB`, `385 MiB`, not `384.63 MiB`
  const shown = (value: number): number =>
    Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  // Bytes are integral; a fractional input (an averaged size) must not print as `1023.5 B`
  let [value, unit_idx] = [Math.round(bytes), 0]
  // Step up on the displayed (rounded) value so 1048575 reads `1 MiB`, not `1024 KiB`
  while (Math.abs(shown(value)) >= 1024 && unit_idx < BYTE_UNITS.length - 1) {
    value /= 1024
    unit_idx++
  }
  return `${unit_idx ? shown(value) : value} ${BYTE_UNITS[unit_idx]}`
}
