import { escape_html_text, hast_to_html, type HastNode } from '$lib/live-examples/hast'
import { describe, expect, test } from 'vitest'

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
  test(`serializes root, element classes, nested text, and escaping`, () => {
    const tree: HastNode = {
      type: `root`,
      children: [
        {
          type: `element`,
          tagName: `span`,
          properties: { className: [`token`, `string`] },
          children: [{ type: `text`, value: `<hello & bye>` }],
        },
      ],
    }

    expect(hast_to_html(tree)).toBe(
      `<span class="token string">&lt;hello &amp; bye&gt;</span>`,
    )
  })

  test.each([
    [{ type: `text` }, ``],
    [{ type: `root` }, ``],
    [{ type: `comment`, value: `skip` }, ``],
    [{ type: `element`, children: [{ type: `text`, value: `missing tag` }] }, ``],
    [{ type: `element`, tagName: `em`, children: undefined }, `<em></em>`],
  ] satisfies [HastNode, string][])(`serializes edge node %#`, (node, expected) => {
    expect(hast_to_html(node)).toBe(expected)
  })
})
