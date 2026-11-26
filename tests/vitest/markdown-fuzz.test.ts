// Seeded property test: random small Markdown documents mixing quotes, lists, lazy lines,
// indented lines, headings, fences, setext underlines and CRLF must parse and render without
// diagnostics, with every link and heading mapped back to its source offset. No tabs: Marked
// rewrites them past exact matching, and those positions are only best effort (line-accurate).
import { create_markdown } from '#lib/markdown/index.ts'
import { Lexer } from 'marked'
import { expect, test } from 'vite-plus/test'

// Numerical Recipes LCG, so runs are reproducible without a dependency. FUZZ_SEED and
// FUZZ_COUNT explore beyond the default run: `FUZZ_SEED=7 FUZZ_COUNT=100000 vp test run ...`
let rng_state = Number(process.env.FUZZ_SEED ?? 1)
const pick = <T>(items: readonly T[]): T => {
  rng_state = (Math.imul(rng_state, 1_664_525) + 1_013_904_223) >>> 0
  return items[Math.floor((rng_state / 2 ** 32) * items.length)]
}

// Links `[a3](a3)` and headings `# H4` share one counter, so each occurs once in the source
// and its expected offset is a plain indexOf.
const generate = (): string => {
  let id = 0
  const link = () => `[a${++id}](a${id})`
  const contents = {
    list: () =>
      pick([`-`, `*`, `+`, `1.`, `10)`]) +
      pick([` `, ` `]) +
      pick([`y`, link(), `> ${link()}`, `- ${link()}`]),
    lazy: () => pick([`a`, `b c`]),
    link,
    heading: () => `${pick([`#`, `##`])} H${++id}`,
    fence: () => pick([`~~~`, '```']),
    setext: () => pick([`---`, `===`, `-`]),
    indented: () => pick([`  `, `    `]) + pick([`x`, link(), `> ${link()}`]),
    blank: () => ``,
  }
  const kinds = [...Object.keys(contents), `list`, `link`] as (keyof typeof contents)[]
  const lines = Array.from({ length: pick([2, 3, 4, 5, 6, 7, 8]) }, (_, line_idx) => {
    const indent = pick([``, ``, ` `, `  `, `   `, `    `])
    const quote = pick([``, ``, `>`, `>`, `> >`, `>>`])
    const gap = quote ? pick([` `, ``, `  `]) : ``
    const line = indent + quote + gap + contents[pick(kinds)]()
    // A leading `---` line opens YAML frontmatter, which is not under test here
    return line_idx === 0 && line === `---` ? `===` : line
  })
  return lines.join(pick([`\n`, `\n`, `\n`, `\r\n`]))
}

// marked 18.3.0 itself throws on some inputs, e.g. `- )\n  >-\n)` raises
// "Cannot read properties of undefined (reading 'raw')". Upstream bug, so skip those.
const marked_throws = (source: string) => {
  try {
    Lexer.lex(source)
    return false
  } catch {
    return true
  }
}

const engine = create_markdown()
const checked = { links: 0, headings: 0 }

// Every broken invariant for one source, empty when it maps cleanly
const problems = async (source: string): Promise<string[]> => {
  const parsed = await engine.parse(source, { filename: `/g.md`, dialect: `markdown` })
  if (!parsed.ok) return parsed.diagnostics.map(({ message }) => `parse: ${message}`)
  const { links, headings } = parsed.value.manifest
  const found = links.flatMap(({ url, range: { start, end } }) => {
    checked.links++
    const raw = `[${url}](${url})`
    const expected = source.indexOf(raw)
    return start.offset === expected && end.offset === expected + raw.length
      ? []
      : [`link ${url} at ${start.offset}-${end.offset}, expected ${expected}`]
  })
  for (const { text, range } of headings) {
    if (!/^H\d+$/u.test(text)) continue // setext headings
    checked.headings++
    const { start, end } = range
    // An ATX heading's range spans up to 3 columns of indent, all its `#`s and its text
    const text_start = source.indexOf(` ${text}`) + 1
    const before_text = source.slice(start.offset, text_start - 1)
    const whole_marker =
      /^[ \t]{0,3}#+$/u.test(before_text) && source[start.offset - 1] !== `#`
    if (!whole_marker || end.offset !== text_start + text.length)
      found.push(
        `heading ${text} at ${start.offset}-${end.offset} after ${JSON.stringify(before_text)}`,
      )
  }
  const rendered = await engine.render(source, { filename: `/g.md` })
  if (!rendered.ok)
    found.push(...rendered.diagnostics.map(({ message }) => `render: ${message}`))
  return found
}

// Greedily delete characters while the first problem keeps its shape (digits and quoted
// text masked), so failures report a near-minimal reproducer
const shrink = async (source: string): Promise<string> => {
  const signature = async (candidate: string) =>
    marked_throws(candidate)
      ? undefined
      : (await problems(candidate))[0]?.replaceAll(/\d+|".*"/gu, `_`)
  const target = await signature(source)
  let current = source
  for (let previous = ``; previous !== current;) {
    previous = current
    for (let idx = 0; idx < current.length;) {
      const candidate = current.slice(0, idx) + current.slice(idx + 1)
      if ((await signature(candidate)) === target) current = candidate
      else idx++
    }
  }
  return current
}

test(`random Markdown documents map links and headings to their source offsets`, async () => {
  const count = Number(process.env.FUZZ_COUNT ?? 10_000)
  for (let idx = 0; idx < count; idx++) {
    const source = generate()
    if (marked_throws(source)) continue
    const found = await problems(source)
    if (found.length)
      expect.fail(
        `case ${idx}: ${found.join(`; `)}\nminimal: ${JSON.stringify(await shrink(source))}\nsource: ${JSON.stringify(source)}`,
      )
  }
  // Guard against a generator change that silently stops exercising the mapping
  expect(checked.links).toBeGreaterThan(count)
  expect(checked.headings).toBeGreaterThan(count / 4)
})
