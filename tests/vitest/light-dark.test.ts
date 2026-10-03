import { globSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// light-dark() only accepts colors. A whole `1px solid red` or box-shadow inside it makes the
// declaration invalid at computed-value time, so the border or shadow silently vanishes
// (DraggablePane, Nav, Toc and MultiSelect shipped without their shadows that way).
const call_args = (text: string, open_idx: number): string[] => {
  const args: string[] = []
  let [depth, current] = [0, ``]
  for (const char of text.slice(open_idx)) {
    if (char === `(` && depth++ === 0) continue
    if (char === `)` && --depth === 0) return [...args, current]
    if (char === `,` && depth === 1) {
      args.push(current)
      current = ``
    } else current += char
  }
  return args
}

test(`light-dark() is only given colors`, () => {
  const offenders: string[] = []
  for (const file of globSync(`src/**/*.{svelte,css,ts}`)) {
    const text = readFileSync(file, `utf8`)
    for (const match of text.matchAll(/light-dark\(/g)) {
      for (const arg of call_args(text, match.index + `light-dark`.length)) {
        // nested function calls (rgba(), var(), color-mix()) count as one color token
        const flat = arg
          .replaceAll(/\([^()]*\)/g, `()`)
          .replaceAll(/\([^()]*\)/g, `()`)
          .trim()
        if (/\s/.test(flat) || flat === `none`) {
          const line = text.slice(0, match.index).split(`\n`).length
          offenders.push(`${file}:${line}: ${arg.trim()}`)
        }
      }
    }
  }
  expect(offenders).toEqual([])
})
