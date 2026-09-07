export type WalkthroughStep = {
  id: string
  title: string
  description?: string
  code: string
  language?: string
  before?: string
  focus_lines?: readonly number[]
  annotations?: Readonly<Record<number, string>>
}

export type WalkthroughLine = {
  text: string
  kind: `context` | `added` | `removed`
  before_line?: number
  after_line?: number
}

// A linear prefix/suffix diff keeps long walkthroughs responsive. The middle is one
// replacement hunk rather than an expensive minimal edit search; both texts reconstruct exactly.
export function walkthrough_lines(step: WalkthroughStep): WalkthroughLine[] {
  const after = step.code.split(/\r?\n/u)
  const before = step.before?.split(/\r?\n/u)
  if (!before)
    return after.map((text, idx) => ({ text, kind: `context`, after_line: idx + 1 }))
  let prefix = 0
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix++
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++
  const lines: WalkthroughLine[] = []
  for (let idx = 0; idx < prefix; idx++)
    lines.push({
      text: after[idx],
      kind: `context`,
      before_line: idx + 1,
      after_line: idx + 1,
    })
  for (let idx = prefix; idx < before.length - suffix; idx++)
    lines.push({ text: before[idx], kind: `removed`, before_line: idx + 1 })
  for (let idx = prefix; idx < after.length - suffix; idx++)
    lines.push({ text: after[idx], kind: `added`, after_line: idx + 1 })
  for (let idx = 0; idx < suffix; idx++)
    lines.push({
      text: after[after.length - suffix + idx],
      kind: `context`,
      before_line: before.length - suffix + idx + 1,
      after_line: after.length - suffix + idx + 1,
    })
  return lines
}

export function validate_walkthrough(steps: readonly WalkthroughStep[]): void {
  if (!steps.length) throw new Error(`CodeWalkthrough needs at least one step`)
  const ids = new Set<string>()
  for (const step of steps) {
    if (!step.id.trim() || ids.has(step.id))
      throw new Error(`CodeWalkthrough step id must be nonempty and unique: ${step.id}`)
    ids.add(step.id)
    const length = step.code.split(/\r?\n/u).length
    for (const line of [
      ...(step.focus_lines ?? []),
      ...Object.keys(step.annotations ?? {}).map(Number),
    ]) {
      if (!Number.isInteger(line) || line < 1 || line > length)
        throw new Error(
          `CodeWalkthrough step ${step.id}: line ${line} is outside 1..${length}`,
        )
    }
  }
}
