import { EXAMPLE_MODULE_PREFIX } from '$lib/live-examples/mdsvex-transform'
import vite_plugin from '$lib/live-examples/vite-plugin'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

const to_base64 = (src: string): string => Buffer.from(src, `utf-8`).toString(`base64`)
const make_code = (src: string): string =>
  `const props = { __live_example_src: "${to_base64(src)}" }`

interface TestPlugin {
  name: string
  enforce?: string
  resolveId?: (id: string) => string | undefined
  load?: (id: string) => string | undefined
  transform?: (
    code: string,
    id: string,
  ) => { code: string; map: { mappings: string } } | undefined
  configureServer?: (server: unknown) => void
  handleHotUpdate?: (ctx: {
    file: string
    server: unknown
    modules: unknown[]
  }) => unknown[]
}

// Merge resolve (enforce:'pre') and main plugins into one for testing
const get_plugin = (options = {}): TestPlugin => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- plugin returns Plugin[] which we test via TestPlugin
  const plugins = vite_plugin(options) as unknown as TestPlugin[]
  const [resolve, main] = plugins
  return { ...main, resolveId: resolve.resolveId, enforce: resolve.enforce }
}

const transform_code = (
  plugin: TestPlugin,
  ctx: ReturnType<typeof create_mock_context>,
  code: string,
  id: string,
) => plugin.transform?.call(ctx, code, id)?.code ?? ``
const transform = (
  plugin: TestPlugin,
  ctx: ReturnType<typeof create_mock_context>,
  code: string,
  id: string,
) => plugin.transform?.call(ctx, code, id)
const load = (
  plugin: TestPlugin,
  ctx: ReturnType<typeof create_mock_context>,
  id: string,
) => plugin.load?.call(ctx, id)

const create_mock_context = () => ({ warn: vi.fn(), error: vi.fn() })
const create_mock_server = (hot_send = vi.fn()) => ({
  moduleGraph: {
    getModuleById: vi.fn().mockReturnValue(null),
    invalidateModule: vi.fn(),
  },
  hot: { send: hot_send },
})

describe(`plugin initialization`, () => {
  test(`returns two plugins: resolve (pre) and main`, () => {
    const plugin = get_plugin()
    expect(plugin.name).toBe(`live-examples-plugin`)
    expect(plugin.enforce).toBe(`pre`)
  })
})

describe(`resolveId`, () => {
  const plugin = get_plugin()

  test.each([
    [`relative`, `${EXAMPLE_MODULE_PREFIX}0.svelte`],
    [`root-relative`, `/src/file.md${EXAMPLE_MODULE_PREFIX}0.svelte`],
  ])(`resolves %s paths to absolute without double slashes`, (_, id) => {
    const cwd = process.cwd().replaceAll(`\\`, `/`)
    const resolved = plugin.resolveId?.(id)
    expect(resolved).toContain(EXAMPLE_MODULE_PREFIX)
    expect(resolved?.startsWith(cwd)).toBe(true)
    expect(resolved).not.toContain(`//`)
  })

  test(`preserves already absolute paths`, () => {
    const id = `${process.cwd()}/src/test.md${EXAMPLE_MODULE_PREFIX}0.svelte`
    expect(plugin.resolveId?.(id)).toBe(id)
  })

  test(`returns undefined for non-example modules`, () => {
    expect(plugin.resolveId?.(`/path/to/file.md`)).toBeUndefined()
  })
})

