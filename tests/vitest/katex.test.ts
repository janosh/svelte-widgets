import type { KatexOptions } from 'katex'
import { mdsvex } from 'mdsvex'
import { compile, preprocess } from 'svelte/compiler'
import { heading_ids } from '$lib/heading-anchors'
import { katex_preprocess } from '$lib/katex'
import { describe, expect, it } from 'vitest'

const run = (content: string, filename = `page.md`, options: KatexOptions = {}) => {
  const { before, after } = katex_preprocess(options)
  const mid = before.markup({ content, filename }).code
  return { mid, code: after.markup({ content: mid, filename }).code }
}

const has_katex = (code: string) =>
  code.includes(`{@html`) && code.includes(`katex-html`) && !code.includes(`katex-error`)

const run_pipeline = (source: string) => {
  const { before, after } = katex_preprocess()
  return preprocess(
    source,
    [before, mdsvex({ extensions: [`.md`] }), after, heading_ids()],
    { filename: `page.md` },
  )
}

describe(`katex_preprocess`, () => {
  it.each([
    [`$x$`, false],
    [`$$x + y$$`, true],
    [`$\\frac{1}{2}$`, false],
    [`$$\nx = 1\n$$`, true],
  ])(`renders %j with display mode %j`, (input, display_mode) => {
    const { mid, code } = run(input)
    expect(mid).toMatch(/\uE000katex-[\da-f-]+-[A-Za-z0-9_-]+\uE001/u)
    expect(has_katex(code)).toBe(true)
    expect(code).not.toContain(input.trim())
    expect(code.includes(`katex-display`)).toBe(display_mode)
  })

  it(`does not span display math across paragraphs`, () => {
    const source = [`Cost $$100.`, ``, `Equation:`, ``, `$$x = 1$$`].join(`\n`)
    const { code } = run(source)
    expect(code).toContain(`Cost $$100.`)
    expect(code).toContain(`Equation:`)
    expect(code).not.toContain(`$$x = 1$$`)
    expect(code).toContain(`katex-display`)
  })

  it(`leaves non-markdown files untouched`, () => {
    const source = `$x$ and $$y$$`
    expect(run(source, `App.svelte`).code).toBe(source)
  })

  it(`is a no-op without dollar signs`, () => {
    expect(run(`no math here`).code).toBe(`no math here`)
  })

  it.each([
    `Cost ($/unit)`,
    `Revenue ($)`,
    `price $5`,
    `$5 and $10`, // closing $ followed by digit → not math
    `\\$x$`,
    `\\$$x$$`,
  ])(`leaves non-math dollar syntax %s unchanged`, (input) => {
    expect(run(input).code).toBe(input)
  })

  it.each([
    [`\`\`\`js`, `const y = $x$`, `\`\`\`\``].join(`\n`),
    [`\`\`\`js\r`, `const y = $x$\r`, `\`\`\`\r`].join(`\n`),
    [`\`\`\`js`, `const y = $x$`].join(`\n`),
    [`~~~js`, `const y = $x$`].join(`\n`),
    [`\`\`\`tex`, `$$`, `x`, `$$`, `\`\`\``].join(`\n`),
    `    const y = $x$`,
    `    $$x$$`,
    `use \`$x$\` in text`,
    `use \`\`$x$\`\` in text`,
    `info = \`Point (\${x}, \${y})\``,
    `<!-- $x$ -->`,
    `<!--\n$$\nx\n$$\n-->`,
    `<script>\n$$\nx\n$$\n</script>`,
  ])(`leaves $ inside protected code or comments alone`, (input) => {
    expect(run(input).code).toBe(input)
  })

  it.each([
    `\\begin{pmatrix}\n    a & b \\\\\n\\end{pmatrix}`,
    `\\text{<!-- note -->}`,
    `\\text{\`literal\`}`,
    `\\text{<script>x</script>}`,
    [`\`\`\``, `x`, `\`\`\``].join(`\n`),
  ])(`renders display math containing protected-looking syntax %j`, (tex) =>
    expect(has_katex(run(`$$\n${tex}\n$$`).code)).toBe(true),
  )

  it(`restores overlapping protected regions`, () => {
    const source = `keep \`<script>const x = 1</script>\` and render $x$`
    const { code } = run(source)
    expect(code).toContain(`\`<script>const x = 1</script>\``)
    expect(code).not.toContain(`\0`)
    expect(has_katex(code)).toBe(true)
  })

  it.each([
    {
      description: `script and style blocks`,
      source: [
        `<script>`,
        `  import { page } from '$app/state'`,
        `  let n = $state(0)`,
        `  const s = \`\${n}\``,
        `</script>`,
        ``,
        `Hello $x$`,
        ``,
        `<style>`,
        `  /* $x$ */`,
        `</style>`,
      ].join(`\n`),
      preserved: [`$app/state`, `$state(0)`, `\${n}`, `/* $x$ */`],
      rendered_source: `Hello $x$`,
    },
    {
      description: `fenced live-example scripts`,
      source: [
        `\`\`\`svelte example`,
        `<script>`,
        `  let mode = $state(\`grouped\`)`,
        `</script>`,
        `<input bind:group={mode} />`,
        `\`\`\``,
        ``,
        `See $x$.`,
      ].join(`\n`),
      preserved: [`$state(\`grouped\`)`, `bind:group={mode}`],
      rendered_source: `See $x$.`,
    },
  ])(
    `protects $description while rendering body math`,
    ({ source, preserved, rendered_source }) => {
      const { code } = run(source)
      for (const literal of preserved) expect(code).toContain(literal)
      expect(has_katex(code)).toBe(true)
      expect(code).not.toContain(rendered_source)
    },
  )

  it(`passes macros through to katex`, () => {
    const { code } = run(`$\\RR$`, `page.md`, { macros: { '\\RR': `\\mathbb{R}` } })
    expect(code).toContain(`mathbb`)
  })

  it(`throws on invalid TeX unless the caller opts out`, () => {
    expect(() => run(`$\\notacommand$`)).toThrow(/KaTeX parse error/u)
    const { code } = run(`$\\notacommand$`, `page.md`, { throwOnError: false })
    expect(has_katex(code)).toBe(true)
    expect(code).not.toContain(`$\\notacommand$`)
  })

  it(`handles overlapping passes for the same filename without shared state`, () => {
    const { before, after } = katex_preprocess()
    const first = before.markup({ content: `$x$`, filename: `page.md` }).code
    const second = before.markup({ content: `$y$`, filename: `page.md` }).code
    const first_code = after.markup({ content: first, filename: `page.md` }).code
    const second_code = after.markup({ content: second, filename: `page.md` }).code
    expect(first_code).toContain(`<mi>x</mi>`)
    expect(second_code).toContain(`<mi>y</mi>`)
  })

  it(`does not replace private-use text from the source`, () => {
    const marker = `\uE000katex-deadbeef-SGVsbG8\uE001`
    const { code } = run(`${marker} and $x$`)
    expect(code).toContain(marker)
    expect(has_katex(code)).toBe(true)
  })

  it.each([
    [`## $x$`, `x`],
    [`## $E = mc^2$`, `e-mc-2`],
    [`## $\\{$ Details`, `details`],
  ])(`gives math heading %j the source-derived ID %j`, async (source, expected_id) => {
    const { code } = await run_pipeline(source)
    expect(code).toContain(`<h2 id="${expected_id}">`)
    expect(has_katex(code)).toBe(true)
  })

  it(`survives mdsvex and produces valid Svelte`, async () => {
    const source = [
      `# Math`,
      ``,
      `See $x$.`,
      ``,
      `\`\`\`js`,
      `const literal = \`$y$\``,
      `\`\`\``,
    ].join(`\n`)
    const processed = await run_pipeline(source)
    for (const sentinel of [`\0`, `\uE000`, `\uE001`]) {
      expect(processed.code).not.toContain(sentinel)
    }
    expect(processed.code).toContain(`$y$`)
    expect(has_katex(processed.code)).toBe(true)
    expect(() =>
      compile(processed.code, { filename: `page.svelte`, generate: false }),
    ).not.toThrow()
  })
})
