import { load } from '#root/src/routes/(demos)/(display)/theming/+page.server.ts'
import { collect_css_vars, css_var_group, extract_css_vars } from '#site/css-vars.ts'
import { expect, test } from 'vite-plus/test'

const runtime = `set by component at runtime`

// reads as [name, fallback, property], sets as [name, value, kind]
test.each<[string, string, string, (string | null)[][], string[][]]>([
  [
    `CSS: nested, multi-line and empty fallbacks, custom property targets, comments`,
    `a.css`,
    `/* var(--gone) */ a {
      border-radius: var(--btn-radius, var(--border-radius, 3pt));
      background: var(--bg,
        light-dark(#fff, rgb(0 0 0 / 0.5)));
      gap: var(--gap,); color: var(--fg);
      --box: calc(
        var(--base, 1rem) * 2
      );
    }`,
    [
      [`--btn-radius`, `var(--border-radius, 3pt)`, `border-radius`],
      [`--border-radius`, `3pt`, `border-radius`],
      [`--bg`, `light-dark(#fff, rgb(0 0 0 / 0.5))`, `background`],
      [`--gap`, ``, `gap`],
      [`--fg`, null, `color`],
      [`--base`, `1rem`, `--box`],
    ],
    [[`--box`, `calc(var(--base, 1rem) * 2)`, `stylesheet`]],
  ],
  [
    `only root rules declare defaults; at-rule, nested and variant rules are scoped`,
    `A.svelte`,
    `<style>
      .root { --a: 1px; --shadow:
        0 2px black,
        0 4px red; /* --gone: \`1rem auto\` */ }
      @media (forced-colors: active) { .root { --b: Canvas; } }
      .root { &.error { --c: red; } }
      .wrap .root { --d: 18px; }
      :root[data-theme='dark'], :root { --e: #000; }
      :global(dialog.sheet) { --f: 2px; --font: "Inter", sans-serif; }
    </style>`,
    [],
    [
      [`--a`, `1px`, `stylesheet`],
      [`--shadow`, `0 2px black, 0 4px red`, `stylesheet`],
      [`--b`, `Canvas`, `scoped`],
      [`--c`, `red`, `scoped`],
      [`--d`, `18px`, `scoped`],
      [`--e`, `#000`, `scoped`],
      [`--f`, `2px`, `stylesheet`],
      [`--font`, `"Inter", sans-serif`, `stylesheet`],
    ],
  ],
  [
    `TS: template strings, dynamic names, comment openers, getPropertyValue, setProperty`,
    `tip.ts`,
    `el.style.cssText = \`inset: auto; z-index: var(--tip-z, 9); color: var(--tip-fg)\`
    const value = \`var(\${name})\`
    styles.getPropertyValue(\`--tip-arrow\`)
    const glob = \`src/**/*.ts\`; const bg = \`var(--tip-bg, red)\`
    const fill =
      \`var(--tip-fill, red)\`
    const x = \`var(--tip-x)\`
    node.style.setProperty(\`--pane-clamp\`, \`\${px}px\`)`,
    [
      [`--tip-z`, `9`, `z-index`],
      [`--tip-fg`, null, `color`],
      [`--tip-bg`, `red`, null],
      [`--tip-fill`, `red`, null],
      [`--tip-x`, null, null],
      [`--tip-arrow`, null, null],
    ],
    [[`--pane-clamp`, ``, `runtime`]],
  ],
  [
    `Svelte: style, script and markup reads, HTML comments, runtime sets, attribute targets`,
    `A.svelte`,
    `<script>const fg = \`var(--a-fg)\`</script>
    <!-- var(--gone) -->
    <div style="--cols: 3; color: var(--a-color, red)" style:--rows={rows}></div>
    <li style:margin-left={\`calc(\${depth} * var(--indent, 1em))\`}></li>
    <OptionList --sms-width="var(--cmd-width, min(38rem, 90vw))" />
    <Spinner size="var( --spin-size, 1em )" />
    <style>div { gap: var(--a-gap, 1em); }</style>`,
    [
      [`--a-gap`, `1em`, `gap`],
      [`--a-fg`, null, null],
      [`--a-color`, `red`, `color`],
      [`--indent`, `1em`, `margin-left`],
      [`--cmd-width`, `min(38rem, 90vw)`, `--sms-width`],
      [`--spin-size`, `1em`, `size`],
    ],
    [
      [`--cols`, `3`, `runtime`],
      [`--rows`, ``, `runtime`],
      [`--sms-width`, ``, `runtime`],
    ],
  ],
])(`extract_css_vars %s`, (_label, filename, source, reads, sets) => {
  const extracted = extract_css_vars(source, filename)
  expect(
    extracted.reads.map(({ name, fallback, property }) => [name, fallback, property]),
  ).toEqual(reads)
  expect(extracted.sets.map(({ name, value, kind }) => [name, value, kind])).toEqual(sets)
})

test.each([
  [`/src/lib/Nav.svelte`, `Nav`],
  [`/src/lib/attachments/tooltip.ts`, `tooltip`],
  [`/src/lib/json-tree/JsonNode.svelte`, `json-tree`],
  [`/src/lib/code-editor/editor.css`, `code-editor`],
  [`/src/lib/internal/OptionList.svelte`, `OptionList`],
  [`/src/lib/fullscreen.svelte.ts`, `fullscreen`],
])(`css_var_group(%s) = %s`, (path, expected) => {
  expect(css_var_group(path)).toBe(expected)
})

