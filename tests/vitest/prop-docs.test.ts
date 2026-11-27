// Prop docs extraction from component scripts and the virtual:prop-docs plugin serving them
import type { ComponentDoc, PropDoc } from '#lib/prop-docs/types.ts'
import {
  extract_prop_docs,
  prop_docs_plugin,
  sentence_case,
} from '#lib/prop-docs/vite-plugin.ts'
import { mkdirSync, rmSync as rm_file, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vite-plus/test'

// A throwaway project: its tsconfig `paths` map `#fx/*` extensionless, as components
// commonly import their own modules, and node_modules links this repo's for svelte's types
const fixtures: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { paths: { '#fx/*': [`./src/lib/*`] } },
  }),
  'src/lib/types.ts': `import type { Snippet } from 'svelte'
export type BaseProps = {
  // State
  hovered?: boolean // set while the pointer is over the plot
  // Rendered over the chart, receives its measured size
  children?: Snippet<[{ height: number; width: number }]>
  // called when a marker is clicked
  on_point_click?: (
    data: { idx: number } & { event: MouseEvent | KeyboardEvent },
  ) => void
}`,
  'src/lib/constants.ts': `export const DEFAULT_FPS = 24
export const DEFAULTS = { player: { fps: { value: 10, description: \`Frames per second\` } } }
export const GRID = { grid_step: 0.1 }`,
  'src/lib/Plot.svelte': `<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import type { BaseProps } from '#fx/types'
  import { DEFAULT_FPS, DEFAULTS, GRID } from '#fx/constants'

  let {
    labels: corner_labels = [\`A\`, \`B\`, \`C\`],
    grid_step = $bindable(GRID.grid_step),
    hovered = $bindable(false),
    children,
    on_point_click,
    label,
    patterns,
    orientation = \`vertical\` as const,
    fps = DEFAULT_FPS,
    speed = DEFAULTS.player.fps,
    ...rest
  }: BaseProps &
    HTMLAttributes<HTMLDivElement> & {
      // Component names at the corners
      labels?: readonly [string, string, string]
      grid_step?: number // fraction between grid lines; 0 disables both
      label: string // label text (supports HTML)
      patterns:
        | number
        | Record<string, number>
      // Component-specific props
      // \`vertical\` draws bars upward, \`horizontal\` rightward
      orientation?: \`vertical\` | \`horizontal\`
      fps?: number
      speed?: number
    } = $props()
</script>`,
  'src/lib/Child.svelte': `<script lang="ts" generics="T extends string">
  import type { ComponentProps } from 'svelte'
  import Plot from './Plot.svelte'

  let {
    plot_props = {},
    grid_step,
    value,
  }: {
    plot_props?: Pick<
      ComponentProps<typeof Plot>,
      | \`label\`
      | \`fps\`
    >
    value?: T // the selected value
  } & Pick<ComponentProps<typeof Plot>, \`grid_step\`> = $props()
</script>`,
  'src/lib/NoProps.svelte': `<p>static</p>`,
}

let root = ``
let docs: Record<string, ComponentDoc> = {}
beforeAll(async () => {
  root = await mkdtemp(`${tmpdir()}/prop-docs-`)
  for (const [path, text] of Object.entries(fixtures)) {
    mkdirSync(`${root}/${path.slice(0, path.lastIndexOf(`/`) + 1)}`, { recursive: true })
    writeFileSync(`${root}/${path}`, text)
  }
  symlinkSync(`${process.cwd()}/node_modules`, `${root}/node_modules`)
  docs = extract_prop_docs(
    [`Plot`, `Child`].map((name) => `${root}/src/lib/${name}.svelte`),
  )
})
afterAll(() => rm(root, { recursive: true, force: true }))

