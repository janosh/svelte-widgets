export function get_heading_visibility(
  levels: readonly number[],
  active_idx: number | null,
  collapse_threshold: number,
): boolean[] {
  if (active_idx === null) return levels.map(() => true)

  const min_level = levels.reduce((minimum, level) => Math.min(minimum, level), Infinity)
  const expanded = levels.map(() => false)

  if (active_idx !== -1) {
    expanded[active_idx] = true
    let need = levels[active_idx]
    for (let idx = active_idx - 1; idx >= 0 && need > min_level; idx--) {
      if (levels[idx] < need) {
        expanded[idx] = true
        need = levels[idx]
      }
    }
  }

  const visible: boolean[] = []
  const ancestors: number[] = []
  let threshold_ancestor = -1
  for (let idx = 0; idx < levels.length; idx++) {
    const level = levels[idx]
    while (ancestors.length && levels[ancestors[ancestors.length - 1]] >= level)
      ancestors.pop()
    const parent_idx = ancestors.at(-1)

    if (level === min_level) {
      visible.push(true)
    } else if (level <= collapse_threshold) {
      visible.push(parent_idx === undefined || expanded[parent_idx])
    } else {
      visible.push(
        threshold_ancestor < 0 ||
          levels[threshold_ancestor] < collapse_threshold ||
          visible[threshold_ancestor],
      )
    }
    ancestors.push(idx)
    if (level <= collapse_threshold) threshold_ancestor = idx
  }

  return visible
}