describe(`load`, () => {
  const plugin = get_plugin()
  const base_id = `/path/to/file.md${EXAMPLE_MODULE_PREFIX}0.svelte`

  test.each([
    [`style derived module`, `${base_id}?inline&svelte&type=style&lang.css`],
    [`script derived module`, `${base_id}?svelte&type=script`],
    [`module derived module`, `${base_id}?type=module`],
    [`non-example module`, `/path/to/regular.md`],
  ])(`returns undefined for %s requests`, (_, id) => {
    const ctx = create_mock_context()
    expect(load(plugin, ctx, id)).toBeUndefined()
    expect(ctx.warn).not.toHaveBeenCalled()
  })

  test.each([
    [`development`, undefined, `warns and returns error component`],
    [`production`, `production`, `throws`],
  ] as const)(`%s missing main component request %s`, (_mode, node_env, _desc) => {
    const ctx = create_mock_context()
    const previous_env = process.env.NODE_ENV
    if (node_env) process.env.NODE_ENV = node_env
    else delete process.env.NODE_ENV
    try {
      if (node_env === `production`) {
        expect(() => load(plugin, ctx, base_id)).toThrow(`Example src not found`)
        expect(ctx.warn).not.toHaveBeenCalled()
      } else {
        const result = load(plugin, ctx, base_id)
        expect(result).toContain(`<script>console.error`)
        expect(result).toContain(`Example src not found`)
        expect(ctx.warn).toHaveBeenCalled()
      }
    } finally {
      process.env.NODE_ENV = previous_env
    }
  })

  test(`returns undefined for CSS query even when virtual file exists`, () => {
    const css_plugin = get_plugin()
    const css_ctx = create_mock_context()
    const id = `/path/to/file.md`

    const code = `const props = { __live_example_src: "${to_base64(`<div>Test</div>`)}" }`
    transform(css_plugin, css_ctx, code, id)

    const virtual_id = `${id}${EXAMPLE_MODULE_PREFIX}0.svelte`
    expect(
      load(css_plugin, css_ctx, `${virtual_id}?inline&svelte&type=style&lang.css`),
    ).toBeUndefined()
  })
})

describe(`transform`, () => {
  const plugin = get_plugin()
  const ctx = create_mock_context()

  test.each([
    [`?svelte&type=style`, `standard`],
    [`?inline&svelte&type=style&lang.css`, `SSR with ?inline prefix`],
  ])(`skips derived modules with query %s (%s)`, (query) => {
    const code = `const props = { __live_example_src: "${to_base64(`<div>Test</div>`)}" }`
    expect(transform_code(plugin, ctx, code, `/file.md${query}`)).toBe(code)
  })

  test.each([
    [`AST parsing fails`, `{#if condition}<div>test</div>{/if}`, `/file.md`],
    [
      `example module is not markdown`,
      `<script>export let name</script><p>{name}</p>`,
      `/file${EXAMPLE_MODULE_PREFIX}0.svelte`,
    ],
    [`empty code without markers`, ``, `/file.md`],
    [`code without markers`, `const x = 1;`, `/file.md`],
  ])(`returns unchanged when %s`, (_desc, code, id) => {
    expect(transform(plugin, ctx, code, id)).toEqual({
      code,
      map: { mappings: `` },
    })
  })

  test(`ignores non-string __live_example_src properties`, () => {
    const code = `const props = { __live_example_src: 123, other: "value" }`
    const result_code = transform_code(plugin, ctx, code, `/file.md`)
    expect(result_code).toContain(`__live_example_src: 123`)
    expect(result_code).toContain(`other`)
  })

  test(`extracts __live_example_src while preserving other properties`, () => {
    const code = `const props = { __live_example_src: "${to_base64(`<div>Hello</div>`)}", other: "value" }`
    const result_code = transform_code(plugin, ctx, code, `/file.md`)
    expect(result_code).not.toContain(`__live_example_src`)
    expect(result_code).toContain(`other`)
  })

  test(`applies multiple edits in correct order`, () => {
    const code = `
      const a = { __live_example_src: "${to_base64(`<div>First</div>`)}", x: 1 };
      const b = { __live_example_src: "${to_base64(`<div>Second</div>`)}", y: 2 };
      const c = { other: "value" };
    `
    const result_code = transform_code(plugin, ctx, code, `/file.md`)
    expect(result_code).not.toContain(`__live_example_src`)
    expect(result_code).toContain(`x: 1`)
    expect(result_code).toContain(`y: 2`)
    expect(result_code).toContain(`other`)
  })

  test(`handles multiple static and dynamic imports`, () => {
    const code = `
      import A from "${EXAMPLE_MODULE_PREFIX}0.svelte";
      import B from "${EXAMPLE_MODULE_PREFIX}1.svelte";
      const C = await import("${EXAMPLE_MODULE_PREFIX}2.svelte");
    `
    const id = `/path/to/file.md`
    const result_code = transform_code(plugin, ctx, code, id)
    for (const idx of [0, 1, 2]) {
      expect(result_code).toContain(`${id}${EXAMPLE_MODULE_PREFIX}${idx}.svelte`)
    }
  })

  // The two indices line up only because non-live examples generate neither a
  // __live_example_src prop nor an import, so neither sequence ever gains a gap.
  test(`props and imports have matching indices and virtual files are loadable`, () => {
    const index_plugin = get_plugin()
    const index_ctx = create_mock_context()
    const id = `/path/to/file.md`

    const content0 = `<div>Hello 世界 🌍</div>`
    const content1 = `<div>Second</div>`
    const code = `
      import A from "${EXAMPLE_MODULE_PREFIX}0.svelte";
      import B from "${EXAMPLE_MODULE_PREFIX}1.svelte";
      const props0 = { __live_example_src: "${to_base64(content0)}" };
      const props1 = { __live_example_src: "${to_base64(content1)}" };
    `
    const result_code = transform_code(index_plugin, index_ctx, code, id)

    const virtual_id0 = `${id}${EXAMPLE_MODULE_PREFIX}0.svelte`
    const virtual_id1 = `${id}${EXAMPLE_MODULE_PREFIX}1.svelte`
    expect(result_code).toContain(virtual_id0)
    expect(result_code).toContain(virtual_id1)
    expect(result_code).not.toContain(`__live_example_src`)

    expect(load(index_plugin, index_ctx, virtual_id0)).toBe(content0)
    expect(load(index_plugin, index_ctx, virtual_id1)).toBe(content1)

    transform(index_plugin, index_ctx, make_code(`<div>Updated</div>`), id)
    expect(load(index_plugin, index_ctx, virtual_id0)).toBe(`<div>Updated</div>`)
  })
})