describe(`extract_prop_docs`, () => {
  test.each<[string, string, PropDoc]>([
    // leading `//` line, renamed binding, backtick string literals read as '...'
    [
      `Plot`,
      `labels`,
      {
        name: `labels`,
        type: `readonly [string, string, string]`,
        default: `['A', 'B', 'C']`,
        description: `Component names at the corners`,
      },
    ],
    // trailing comment (capitalized), $bindable(...) unwrapped, a constant's value resolved
    // through an extensionless tsconfig `paths` specifier
    [
      `Plot`,
      `grid_step`,
      {
        name: `grid_step`,
        type: `number`,
        default: `GRID.grid_step`,
        default_value: `0.1`,
        description: `Fraction between grid lines; 0 disables both`,
        bindable: true,
      },
    ],
    // inherited under a `// State` section header, which is no description: only its
    // trailing comment is
    [
      `Plot`,
      `hovered`,
      {
        name: `hovered`,
        type: `boolean`,
        default: `false`,
        description: `Set while the pointer is over the plot`,
        bindable: true,
      },
    ],
    // the project's BaseProps.children wins over HTMLAttributes.children in the intersection
    [
      `Plot`,
      `children`,
      {
        name: `children`,
        type: `Snippet<[{ height: number; width: number }]>`,
        description: `Rendered over the chart, receives its measured size`,
      },
    ],
    // multi-line type on one line
    [
      `Plot`,
      `on_point_click`,
      {
        name: `on_point_click`,
        type: `(data: { idx: number } & { event: MouseEvent | KeyboardEvent }) => void`,
        description: `Called when a marker is clicked`,
      },
    ],
    [
      `Plot`,
      `label`,
      {
        name: `label`,
        type: `string`,
        description: `Label text (supports HTML)`,
        required: true,
      },
    ],
    // leading `|` of a multi-line union dropped
    [
      `Plot`,
      `patterns`,
      { name: `patterns`, type: `number | Record<string, number>`, required: true },
    ],
    // a `// Component-specific props` group heading above the prop's own comment is dropped,
    // the `as const` cast too
    [
      `Plot`,
      `orientation`,
      {
        name: `orientation`,
        type: `'vertical' | 'horizontal'`,
        default: `'vertical'`,
        description: `\`vertical\` draws bars upward, \`horizontal\` rightward`,
      },
    ],
    // a multi-line Pick<...> on one line: no padding inside <>, no union operator leading
    // the second type argument, literals in single quotes
    [
      `Child`,
      `plot_props`,
      {
        name: `plot_props`,
        type: `Pick<ComponentProps<typeof Plot>, 'label' | 'fps'>`,
        default: `{}`,
      },
    ],
    // typed through Pick<ComponentProps<typeof Plot>, ...>, i.e. another component's props,
    // whose declaration carries the description
    [
      `Child`,
      `grid_step`,
      {
        name: `grid_step`,
        type: `number`,
        description: `Fraction between grid lines; 0 disables both`,
      },
    ],
    // a generic parameter, aliased to its constraint
    [`Child`, `value`, { name: `value`, type: `T`, description: `The selected value` }],
  ])(`%s.%s`, (component, name, expected) => {
    expect(docs[component]?.props.find((doc) => doc.name === name)).toEqual(expected)
  })

  // a constant or setting default also gives the literal it stands for
  test.each([
    [`fps`, `DEFAULT_FPS`, `24`],
    [`speed`, `DEFAULTS.player.fps`, `10`],
    [`orientation`, `'vertical'`, undefined],
  ])(`Plot.%s defaults to %s (value %s)`, (name, fallback, value) => {
    const doc = docs.Plot.props.find((prop) => prop.name === name)
    expect([doc?.default, doc?.default_value]).toEqual([fallback, value])
  })

  test(`notes the element a ...rest binding passes attributes to, skipping the binding`, () => {
    expect(docs.Plot.rest_attributes).toBe(`<div>`)
    expect(docs.Child.rest_attributes).toBeUndefined()
    expect(docs.Plot.props.map(({ name }) => name)).not.toContain(`rest`)
  })

  test(`throws when two components share a file name`, () => {
    const files = [`${root}/src/lib/a/X.svelte`, `${root}/src/lib/b/X.svelte`]
    expect(() => extract_prop_docs(files)).toThrow(
      `Components share a name: ${files.join(`,`)}`,
    )
  })

  // its types would silently read as `any`, wiping even the component's own prop types
  test(`throws on a component import TypeScript can't resolve`, () => {
    const file = `${root}/src/lib/Broken.svelte`
    writeFileSync(
      file,
      `<script lang="ts">
  import type { Base } from '$lib/missing'
  import './styles.css'
  let { size = 1 }: Base & { size?: number } = $props()
</script>`,
    )
    expect(() => extract_prop_docs([file])).toThrow(
      `prop-docs: unresolved component imports:\n${file}: $lib/missing`,
    )
    rm_file(file)
  })
})

const plugin_hooks = () => {
  const { resolveId, load, hotUpdate } = prop_docs_plugin({ root })
  if (
    typeof resolveId !== `function` ||
    typeof load !== `function` ||
    typeof hotUpdate !== `function`
  )
    throw new TypeError(`resolveId, load and hotUpdate must be functions`)
  return {
    resolve_id: (id: string) => resolveId.call({} as never, id, undefined, {} as never),
    load: (id: string) => load.call({} as never, id),
    hot_update: hotUpdate,
  }
}

