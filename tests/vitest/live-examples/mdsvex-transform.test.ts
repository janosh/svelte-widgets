import remark, {
  EXAMPLE_COMPONENT_PREFIX,
  EXAMPLE_MODULE_PREFIX,
} from '$lib/live-examples/mdsvex-transform'
import { Buffer } from 'node:buffer'
import { describe, expect, test } from 'vite-plus/test'

interface TestNode {
  type: string
  lang?: string
  meta?: string
  value?: string
  children?: TestNode[]
}

interface TestTree {
  type: string
  children: TestNode[]
}

const create_tree = (children: TestNode[] = []): TestTree => ({ type: `root`, children })
const create_code_node = (lang: string, value: string, meta = ``): TestNode => ({
  type: `code`,
  lang,
  value,
  meta,
})
const create_file = (filename = `/project/src/test.md`, cwd = `/project`) => ({
  filename,
  cwd,
})

const find_script_node = (tree: TestTree): string | undefined =>
  tree.children.find((node) => node.type === `html` && node.value?.includes(`<script>`))
    ?.value

const get_example_value = (tree: TestTree): string => {
  const node = tree.children[0]
  return node.children?.[0]?.value ?? ``
}

describe(`exports`, () => {
  test(`exports stable live-example prefixes`, () => {
    expect(EXAMPLE_MODULE_PREFIX).toBe(`___live_example___`)
    expect(EXAMPLE_COMPONENT_PREFIX).toBe(`LiveExample___`)
  })
})

describe(`code block detection`, () => {
  test(`ignores code blocks without example meta`, () => {
    const tree = create_tree([create_code_node(`svelte`, `<div>Hello</div>`)])
    remark()(tree, create_file())
    expect(tree.children[0]).toMatchObject({ type: `code`, lang: `svelte` })
  })

  test.each([`svelte`, `html`])(`transforms %s code blocks to live examples`, (lang) => {
    const tree = create_tree([create_code_node(lang, `<div>Hello</div>`, `example`)])
    remark()(tree, create_file())
    expect(tree.children[0]).toMatchObject({ type: `paragraph` })
    expect(get_example_value(tree)).toContain(EXAMPLE_COMPONENT_PREFIX)
  })

  test.each([`typescript`, `ts`, `bash`])(
    `transforms %s code blocks as code-only (no live component)`,
    (lang) => {
      const tree = create_tree([create_code_node(lang, `const x = 1`, `example`)])
      remark()(tree, create_file())
      const value = get_example_value(tree)
      expect(value).toContain(`highlight-${lang}`)
      expect(value).not.toContain(EXAMPLE_COMPONENT_PREFIX)
      // An in-flow label would indent the first line of preformatted code.
      expect(value).toMatch(/<span class="lang-label" style="[^"]*position:absolute/)
      expect(value).toContain(
        `<pre class="highlight highlight-${lang}" style="position:relative">`,
      )
    },
  )

  test(`ignores unsupported languages even with example meta`, () => {
    const tree = create_tree([create_code_node(`cobol`, `DISPLAY "hello"`, `example`)])
    remark()(tree, create_file())
    expect(tree.children[0]).toMatchObject({ type: `code`, lang: `cobol` })
  })
})

describe(`meta parsing`, () => {
  test.each([
    [`example id="my-example"`, `"id":"my-example"`],
    [`example count=42`, `"count":42`],
    [`example count=-1.5`, `"count":-1.5`],
    [`example collapsible=true`, `"collapsible":true`],
    [`example tags=[1,2,3]`, `"tags":[1,2,3]`],
    [`example title="say \\"hello\\""`, `"title":"say \\"hello\\""`],
  ])(`parses meta %s containing %s`, (meta, expected) => {
    const tree = create_tree([create_code_node(`svelte`, `<div>Test</div>`, meta)])
    remark()(tree, create_file())
    expect(get_example_value(tree)).toContain(expected)
  })

  test(`example=false disables transformation instead of misparsing as two bare keys`, () => {
    const tree = create_tree([
      create_code_node(`svelte`, `<div>Test</div>`, `example=false`),
    ])
    remark({ defaults: { example: true } })(tree, create_file())
    expect(tree.children[0]).toMatchObject({ type: `code`, lang: `svelte` })
  })

  test.each([`example invalid=[not,valid,json]`, `example bad=word`])(
    `throws on invalid meta value in %s`,
    (meta) => {
      const tree = create_tree([create_code_node(`svelte`, `<div>Test</div>`, meta)])
      expect(() => remark()(tree, create_file())).toThrow(`Unable to parse meta`)
    },
  )
})

