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
  // Round before choosing notation: 999999.9 must not print as the ungrouped `1000000`
  const rounded = Number.isInteger(value) ? value : Number(value.toPrecision(4))
  const abs = Math.abs(rounded)
  if (abs === 0) return `0` // also drops the sign of -0
  if (abs >= 1e6 || abs < 1e-3) return rounded.toExponential(2)
  return rounded.toLocaleString(`en-US`, { maximumFractionDigits: 20 })
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
