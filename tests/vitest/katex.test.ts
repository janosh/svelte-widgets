/* oxlint-disable no-template-curly-in-string -- Literal JavaScript fixtures. */
import { heading_ids } from '$lib/heading-anchors'
import { compile_markdown, markdown, render_markdown } from '$lib/markdown'
import { compile, preprocess } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'

const has_math = (html: string) => html.includes(`katex-html`)

describe(`Markdown math`, () => {
  it.each([
    [`$x$`, false],
    [`$$x + y$$`, true],
    [`$\\frac{1}{2}$`, false],
    [`$$\nx = 1\n$$`, true],
  ])(`renders %j with display mode %j`, async (source, display_mode) => {
    const html = await render_markdown(source, { math: true })
    expect(has_math(html)).toBe(true)
    expect(html.includes(`katex-display`)).toBe(display_mode)
  })

  it.each([
    `Cost ($/unit)`,
    `Revenue ($)`,
    `price $5`,
    `$5 and $10`,
    `\\$x$`,
    `\\$$x$$`,
    '```js\nconst value = $x$\n````',
    '```js\r\nconst value = $x$\r\n```',
    '```js\nconst value = $x$',
    '~~~js\nconst value = $x$',
    '```tex\n$$\nx\n$$\n```',
    `    const value = $x$`,
    `    $$x$$`,
    'use `$x$` in text',
    'use ``$x$`` in text',
    'info = `Point (${x}, ${y})`',
    `Text <code>$x$</code>`,
    `Text <pre>$x$</pre>`,
    `<!-- $x$ -->`,
    `<!--\n$$\nx\n$$\n-->`,
    `<script>\n$$\nx\n$$\n</script>`,
  ])(`does not render protected or non-math syntax %j`, async (source) => {
    expect(has_math(await render_markdown(source, { math: true }))).toBe(false)
  })

  it.each([
    `\\begin{pmatrix}\n    a & b \\\\\n\\end{pmatrix}`,
    `\\text{<!-- note -->}`,
    '\\text{`literal`}',
    `\\text{<script>x</script>}`,
    '```\nx\n```',
  ])(`renders display math containing Markdown-like syntax %j`, async (tex) => {
    expect(has_math(await render_markdown(`$$\n${tex}\n$$`, { math: true }))).toBe(true)
  })

  it(`respects paragraph boundaries, macro options and explicit error behavior`, async () => {
    const html = await render_markdown(`Cost $$100.\n\nEquation:\n\n$$\\RR$$`, {
      math: { macros: { '\\RR': `\\mathbb{R}` } },
    })
    expect(html).toContain(`Cost $$100.`)
    expect(html).toContain(`mathbb`)
    await expect(render_markdown(`$\\notacommand$`, { math: true })).rejects.toThrow(
      `KaTeX parse error`,
    )
    expect(
      has_math(
        await render_markdown(`$\\notacommand$`, { math: { throwOnError: false } }),
      ),
    ).toBe(true)
  })

  it(`keeps concurrent documents and authored private-use characters isolated`, async () => {
    const marker = `\uE000widgets0\uE001`
    const results = await Promise.all(
      [`x`, `y`].map((name) =>
        compile_markdown(`${marker} $${name}$`, { math: true, filename: `page.md` }),
      ),
    )
    for (const [idx, result] of results.entries()) {
      expect(result.code).toContain(marker)
      expect(result.code.replaceAll(`\\u003c`, `<`)).toContain(
        `<mi>${idx ? `y` : `x`}</mi>`,
      )
    }
  })

  it.each([
    [`## $x$`, `x`],
    [`## $E = mc^2$`, `e-mc-2`],
    [`## $\\{$ Details`, `details`],
  ])(`maps math heading %j to ID %j and valid Svelte`, async (source, expected_id) => {
    const { code } = await preprocess(source, [markdown({ math: true }), heading_ids()], {
      filename: `page.md`,
    })
    expect(code).toContain(`<h2 id="${expected_id}">`)
    expect(has_math(code)).toBe(true)
    compile(code, { generate: false })
  })
})