describe(`wrapper component handling`, () => {
  test.each([
    {
      desc: `default wrapper`,
      opts: undefined,
      meta: `example`,
      expected: `$lib/CodeExample.svelte`,
    },
    {
      desc: `defaults option`,
      opts: { defaults: { Wrapper: `$lib/Custom.svelte` } },
      meta: `example`,
      expected: `$lib/Custom.svelte`,
    },
    {
      desc: `per-example meta`,
      opts: undefined,
      meta: `example Wrapper="$lib/My.svelte"`,
      expected: `$lib/My.svelte`,
    },
  ])(`uses wrapper from $desc`, ({ opts, meta, expected }) => {
    const tree = create_tree([create_code_node(`svelte`, `<div>Test</div>`, meta)])
    remark(opts)(tree, create_file())
    expect(find_script_node(tree)).toContain(expected)
  })

  test(`generates unique aliases and reuses for same wrapper`, () => {
    const tree = create_tree([
      create_code_node(`svelte`, `<div>1</div>`, `example Wrapper="$lib/A.svelte"`),
      create_code_node(`svelte`, `<div>2</div>`, `example Wrapper="$lib/B.svelte"`),
      create_code_node(`svelte`, `<div>3</div>`, `example Wrapper="$lib/A.svelte"`),
    ])
    remark()(tree, create_file())
    const script = find_script_node(tree) ?? ``
    expect(script).toContain(`Example_0`)
    expect(script).toContain(`Example_1`)
    expect(script).not.toContain(`Example_2`) // reuses Example_0 for $lib/A.svelte
  })
})

describe(`wrapper import paths`, () => {
  test.each([
    [`C:/path/to/wrapper.svelte`, `import Example_0 from "C:/path/to/wrapper.svelte"`],
    [
      `https://example.com/wrapper.svelte`,
      `import Example_0 from "https://example.com/wrapper.svelte"`,
    ],
    [[`widgets`, `CodeExample`], `import { CodeExample as Example_0 } from "widgets"`],
  ])(`imports wrapper %j`, (wrapper, expected) => {
    const tree = create_tree([
      create_code_node(
        `svelte`,
        `<div>Test</div>`,
        `example Wrapper=${JSON.stringify(wrapper)}`,
      ),
    ])
    remark()(tree, create_file())
    expect(find_script_node(tree)).toContain(expected)
  })
})

describe(`CSR mode`, () => {
  test(`generates dynamic import and skips static import`, () => {
    const tree = create_tree([
      create_code_node(`svelte`, `<div>Test</div>`, `example csr`),
    ])
    remark()(tree, create_file())
    const value = get_example_value(tree)
    expect(value).toContain(`{#await import(`)
    expect(value).toContain(`typeof window !== 'undefined'`)
    expect(find_script_node(tree)).not.toContain(`import ${EXAMPLE_COMPONENT_PREFIX}0`)
  })
})

test.each([
  [
    `script via meta`,
    `hide_script`,
    {},
    `<div>Test</div><style>div { color: red }</style>`,
  ],
  [
    `style via defaults`,
    ``,
    { hide_style: true },
    `<script>let x = 1</script><div>Test</div>`,
  ],
  [`both blocks`, `hide_script hide_style`, {}, `<div>Test</div>`],
  [
    `neither block`,
    ``,
    {},
    `<script>let x = 1</script><div>Test</div><style>div { color: red }</style>`,
  ],
] as const)(`hide options: %s`, (_label, meta, defaults, expected) => {
  const code = `<script>let x = 1</script><div>Test</div><style>div { color: red }</style>`
  const tree = create_tree([create_code_node(`svelte`, code, `example ${meta}`)])
  remark({ defaults })(tree, create_file())
  expect(get_example_value(tree)).toContain(`src={${JSON.stringify(expected)}}`)
})