// A page fetches only its own components' docs: the index holds one lazy loader per component
// (no extraction needed), each per-component module that component's docs alone
test(`virtual:prop-docs splits into a loader index and per-component modules`, () => {
  const { resolve_id, load } = plugin_hooks()
  expect(
    [`virtual:prop-docs`, `virtual:prop-docs/Plot`, `virtual:other`].map(resolve_id),
  ).toEqual([`\0virtual:prop-docs`, `\0virtual:prop-docs/Plot`, null])
  // components without $props() get no loader
  expect(load(`\0virtual:prop-docs`)).toBe(
    `export default {"Child": () => import("virtual:prop-docs/Child"),"Plot": () => import("virtual:prop-docs/Plot")}`,
  )
  const plot = load(`\0virtual:prop-docs/Plot`)
  if (typeof plot !== `string`) throw new TypeError(`Plot docs are not a module source`)
  expect(JSON.parse(plot.replace(/^export default /, ``))).toEqual(docs.Plot)
  expect(() => load(`\0virtual:prop-docs/NoProps`)).toThrow(
    `No component named NoProps in src/lib has $props()`,
  )
  expect(load(`/src/other.ts`)).toBeNull()
})

// Dev server: an edit drops the extraction and invalidates the loaded docs modules, without an
// HMR update that would bubble through the index and remount whatever imports it. Only a
// created or deleted component updates the index.
test.each([
  [`src/lib/Plot.svelte`, `update`, true, false],
  [`src/lib/types.ts`, `update`, true, false],
  [`src/lib/New.svelte`, `create`, true, true],
  [`src/lib/app.css`, `update`, false, false],
  [`src/routes/+page.svelte`, `update`, false, false],
])(
  `hotUpdate for %s (%s) invalidates: %s, updates the index: %s`,
  (path, type, invalidates, updates_index) => {
    const { hot_update } = plugin_hooks()
    // the loader index and one component's docs are loaded, beside an unrelated module
    const index_module = { id: `\0virtual:prop-docs` }
    const docs_module = { id: `\0virtual:prop-docs/Plot` }
    const edited_module = { id: `${root}/${path}` }
    const id_to_module = new Map(
      [index_module, docs_module, { id: `${root}/src/routes/+page.svelte` }].map(
        (module) => [module.id, module],
      ),
    )
    const invalidateModule = vi.fn()
    const context = {
      environment: { moduleGraph: { idToModuleMap: id_to_module, invalidateModule } },
    }
    const file = `${root}/${path}`
    const result = hot_update.call(
      context as never,
      { type, file, modules: [edited_module] } as never,
    )
    expect(result).toEqual(updates_index ? [edited_module, index_module] : undefined)
    expect(invalidateModule.mock.calls).toEqual(
      invalidates ? [[index_module], [docs_module]] : [],
    )
  },
)

test(`an edit re-extracts the docs on the next load`, () => {
  const { load, hot_update } = plugin_hooks()
  const description = () => {
    const code = load(`\0virtual:prop-docs/Plot`)
    if (typeof code !== `string`) throw new TypeError(`Plot docs are not a module source`)
    const { props } = JSON.parse(code.replace(/^export default /, ``)) as ComponentDoc
    return props.find(({ name }) => name === `label`)?.description
  }
  expect(description()).toBe(`Label text (supports HTML)`)
  const file = `${root}/src/lib/Plot.svelte`
  writeFileSync(
    file,
    fixtures[`src/lib/Plot.svelte`].replace(`label text (supports HTML)`, `new label`),
  )
  const context = {
    environment: { moduleGraph: { idToModuleMap: new Map(), invalidateModule: vi.fn() } },
  }
  void hot_update.call(context as never, { type: `update`, file, modules: [] } as never)
  expect(description()).toBe(`New label`)
  writeFileSync(file, fixtures[`src/lib/Plot.svelte`])
})

test.each([
  [`label text`, `Label text`],
  [`x_axis config`, `x_axis config`], // an identifier keeps its case
  [`on_click(event) fires`, `on_click(event) fires`],
  [`null uses element colors`, `null uses element colors`], // a JS literal too
  [`e.g. a list`, `e.g. a list`],
  [`Already capitalized`, `Already capitalized`],
  [`λ_qν values`, `λ_qν values`],
])(`sentence_case(%j) is %j`, (text, expected) => {
  expect(sentence_case(text)).toBe(expected)
})
