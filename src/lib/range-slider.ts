export type RangeValue = [number, number]
export type RangeScale = 'linear' | 'log'

// Coordinates use real units on a linear scale and base-10 exponents on a log scale.
// Keep the original endpoints: exponentiating their logarithms need not reproduce them.
export const create_range_scale = (min: number, max: number, scale: RangeScale) => {
  if (scale !== `linear` && scale !== `log`) {
    throw new Error(`Unknown range scale: ${scale}`)
  }
  const to_position = scale === `log` ? Math.log10 : (value: number) => value
  const floor = to_position(min)
  const ceiling = to_position(max)
  if (
    scale === `log` &&
    (!(min > 0) || ![floor, ceiling].every(Number.isFinite) || floor >= ceiling)
  ) {
    throw new Error(
      `Logarithmic range needs finite 0 < min < max with distinct logarithms; got min=${min}, max=${max}`,
    )
  }
  const from_position = (position: number): number =>
    position <= floor
      ? min
      : position >= ceiling
        ? max
        : scale === `log`
          ? 10 ** position
          : position
  const validate_step = (step: number, component = `RangeSlider`): void => {
    const magnitude = Math.max(Math.abs(floor), Math.abs(ceiling), ceiling - floor)
    // Include the span: min + index * step can lose increments in either intermediate.
    let exponent = Math.floor(Math.log2(magnitude))
    if (2 ** exponent > magnitude) exponent--
    const spacing = Math.max(Number.MIN_VALUE, 2 ** (exponent - 52))
    if (
      ![floor, ceiling, step, ceiling - floor].every(Number.isFinite) ||
      floor >= ceiling ||
      step <= 0 ||
      step < spacing ||
      floor + step === floor ||
      ceiling - step === ceiling ||
      (ceiling - floor) / step > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        `${component} needs finite min < max and a positive, representable step; got min=${floor}, max=${ceiling}, step=${step}`,
      )
    }
    if (
      scale === `log` &&
      (from_position(floor + step) <= min || from_position(ceiling - step) >= max)
    ) {
      throw new Error(
        `${component} logarithmic step must change a representable value; got min=${min}, max=${max}, step=${step}`,
      )
    }
  }
  return { min: floor, max: ceiling, to_position, from_position, validate_step }
}

// Signed grid steps or an endpoint. Zero horizontal direction leaves Left/Right and
// Home/End to native text editing; Shift and Page keys move ten steps.
export const range_key_action = (
  event: KeyboardEvent,
  horizontal: -1 | 0 | 1,
): number | `min` | `max` | undefined => {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return undefined
  const { key, shiftKey: shift } = event
  if (horizontal && key === `Home`) return `min`
  if (horizontal && key === `End`) return `max`
  let direction = 0
  if (key === `ArrowUp` || key === `PageUp`) direction = 1
  else if (key === `ArrowDown` || key === `PageDown`) direction = -1
  else if (key === `ArrowRight`) direction = horizontal
  else if (key === `ArrowLeft`) direction = -horizontal
  if (direction) return direction * (key.startsWith(`Page`) || shift ? 10 : 1)
  return undefined
}

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

// log10(10 ** coordinate) can land beside its original grid point. Recognize that
// point by exact reconstruction so an arrow cannot stop on the same real value.
export const step_range_coordinate = (
  value: number,
  domain: ReturnType<typeof create_range_scale>,
  step: number,
  direction: number,
  stride: number,
): number => {
  const coordinate = domain.to_position(value)
  const snapped = snap_range_value(coordinate, domain.min, domain.max, step)
  const baseline = domain.from_position(snapped) === value ? snapped : coordinate
  let next = step_range_value(baseline, domain.min, domain.max, step, direction, stride)
  const limit = direction > 0 ? domain.max : domain.min
  // Distinct exponents can reconstruct the same real value, especially when stepping
  // from an off-grid value. Skip those points while preserving the initial stride.
  while (direction * (domain.from_position(next) - value) <= 0 && next !== limit) {
    next = step_range_value(next, domain.min, domain.max, step, direction, 1)
  }
  return next
}

export const validate_range = (
  value: readonly [number, number],
  min: number,
  max: number,
  step: number,
  scale: RangeScale = `linear`,
  component = `RangeSlider`,
): void => {
  create_range_scale(min, max, scale).validate_step(step, component)
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
