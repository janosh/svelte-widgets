import { validate_content } from '$lib/markdown'
import {
  compile_source as compile_markdown,
  render_source as render_markdown,
} from './markdown-helpers'
import { compile } from 'svelte/compiler'
import { describe, expect, test } from 'vitest'

const bibliography = {
  doe2020: {
    title: `A <new> theory {with braces}`,
    authors: [`Jane Doe`],
    year: 2020,
    doi: `10.1234/example`,
  },
  roe2021: {
    title: `Follow-up`,
    authors: [`Richard Roe`],
    year: 2021,
    url: `https://example.org/paper?a=1&b=2`,
  },
}

describe(`Scientific Markdown references`, () => {
  test(`numbers forward equations, figures and citations consistently in HTML and Svelte`, async () => {
    const source = `---\ntitle: Paper\n---\nSee [@fig:plot], [@eq:energy] and [@doe2020; @roe2021].\n\n$$ {#eq:energy label="Mass & energy"}\nE=mc^2\n$$\n\n![Energy &amp; mass](./plot.svg?x=1&amp;y=2){#fig:plot}\n\nAgain [@doe2020], [@fig:plot].\n\n![Unreferenced "figure" {caption}](./plot.svg){#fig:extra label="Short <figure> {title}"}\n\n$$ {#eq:unused}\nx=1\n$$\n\n![](./plot.svg){#fig:unlabeled}`
    const options = { math: true, references: { bibliography }, filename: `/paper.md` }
    const result = await compile_markdown(source, options)
    compile(result.code, { generate: false })
    const html = await render_markdown(source, options)
    for (const output of [result.code, html]) {
      expect(output).toContain(`href="#eq:energy">Equation (1)</a>`)
      expect(output).toContain(`id="fig:plot"`)
      expect(output).toContain(`Figure 1.</a> Energy &amp; mass`)
      expect(output).toContain(`data-reference-label="1 · Energy &amp; mass"`)
      expect(output).toContain(`data-reference-label="Equation 2"`)
      expect(output).toContain(`data-reference-label="Figure 3"`)
      expect(output).toContain(`data-reference-label="1 · Mass &amp; energy"`)
      expect(output).toContain(
        `data-reference-label="2 · Short &lt;figure&gt; &#123;title&#125;"`,
      )
      expect(output).toContain(`id="cite:doe2020" value="1"`)
      expect(output).toContain(`id="cite:roe2021" value="2"`)
      expect(output).toContain(`A &lt;new&gt; theory &#123;with braces&#125;`)
      expect(output).toContain(`https://doi.org/10.1234/example`)
    }
    expect(result.manifest.references.map(({ key, number }) => [key, number])).toEqual([
      [`fig:plot`, 1],
      [`eq:energy`, 1],
      [`doe2020`, 1],
      [`roe2021`, 2],
      [`doe2020`, 1],
      [`fig:plot`, 1],
    ])
    expect(result.manifest.reference_definitions).toMatchObject([
      {
        kind: `equation`,
        number: 1,
        target: `eq:energy`,
        label: `Mass & energy`,
        range: { start: { line: 6 } },
      },
      { kind: `figure`, number: 1, target: `fig:plot`, caption: `Energy & mass` },
      {
        kind: `figure`,
        number: 2,
        target: `fig:extra`,
        caption: `Unreferenced "figure" {caption}`,
        label: `Short <figure> {title}`,
      },
      { kind: `equation`, number: 2, target: `eq:unused` },
      { kind: `figure`, number: 3, target: `fig:unlabeled` },
    ])
    expect(result.manifest.assets).toMatchObject([
      {
        url: `./plot.svg?x=1&y=2`,
        text: `Energy & mass`,
        range: { start: { line: 10 } },
      },
      { url: `./plot.svg`, text: `Unreferenced "figure" {caption}` },
      { url: `./plot.svg`, text: `` },
    ])
    expect(validate_content([result.manifest], { assets: [`/plot.svg`] })).toEqual([])
    expect(result.manifest.headings.at(-1)).toMatchObject({
      id: `bibliography`,
      text: `References`,
    })
  })

  test(`places an explicit bibliography and ignores code, scripts and math contents`, async () => {
    const source = `> Citation [@doe2020].\n\nBefore bibliography.\n  :::\t bibliography\n\nAfter bibliography.\n\n\`[@missing]\`\n\n\`\`\`text\n[@missing]\n\`\`\`\n\n<script>const label = '[@missing]'</script>\n\n$$\n\\text{[@missing]}\n$$`
    const result = await compile_markdown(source, {
      math: true,
      references: { bibliography },
    })
    compile(result.code, { generate: false })
    expect(result.code.indexOf(`class="bibliography"`)).toBeLessThan(
      result.code.indexOf(`After bibliography`),
    )
    expect(result.code.match(/class="bibliography"/gu)).toHaveLength(1)
    expect(result.manifest.references).toHaveLength(1)
    expect(result.manifest.reference_definitions).toEqual([])
    expect(result.manifest.references[0].range.start).toMatchObject({
      line: 1,
      column: 12,
    })
  })

  test.each([
    [
      `![Plot](plot.svg){#fig:plot label=42}`,
      `Reference label must be a nonempty string`,
    ],
    [`$$ {#eq:energy label=""}\nE=mc^2\n$$`, `Reference label must be a nonempty string`],
    [`![Plot](plot.svg){#fig:plot title="Wrong key"}`, `Unknown reference option: title`],
    [
      `![Plot](plot.svg){#fig:plot label="First" label="Second"}`,
      `Duplicate code fence option: label`,
    ],
    [
      `# Paper\n\n> See [@missing].`,
      `paper.md:3:7 [reference] Unresolved reference missing`,
    ],
    [
      `![One](a.svg){#fig:one}\n\n![Two](b.svg){#fig:one}`,
      `paper.md:3:1 [reference] Duplicate reference label fig:one`,
    ],
    [`$$ {#eq:test}\nx\n$$`, `requires math: true`],
    [`::: bibliography\n\n::: bibliography`, `Only one bibliography directive`],
    [`<div id="fig:one"></div>\n\n![One](a.svg){#fig:one}`, `Duplicate anchor #fig:one`],
  ])(`rejects invalid references in %s`, async (source, message) => {
    await expect(
      compile_markdown(source, { filename: `paper.md`, references: true }),
    ).rejects.toThrow(message)
  })

  test(`rejects unsafe citation URLs and remains opt-in`, async () => {
    await expect(
      render_markdown(`[@bad]`, {
        references: {
          bibliography: { bad: { title: `Bad`, url: `javascript:alert(1)` } },
        },
      }),
    ).rejects.toThrow(`Invalid bibliography URL for bad`)
    expect(await render_markdown(`[@unknown]`)).toContain(`[@unknown]`)
    const escaped_figure = await compile_markdown(
      `![Literal {value}](./plot.svg){#fig:literal}`,
      { references: true },
    )
    compile(escaped_figure.code, { generate: false })
    expect(escaped_figure.code).toContain(`alt="Literal &#123;value&#125;"`)
    const titled = await compile_markdown(`# Bibliography\n\n[@doe2020]`, {
      references: { bibliography },
    })
    expect(titled.manifest.headings.map(({ id }) => id)).toEqual([
      `bibliography-1`,
      `bibliography`,
    ])
  })
})