describe(`pending_hmr_file lifecycle`, () => {
  beforeEach(() => vi.useFakeTimers())

  const setup_hmr = () => {
    const plugin = get_plugin()
    const ctx = create_mock_context()
    const id = `/path/to/file.md`
    const hot_send = vi.fn()
    const server = create_mock_server(hot_send)
    plugin.configureServer?.(server)
    return { plugin, ctx, id, hot_send, server }
  }

  test(`non-markdown hot update returns modules without arming reload`, () => {
    const { plugin, ctx, id, hot_send, server } = setup_hmr()
    transform(plugin, ctx, make_code(`<div>V1</div>`), id)
    const modules = [{ id: `existing` }]

    const result = plugin.handleHotUpdate?.({ file: `/path/to/file.ts`, server, modules })
    transform(plugin, ctx, make_code(`<div>V2</div>`), id)
    vi.advanceTimersByTime(500)

    expect(result).toEqual(modules)
    expect(hot_send).not.toHaveBeenCalled()
  })

  test(`stale flag cleared after no-change transform — no spurious reload`, () => {
    const { plugin, ctx, id, hot_send, server } = setup_hmr()

    transform(plugin, ctx, make_code(`<div>V1</div>`), id)
    plugin.handleHotUpdate?.({ file: id, server, modules: [] })

    // re-transform with identical examples — fix clears pending_hmr_file
    transform(plugin, ctx, make_code(`<div>V1</div>`), id)

    // examples change without a preceding handleHotUpdate: a stale pending_hmr_file
    // used to trigger a spurious full-reload here
    transform(plugin, ctx, make_code(`<div>V2</div>`), id)
    vi.advanceTimersByTime(500)

    expect(hot_send).not.toHaveBeenCalled()
  })

  test(`triggers full-reload when examples change during HMR`, () => {
    const { plugin, ctx, id, hot_send, server } = setup_hmr()

    transform(plugin, ctx, make_code(`<div>V1</div>`), id)
    plugin.handleHotUpdate?.({ file: id, server, modules: [] })
    transform(plugin, ctx, make_code(`<div>V2</div>`), id)
    vi.advanceTimersByTime(500)

    expect(hot_send).toHaveBeenCalledWith({ type: `full-reload`, path: `*` })
  })

  test(`invalidates virtual modules found in the Vite module graph`, () => {
    const { plugin, ctx, id, server } = setup_hmr()
    const module_record = { id: `module` }
    server.moduleGraph.getModuleById = vi.fn().mockReturnValue(module_record)

    transform(plugin, ctx, make_code(`<div>V1</div>`), id)

    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledWith(module_record)
  })
})
