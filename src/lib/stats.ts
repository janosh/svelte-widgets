export interface StatItem {
  label: string
  value: string | number
  unit?: string
  delta?: number
  // Direction alone does not imply improvement (e.g. increasing cost or latency).
  delta_tone?: `positive` | `negative`
  hint?: string
}

// Number formatting shared by tiles and static exports.
export const format_stat_value = (value: string | number): string => {
  if (typeof value === `string`) return value
  if (!Number.isFinite(value)) return `n/a`
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(2)
  return Number.isInteger(value)
    ? value.toLocaleString(`en-US`)
    : Number(value.toPrecision(4)).toString()
}

// Signed change with a direction glyph; the glyph carries the sign, never color alone.
export const format_stat_delta = (delta: number): string =>
  !Number.isFinite(delta)
    ? `n/a`
    : `${delta > 0 ? `▲` : delta < 0 ? `▼` : `▸`} ${format_stat_value(Math.abs(delta))}`

export const stat_delta_label = (delta: number): string =>
  !Number.isFinite(delta)
    ? `change unavailable`
    : `change ${delta > 0 ? `up` : delta < 0 ? `down` : `flat`} ${format_stat_value(Math.abs(delta))}`