test(`collect_css_vars notes vars, attributes helpers to importers and pulls out shared tokens`, () => {
  const shared_read = `color: var(--text-color, black);`
  const { groups, shared } = collect_css_vars({
    '/src/lib/Nav.svelte': `<script>import { flash } from './flash'</script>
    <nav style:--rows={rows}></nav><style>nav {
      --nav-inset: 1rem;
      --nav-box: calc(var(--nav-size, 1rem) * var(--nav-scale));
      top: var(--nav-inset); height: var(--nav-box); grid-row: span var(--rows);
      inset-inline: var(--nav-mobile-inset, var(--nav-inset)); ${shared_read}
      margin: var(--flash-ms);
    }</style>`,
    '/src/lib/flash.ts': `node.style.setProperty(\`--flash-ms\`, ms)`,
    '/src/lib/json-tree/JsonTree.svelte': `<style>div { --jt-key: navy; ${shared_read} }</style>`,
    '/src/lib/json-tree/JsonValue.svelte': `<style>span { color: var(--jt-key); }</style>`,
    '/src/lib/Toc.svelte': `<script>
      import List from './internal/List.svelte'
    </script><List --list-bg="red" /><style>a { ${shared_read} }</style>`,
    '/src/lib/internal/List.svelte': `<style>ul { background: var(--list-bg); }</style>`,
    '/src/lib/Footer.svelte': `<footer></footer>`,
  })
  expect(shared).toEqual([
    { name: `--text-color`, properties: [`color`], groups: [`Nav`, `Toc`, `json-tree`] },
  ])
  // groups without reads are dropped, helpers fold into their importers' groups;
  // sorted case-insensitively, so subdir groups interleave with components
  expect(groups.map(({ name }) => name)).toEqual([`json-tree`, `Nav`, `Toc`])
  const [json_tree, nav, toc] = groups
  expect(Object.fromEntries(nav.vars.map((entry) => [entry.name, entry.note]))).toEqual({
    '--flash-ms': runtime,
    '--nav-box': `derived from --nav-scale, --nav-size`,
    '--nav-inset': ``,
    '--nav-mobile-inset': ``,
    '--nav-scale': ``,
    '--nav-size': ``,
    '--rows': runtime,
  })
  expect(nav.files).toEqual([`Nav.svelte`, `flash.ts`])
  expect(nav.vars.find(({ name }) => name === `--nav-inset`)).toMatchObject({
    declared: [`1rem`],
    fallbacks: [],
    properties: [`inset-inline`, `top`],
  })
  expect(toc).toMatchObject({
    files: [`Toc.svelte`, `internal/List.svelte`],
    vars: [{ name: `--list-bg`, note: runtime }],
    shared: [`--text-color`],
  })
  // declared in one file of a group, read in another: still one public entry
  expect(json_tree).toMatchObject({
    files: [`json-tree/JsonTree.svelte`, `json-tree/JsonValue.svelte`],
    vars: [{ name: `--jt-key`, note: ``, declared: [`navy`], fallbacks: [] }],
  })
})

const { groups, shared } = load()

// fallback text is left unpinned so Nav's styling can evolve without touching this test
test.each<[string, string, Record<string, unknown>]>([
  [
    `Nav`,
    `--nav-mobile-inset`,
    {
      note: ``,
      fallbacks: [expect.stringContaining(`var(--nav-burger-inset)`)],
      properties: [`inset-inline`],
    },
  ],
  [`Nav`, `--nav-burger-inset`, { note: ``, declared: [`1rem`] }],
  [`tooltip`, `--tooltip-bg`, { note: ``, fallbacks: [`light-dark(#fff, #2a2a2e)`] }],
  [`code-editor`, `--tok-constant`, { note: `derived from --tok-number` }],
  // only root-rule declarations count: no forced-colors, dark-theme or variant values
  [`Nav`, `--nav-border-radius`, { declared: [`3pt`] }],
  [`RangeSlider`, `--range-slider-thumb`, { declared: [] }],
  [`code-editor`, `--tok-number`, { declared: [expect.any(String)] }],
  [`code-editor`, `--icon-btn-size`, { declared: [] }],
  // set at runtime only when the consumer left them unset, so they stay documented
  [`SplitPane`, `--split-pane-size`, { note: runtime }],
  [`tooltip`, `--text-color`, { note: runtime }],
  [`tooltip`, `--tooltip-font-family`, { note: runtime }],
  [`GitHubCorner`, `--github-corner-bg`, { note: runtime }],
  [`CommandMenu`, `--sms-width`, { note: runtime }],
  [`Toc`, `--toc-flash-duration`, { note: runtime }],
])(`theming page load: %s %s`, (group_name, var_name, expected) => {
  const group = groups.find(({ name }) => name === group_name)
  expect(group?.vars.find(({ name }) => name === var_name)).toMatchObject(expected)
})

test(`theming page load covers the real library`, () => {
  const shared_names = new Set(shared.map(({ name }) => name))
  const public_names = groups.flatMap(({ vars }) =>
    vars.filter(({ note }) => !note).map(({ name }) => name),
  )
  expect(new Set([...shared_names, ...public_names]).size).toBeGreaterThan(300)
  expect([...shared_names]).toEqual(
    expect.arrayContaining([`--text-color`, `--text-color-muted`, `--border-radius`]),
  )
  // helpers document under their importers, not as their own groups
  const group_names = groups.map(({ name }) => name)
  for (const helper of [`OptionList`, `toc-utils`, `heading-anchors`])
    expect(group_names).not.toContain(helper)
  // every group reads something and no shared token is also listed as a public group var
  for (const { name, vars, shared: group_shared } of groups)
    expect(vars.length + group_shared.length, name).toBeGreaterThan(0)
  expect(public_names.filter((name) => shared_names.has(name))).toEqual([])
})