describe(`script block injection`, () => {
  test(`creates new script block when none exists`, () => {
    const tree = create_tree([create_code_node(`svelte`, `<div>Test</div>`, `example`)])
    remark()(tree, create_file())
    expect(find_script_node(tree)).toMatch(/<script>[\s\S]*<\/script>/u)
  })

  test.each([
    [`plain script`, `<script>const existing = true</script>`],
    [
      `common attributes`,
      `<script lang="ts" context="module" data-url=/api/foo-bar_1.2:run>const existing = true</script>`,
    ],
  ])(`adds imports to existing script block: %s`, (_label, script_block) => {
    const tree = create_tree([
      { type: `html`, value: script_block },
      create_code_node(`svelte`, `<div>Test</div>`, `example`),
    ])
    remark()(tree, create_file())
    const script_nodes = tree.children.filter((node) => node.value?.startsWith(`<script`))
    expect(script_nodes).toHaveLength(1)
    expect(script_nodes[0].value).toContain(`import Example_0`)
    expect(script_nodes[0].value).toContain(`const existing`)
  })

  test(`skips html nodes merely containing <script> mid-content`, () => {
    const decoy = `<pre>{@html \`<script>evil</script>\`}</pre>`
    const tree = create_tree([
      { type: `html`, value: decoy },
      create_code_node(`svelte`, `<div>Test</div>`, `example`),
    ])
    remark()(tree, create_file())
    expect(tree.children[0].value).toBe(decoy)
    const script = tree.children.find((node) => node.value?.startsWith(`<script>`))
    expect(script?.value).toContain(`import Example_0`)
  })

  test(`leaves tree untouched when file contains no examples`, () => {
    const tree = create_tree([{ type: `html`, value: `<p>No examples here</p>` }])
    remark()(tree, create_file())
    expect(tree.children).toEqual([{ type: `html`, value: `<p>No examples here</p>` }])
  })
})

describe(`multiple examples`, () => {
  test(`handles multiple examples with incrementing indices`, () => {
    const tree = create_tree([
      create_code_node(`svelte`, `<div>First</div>`, `example`),
      create_code_node(`svelte`, `<div>Second</div>`, `example`),
      create_code_node(`svelte`, `<div>Third</div>`, `example`),
    ])
    remark()(tree, create_file())
    const script = find_script_node(tree) ?? ``
    for (const idx of [0, 1, 2]) {
      expect(script).toContain(`${EXAMPLE_COMPONENT_PREFIX}${idx}`)
      expect(script).toContain(`${EXAMPLE_MODULE_PREFIX}${idx}.svelte`)
    }
  })

  test(`mixes live and code-only examples correctly`, () => {
    const tree = create_tree([
      create_code_node(`svelte`, `<div>Live</div>`, `example`),
      create_code_node(`typescript`, `const x = 1`, `example`),
      create_code_node(`svelte`, `<div>Live2</div>`, `example`),
    ])
    remark()(tree, create_file())
    const script = find_script_node(tree) ?? ``
    expect(script).toContain(`${EXAMPLE_COMPONENT_PREFIX}0`)
    expect(script).toContain(`${EXAMPLE_COMPONENT_PREFIX}1`)
    expect(script).not.toContain(`${EXAMPLE_COMPONENT_PREFIX}2`)
  })
})

describe(`output handling`, () => {
  test.each([
    {
      desc: `extracts relative filename`,
      code: `<div>Test</div>`,
      expected: `src/routes/demo/+page.md`,
      filename: `/project/src/routes/demo/+page.md`,
    },
    {
      desc: `produces highlighted HTML`,
      code: `<script>let x = 1</script>`,
      expected: `<span`,
      filename: `/project/src/test.md`,
    },
    {
      desc: `escapes newlines`,
      code: `<script>\nlet x = 1\n</script>`,
      expected: `&#10;`,
      filename: `/project/src/test.md`,
    },
  ])(`$desc`, ({ code, expected, filename }) => {
    const tree = create_tree([create_code_node(`svelte`, code, `example`)])
    remark()(tree, create_file(filename, `/project`))
    expect(get_example_value(tree)).toContain(expected)
  })

  test.each([
    `const fn = () => \`hello \${1 + 1}\``,
    `<div>plain</div>`,
    `<div>{$\`template\`}</div>`,
    `<script>const x = $\{value}</script>`,
    `let s = "double \\" quote"`,
  ])(`src prop round-trips %s without double-escaping`, (code) => {
    const tree = create_tree([create_code_node(`svelte`, code, `example`)])
    remark()(tree, create_file())
    // Parse the generated string literal to catch double escaping.
    const match = /\n\s+src=\{(?<src>".*?[^\\]")\}/su.exec(get_example_value(tree))
    expect(match).not.toBeNull()
    expect(JSON.parse(match?.groups?.src ?? ``)).toBe(code)
    expect(get_example_value(tree)).toContain(
      `__live_example_src={"${Buffer.from(code).toString(`base64`)}"}`,
    )
  })
})
