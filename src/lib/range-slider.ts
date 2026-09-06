export type RangeValue = [number, number]

const grid_value = (index: number, min: number, step: number): number => {
  const raw = min + index * step
  const decimal_places = (number: number): number => {
    const [coefficient, exponent = `0`] = String(number).split(`e`)
    return Math.max(0, (coefficient.split(`.`)[1]?.length ?? 0) - Number(exponent))
  }
  const precision = Math.max(decimal_places(min), decimal_places(step))
  // toFixed removes arithmetic tails at the grid's own decimal precision, not an
  // arbitrary significant-digit cutoff. Very small exponents exceed its 100-digit limit.
  return precision <= 100 ? Number(raw.toFixed(precision)) : raw
}

// Steps are anchored at min; max is also selectable when the span is not divisible by step.
export const snap_range_value = (
  value: number,
  min: number,
  max: number,
  step: number,
): number => {
  if (value <= min) return min
  if (value >= max) return max
  const index = Math.round((value - min) / step)
  let rounded = grid_value(index, min, step)
  // Division can land on the neighboring index at large magnitudes. Compare actual
  // representable points so snapping a grid point cannot move it to another one.
  for (const neighbor of [index - 1, index + 1]) {
    const candidate = grid_value(neighbor, min, step)
    if (Math.abs(candidate - value) < Math.abs(rounded - value)) rounded = candidate
  }
  const nearest = Math.abs(max - value) < Math.abs(rounded - value) ? max : rounded
  return Math.max(min, Math.min(max, nearest))
}

// Walk adjacent grid points rather than subtracting from an off-grid endpoint or draft.
export const step_range_value = (
  value: number,
  min: number,
  max: number,
  step: number,
  direction: number,
  stride: number,
): number => {
  const index = Math.round((value - min) / step)
  const nearest = grid_value(index, min, step)
  const offset = direction * (stride - (direction * (nearest - value) > 0 ? 1 : 0))
  let next_index = index + offset
  const bounded_value = (): number =>
    Math.max(min, Math.min(max, grid_value(next_index, min, step)))
  let next = bounded_value()
  const limit = direction > 0 ? max : min
  // At large offsets adjacent grid indices can round to the same number. A keyboard
  // step must still move in its requested direction unless already at that boundary.
  while (direction * (next - value) <= 0 && next !== limit) {
    next_index += direction
    next = bounded_value()
  }
  return next
}

export const validate_range = (
  value: readonly [number, number],
  min: number,
  max: number,
  step: number,
): void => {
  const magnitude = Math.max(Math.abs(min), Math.abs(max), max - min)
  // Include the span: min + index * step can lose increments in either intermediate.
  let exponent = Math.floor(Math.log2(magnitude))
  if (2 ** exponent > magnitude) exponent--
  const spacing = Math.max(Number.MIN_VALUE, 2 ** (exponent - 52))
  if (
    ![min, max, step, max - min].every(Number.isFinite) ||
    min >= max ||
    step <= 0 ||
    step < spacing ||
    min + step === min ||
    max - step === max ||
    (max - min) / step > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      `RangeSlider needs finite min < max and a positive, representable step; got min=${min}, max=${max}, step=${step}`,
    )
  }
  if (
    value.length !== 2 ||
    !value.every(Number.isFinite) ||
    value[0] < min ||
    value[1] > max ||
    value[0] > value[1]
  ) {
    throw new Error(
      `RangeSlider value must be an ordered pair within [${min}, ${max}]; got [${value}]`,
    )
  }
}
