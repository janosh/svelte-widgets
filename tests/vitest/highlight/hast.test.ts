import { readFileSync } from 'node:fs'
import { escape_html_text, hast_to_html, type HastNode } from '#lib/highlight/hast.ts'
import { describe, expect, test } from 'vite-plus/test'

describe(`escape_html_text`, () => {
  test.each([
    [`<span>Fish & Chips</span>`, `&lt;span&gt;Fish &amp; Chips&lt;/span&gt;`],
    [`5 > 3 && 2 < 4`, `5 &gt; 3 &amp;&amp; 2 &lt; 4`],
    // text with nothing to escape takes a fast path and must come back unchanged
    [`const value = "plain 123"`, `const value = "plain 123"`],
    [``, ``],
  ])(`escapes %j`, (input, expected) => {
    expect(escape_html_text(input)).toBe(expected)
  })
})

describe(`hast_to_html`, () => {
  test.each([
    [{ type: `text` }, ``],
    [{ type: `root` }, ``],
    [{ type: `comment`, value: `skip` }, ``],
    [{ type: `element`, children: [{ type: `text`, value: `missing tag` }] }, ``],
    [{ type: `element`, tagName: `em`, children: undefined }, `<em></em>`],
    [
      {
        type: `root`,
        children: [
          {
            type: `element`,
            tagName: `span`,
            properties: { className: [`token`, `string`] },
            children: [{ type: `text`, value: `<hello & bye>` }],
          },
        ],
      },
      `<span class="token string">&lt;hello &amp; bye&gt;</span>`,
    ],
  ] satisfies [HastNode, string][])(`serializes node %#`, (node, expected) => {
    expect(hast_to_html(node)).toBe(expected)
  })
})

// theme.css pairs starry-night's light and dark palettes; a starry-night upgrade that adds or
// recolors a token must show up here rather than leave one theme stale
test(`highlight/theme.css mirrors starry-night's light and dark colors`, () => {
  const read_vars = (path: string) =>
    Object.fromEntries(
      [
        ...readFileSync(path, `utf8`).matchAll(
          /(?<name>--color-prettylights-[\w-]+):\s*(?<value>[^;]+);/g,
        ),
      ].map(({ groups }) => [groups?.name, groups?.value]),
    )
  const style_dir = `node_modules/@wooorm/starry-night/style`
  const [light, dark] = [`light`, `dark`].map((theme) =>
    read_vars(`${style_dir}/${theme}.css`),
  )
  const expected = Object.fromEntries(
    Object.keys(light).map((name) => [name, `light-dark(${light[name]}, ${dark[name]})`]),
  )
  expect(read_vars(`src/lib/highlight/theme.css`)).toEqual(expected)
})
