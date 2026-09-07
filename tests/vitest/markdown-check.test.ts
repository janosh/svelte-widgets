/* oxlint-disable no-template-curly-in-string -- Source fixtures contain Svelte expressions. */
import { relative, resolve } from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import * as typescript from 'typescript'
import * as source_maps from '$lib/markdown/source-map'
import {
  create_checker as create_project_checker,
  check_document,
  type CheckResult,
  type CheckOptions,
  type SvelteTypeChecker,
} from '$lib/markdown/check'
import {
  assert_ok,
  create_markdown,
  DiagnosticError,
  type MarkdownOptions,
} from '$lib/markdown'
import { describe, expect, onTestFinished, test, vi } from 'vitest'

const filename = resolve(`tests/checked-examples.md`)
const fence = (language: string, code: string, info = `check`) =>
  `\`\`\`${language} ${info}\n${code}\n\`\`\``
const temporary_directory = async () => {
  const directory = await mkdtemp(resolve(`tests/.checked-docs-`))
  onTestFinished(() => rm(directory, { recursive: true }))
  return directory
}
const create_checker = (options: Parameters<typeof create_project_checker>[0]) => {
  const checker = create_project_checker(options)
  onTestFinished(() => checker.dispose())
  return checker
}
const write_json = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value))

const check_source = async (
  source: string,
  {
    markdown_options,
    ...options
  }: CheckOptions & { markdown_options?: MarkdownOptions } = {},
): Promise<CheckResult> => {
  options = { filename, ...options }
  const parsed = await create_markdown(markdown_options).parse(source, {
    filename: options.filename,
  })
  return parsed.ok
    ? check_document(parsed.value, { tsconfig: false, ...options })
    : { ...parsed, value: { checked: 0, asserted: 0 } }
}
const diagnostics_at_start = (result: CheckResult) =>
  result.diagnostics.map(({ range, ...diagnostic }) => ({
    ...diagnostic,
    ...range.start,
  }))

describe(`checked Markdown examples`, () => {
  test(`composes scientific Markdown options with checked examples`, async () => {
    const source = `See [@eq:energy].\n\n$$ {#eq:energy}\nE=mc^2\n$$\n\n${fence(`js`, `const value = 1`)}`
    let highlight_calls = 0
    const document = assert_ok(
      await create_markdown({
        math: true,
        references: true,
        highlight: () => {
          highlight_calls++
          throw new Error(`Do not render during analysis`)
        },
      }).parse(source, { filename }),
    )
    const result = await check_document(document, {
      tsconfig: false,
      typescript,
      typecheck: false,
    })
    expect(highlight_calls).toBe(0)
    expect(result).toEqual({
      ok: true,
      value: { checked: 1, asserted: 0 },
      diagnostics: [],
    })
  })

  test(`does nothing to unmarked code, checks valid isolated modules and Svelte templates`, async () => {
    const source = [
      fence(`ts`, `not valid code`, ``),
      fence(`python`, `this is displayed only`, `title="Lines 1–4"`),
      fence(`ts`, `const value: number = 1`),
      fence(`ts`, `const value: string = "one"`),
      fence(`js`, `const value = 1; value.toFixed()`),
      fence(
        `svelte`,
        `<script lang="ts">let count = $state(0)</script><button onclick={() => count++}>{count}</button>`,
      ),
      fence(`html`, `<p>Static example</p>`),
    ].join(`\n\n`)
    expect(await check_source(source, { typescript })).toMatchObject({
      ok: true,
      value: { checked: 5, asserted: 0 },
      diagnostics: [],
    })
  })

  test.each([`ts`, `typescript`, `js`, `javascript`])(
    `checks real %s semantic errors`,
    async (language) => {
      const source = fence(language, `const value = 1;\nvalue.toUpperCase()`)
      const result = await check_source(source)
      expect(result.ok).toBe(false)
      expect(diagnostics_at_start(result)).toMatchObject([
        {
          filename,
          line: 3,
          column: 7,
          code: `TS2339`,
          severity: `error`,
          message: expect.stringContaining(`toUpperCase`),
        },
      ])
    },
  )

  test(`Svelte checks script assignments and template expressions with original locations`, async () => {
    const source = `---\ntitle: Checks\n---\n\n${fence(`svelte`, `<script lang="ts">\nlet count: number = "bad"\n</script>\n<p>{count.toUpperCase()}</p>`)}`
    const result = await check_source(source)
    expect(diagnostics_at_start(result)).toMatchObject([
      { filename, code: `TS2322`, line: 7, column: 5 },
      { filename, code: `TS2339`, line: 9, column: 11 },
    ])
  })

  test(`checks prop types of imported local Svelte components`, async () => {
    const directory = await temporary_directory()
    const page_filename = resolve(directory, `page.md`)
    const check = (source: string, options: CheckOptions = {}) =>
      check_source(source, { filename: page_filename, ...options })

    await writeFile(
      resolve(directory, `Counter.svelte`),
      `<script lang="ts">let { count }: { count: number } = $props()</script><p>{count}</p>`,
    )
    const source = fence(
      `svelte`,
      `<script lang="ts">import Counter from "./Counter.svelte"</script>\n<Counter count="wrong" />`,
    )
    const result = await check(source)
    expect(diagnostics_at_start(result)).toMatchObject([
      {
        code: `TS2322`,
        line: 3,
        column: 10,
        message: expect.stringContaining(`not assignable to type 'number'`),
      },
    ])
    const valid = await check(source.replace(`count="wrong"`, `count={1}`))
    expect(valid.ok).toBe(true)
    const imported_by_ts = await check(
      fence(`ts`, `import Counter from "./Counter.svelte"; console.log(Counter)`),
    )
    expect(imported_by_ts).toMatchObject({ ok: true, diagnostics: [] })
    const alias = await check(
      source.replace(`./Counter.svelte`, `$docs/Counter.svelte`),
      {
        compiler_options: { paths: { '$docs/*': [`${directory}/*`] } },
      },
    )
    expect(diagnostics_at_start(alias)).toEqual([
      {
        ...diagnostics_at_start(result)[0],
        offset: source
          .replace(`./Counter.svelte`, `$docs/Counter.svelte`)
          .indexOf(`count="wrong"`),
      },
    ])
    await writeFile(resolve(directory, `Counter.svelte`), `<p>{#if true}`)
    const broken_import = await check(source)
    expect(diagnostics_at_start(broken_import)).toContainEqual(
      expect.objectContaining({
        code: `compile`,
        filename: resolve(directory, `Counter.svelte`),
      }),
    )
    const missing = await check(source.replace(`./Counter.svelte`, `./Missing.svelte`))
    expect(diagnostics_at_start(missing)).toContainEqual(
      expect.objectContaining({
        code: `import`,
        filename: resolve(directory, `Missing.svelte`),
      }),
    )
    for (const specifier of [`$docs/Missing.svelte`, `absent-package/Missing.svelte`]) {
      const missing_source = source.replace(`./Counter.svelte`, specifier)
      const unresolved = await check(missing_source, {
        compiler_options: { paths: { '$docs/*': [`${directory}/*`] } },
      })
      expect(unresolved.ok).toBe(false)
      expect(diagnostics_at_start(unresolved)).toContainEqual(
        expect.objectContaining({
          filename: page_filename,
          line: 2,
          offset: missing_source.indexOf(`"${specifier}"`),
          code: `import`,
          message: `Cannot resolve imported Svelte component: ${specifier}`,
        }),
      )
    }
    const invalid_component = `<script>let value = $state(0)</script>\n<button onclick={()=>{}} on:click={()=>{}}>Click</button>`
    await writeFile(resolve(directory, `Counter.svelte`), invalid_component)
    const invalid_import = await check(source)
    expect(invalid_import.ok).toBe(false)
    expect(diagnostics_at_start(invalid_import)).toContainEqual(
      expect.objectContaining({
        filename: resolve(directory, `Counter.svelte`),
        line: 2,
        offset: invalid_component.indexOf(`on:click`),
        code: `compile`,
        message: expect.stringContaining(`Mixing old (on:click)`),
      }),
    )
    await writeFile(resolve(directory, `broken.ts`), `export const count: number = "bad"`)
    const dependency_error = await check(
      fence(`ts`, `import { count } from "./broken"; console.log(count)`),
      {},
    )
    expect(diagnostics_at_start(dependency_error)).toMatchObject([
      {
        filename: resolve(directory, `broken.ts`),
        line: 1,
        column: 14,
        offset: 13,
        code: `TS2322`,
      },
    ])
  })

  test(`maps repeated nested fences independently, including frontmatter and CRLF`, async () => {
    const source =
      `---\ntitle: Repeated\n---\n\n${fence(`ts`, `const value: number = "bad"`)}\n\n> ${fence(`ts`, `const value: number = "bad"`).replaceAll(`\n`, `\n> `)}\n\n- Nested\n\n  ${fence(`ts`, `const value: number = "bad"`).replaceAll(`\n`, `\n  `)}`.replaceAll(
        `\n`,
        `\r\n`,
      )
    const result = await check_source(source)
    expect(
      diagnostics_at_start(result).map(({ line, column, offset }) => ({
        line,
        column,
        offset,
      })),
    ).toEqual([
      { line: 6, column: 7, offset: source.indexOf(`value`) },
      {
        line: 10,
        column: 9,
        offset: source.indexOf(`value`, source.indexOf(`value`) + 1),
      },
      { line: 16, column: 9, offset: source.lastIndexOf(`value`) },
    ])
  })

  test(`reports compiler failures and never runs assertions after a static failure`, async () => {
    const run = vi.fn()
    await expect(
      check_source(fence(`svelte`, `<div>{#if true}`, `test="render"`), {
        assertions: { render: run },
      }).then(assert_ok),
    ).rejects.toThrow(`${filename}:2:`)
    expect(run).not.toHaveBeenCalled()
  })

  test.each<[string, CheckOptions, boolean, Record<string, unknown>]>([
    [fence(`js`, `const =`), { typecheck: false }, false, { line: 2, code: `TS1134` }],
    [
      fence(`ts`, `const value = 1`),
      { compiler_options: { noLib: true, lib: [`lib.esnext.d.ts`] } },
      false,
      { line: 1, column: 1, offset: 0, code: `TS5053` },
    ],
    [
      `---\ntitle: unclosed`,
      {},
      false,
      {
        code: `frontmatter`,
        message: expect.stringContaining(`Unclosed YAML frontmatter`),
      },
    ],
    [
      fence(`html`, `<img src="x.png">`),
      { typecheck: false },
      true,
      { severity: `warning`, code: `a11y_missing_attribute` },
    ],
  ])(`reports static diagnostics for %s`, async (source, options, ok, diagnostic) => {
    const result = await check_source(source, options)
    expect(result.ok).toBe(ok)
    expect(diagnostics_at_start(result)).toContainEqual(
      expect.objectContaining({ filename, ...diagnostic }),
    )
  })

  test(`explicit async assertions execute interaction checks and preserve failure context`, async () => {
    const code = `const button = document.createElement("button");\nbutton.textContent = "0";\nbutton.onclick = () => { button.textContent = "1" };\ndocument.body.append(button);`
    const assert_increment = async ({ code: source }: { code: string }) => {
      // Execution belongs to this caller, never to the static checker.
      runInNewContext(source, { document })
      const button = document.querySelector(`button`)
      expect(button).not.toBeNull()
      button?.click()
      await Promise.resolve()
      expect(button?.textContent).toBe(`1`)
    }
    const source = fence(`js`, code, `test="increments"`)
    expect(
      await check_source(source, {
        assertions: { increments: assert_increment },
      }),
    ).toMatchObject({ ok: true, value: { checked: 1, asserted: 1 } })
    const failure = await check_source(source, {
      assertions: {
        increments: async () => {
          await Promise.resolve()
          throw new Error(`Expected count 2, received 1`)
        },
      },
    })
    expect(failure).toMatchObject({ ok: false, value: { asserted: 0 } })
    expect(diagnostics_at_start(failure)).toMatchObject([
      {
        filename,
        line: 1,
        column: 1,
        code: `assertion`,
        message: `increments: Expected count 2, received 1`,
      },
    ])
  })

  test.each([
    [`python check`, `language`, `Unsupported checked fence language: python`],
    [`js check="yes"`, `fence`, `Code fence option check must be boolean`],
    [`js test=true`, `fence`, `Code fence option test must be a nonempty string`],
    [`js test="missing"`, `assertion`, `Missing assertion runner: missing`],
    [`js test="toString"`, `assertion`, `Missing assertion runner: toString`],
  ])(`fails clearly for %s`, async (info, code, message) => {
    const error = await check_source(`\`\`\`${info}\n\`\`\``)
      .then(assert_ok)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DiagnosticError)
    expect(error).toMatchObject({
      diagnostics: [
        {
          code,
          message,
          range: { start: { filename, line: 1 } },
        },
      ],
    })
  })

  test.each([
    [undefined, `pass options.typescript`],
    [{ version: `7.0.2` }, `found TypeScript 7.0.2`],
  ])(
    `missing or incompatible compiler %j fails at the selected fence`,
    async (compiler, message) => {
      const result = await check_source(fence(`ts`, `const value = 1`), {
        filename: `/no-docs-project/page.md`,
        typescript: compiler as typeof typescript | undefined,
      })
      expect(diagnostics_at_start(result)).toMatchObject([
        {
          filename: `/no-docs-project/page.md`,
          line: 1,
          message: expect.stringContaining(message),
        },
      ])
    },
  )
})

test(`type diagnostics underline the authored token inside an indented fence`, async () => {
  const source = '> ```ts check\n> const value: number = "bad"\n> ```'
  const document = assert_ok(await create_markdown().parse(source, { filename }))
  const result = await check_document(document, { tsconfig: false, typescript })
  const diagnostic = result.diagnostics.find(({ code }) => code === `TS2322`)
  expect(diagnostic).toBeDefined()
  expect(source.slice(diagnostic?.range.start.offset, diagnostic?.range.end.offset)).toBe(
    `value`,
  )
  expect(result.value).toEqual({ checked: 1, asserted: 0 })
})

test(`project sessions reuse programs and invalidate changed, deleted, and recreated imports`, async () => {
  const directory = await temporary_directory()
  const create_program = vi.fn(typescript.createProgram)
  const create_source = vi.fn(typescript.createSourceFile)
  const checker = create_checker({
    tsconfig: false,
    root: directory,
    compiler_options: { paths: { '@value': [`./value.ts`] } },
    typescript: new Proxy(typescript, {
      get: (target, key, receiver) =>
        key === `createProgram`
          ? create_program
          : key === `createSourceFile`
            ? create_source
            : Reflect.get(target, key, receiver),
    }),
  })
  const engine = create_markdown()
  const document = async (code: string, name = `guide.md`) =>
    assert_ok(
      await engine.parse(fence(`ts`, code), { filename: resolve(directory, name) }),
    )
  const dependency = resolve(directory, `value.ts`)

  await writeFile(dependency, `export const value: number = 1`)
  const guide = await document(
    `import {value} from './value'; const count: number = value`,
  )
  const relative_filename = relative(process.cwd(), guide.filename)
  const relative_guide = assert_ok(
    await engine.parse(guide.source, {
      filename: relative_filename,
    }),
  )
  expect((await check_document(relative_guide, { tsconfig: false, typescript })).ok).toBe(
    true,
  )
  const other = await document(
    `import {value} from '@value'; value.toFixed()`,
    `other.md`,
  )
  expect(await checker.check([guide, other])).toMatchObject({
    ok: true,
    value: { checked: 2 },
  })
  const cold_sources = create_source.mock.calls.length
  expect(cold_sources).toBeGreaterThan(2)
  expect(await checker.check([guide, other])).toMatchObject({
    ok: true,
    diagnostics: [],
  })
  expect(create_program.mock.calls[1]?.[3]).toBe(create_program.mock.results[0].value)
  expect(create_source).toHaveBeenCalledTimes(cold_sources)
  const rooted_guide = assert_ok(
    await engine.parse(guide.source, { filename: `guide.md` }),
  )
  expect((await checker.check(rooted_guide)).ok).toBe(true)
  await writeFile(dependency, `export const value: string = 'bad'`)
  const changed = await checker.check([guide, other])
  expect(changed.ok).toBe(false)
  expect(changed.diagnostics).toContainEqual(expect.objectContaining({ code: `TS2322` }))
  await rm(dependency)
  expect((await checker.check(guide)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2307` }),
  )
  await writeFile(dependency, `export const value: number = 2`)
  expect(await checker.check(guide)).toMatchObject({ ok: true, value: { checked: 1 } })
  const invalid = await document(`const value: number = 'wrong'`, `other.md`)
  expect((await checker.check([guide, invalid])).ok).toBe(false)
  expect(await checker.check(guide)).toMatchObject({ ok: true, diagnostics: [] })
  expect(await checker.check([])).toMatchObject({
    ok: true,
    value: { checked: 0, asserted: 0 },
  })
  const before_clear = create_source.mock.calls.length
  checker.clear()
  expect((await checker.check(guide)).ok).toBe(true)
  expect(create_source.mock.calls.length).toBeGreaterThan(before_clear)
  await expect(checker.check([guide, guide])).rejects.toThrow(
    `Duplicate checked document`,
  )
  create_program.mockImplementationOnce(() => {
    throw new Error(`Compiler failed`)
  })
  await expect(checker.check(guide)).rejects.toThrow(`Compiler failed`)
  expect((await checker.check(guide)).ok).toBe(true)
  checker.dispose()
  await expect(checker.check([])).rejects.toThrow(`Checker is disposed`)
})

test(`project sessions refresh imported Svelte props and remap moved fences without retransformation`, async () => {
  const directory = await temporary_directory()
  const { createRequire } = await import('node:module')
  const require_tool = createRequire(filename)
  const { svelte2tsx } = require_tool(`svelte2tsx`) as {
    svelte2tsx: SvelteTypeChecker['transform']
  }
  const transform = vi.fn(svelte2tsx)
  const decode = vi.spyOn(source_maps, `decode_source_map`)
  const checker = create_checker({
    tsconfig: false,
    root: directory,
    typescript,
    svelte_typechecker: {
      transform,
      shims: [
        require_tool.resolve(`svelte2tsx/svelte-shims-v4.d.ts`),
        require_tool.resolve(`svelte2tsx/svelte-jsx-v4.d.ts`),
      ],
    },
  })
  const engine = create_markdown()
  const component = resolve(directory, `Counter.svelte`)
  const source = fence(
    `svelte`,
    `<script lang="ts">import Counter from './Counter.svelte'</script>\n<Counter count="bad"/>`,
  )
  const document = async (prefix = ``) =>
    assert_ok(
      await engine.parse(prefix + source, { filename: resolve(directory, `guide.md`) }),
    )

  await writeFile(
    component,
    `<script lang="ts">let {count}: {count: number} = $props()</script><p>{count}</p>`,
  )
  const first = await checker.check(await document())
  expect(first.diagnostics).toContainEqual(expect.objectContaining({ code: `TS2322` }))
  expect(transform).toHaveBeenCalledTimes(2)
  expect(decode).toHaveBeenCalledTimes(2)
  const moved = await checker.check(await document(`# Heading\n\n`))
  expect(transform).toHaveBeenCalledTimes(2)
  expect(decode).toHaveBeenCalledTimes(2)
  const first_error = first.diagnostics.find(({ code }) => code === `TS2322`)
  const moved_error = moved.diagnostics.find(({ code }) => code === `TS2322`)
  expect(moved_error?.range.start.line).toBe((first_error?.range.start.line ?? 0) + 2)
  await writeFile(
    component,
    `<script lang="ts">let {count}: {count: string} = $props()</script><p>{count}</p>`,
  )
  expect(await checker.check(await document())).toMatchObject({
    ok: true,
    diagnostics: [],
  })
  expect(transform).toHaveBeenCalledTimes(3)
  expect(decode).toHaveBeenCalledTimes(3)
  await rm(component)
  expect((await checker.check(await document())).ok).toBe(false)
  await writeFile(
    component,
    `<script lang="ts">let {count}: {count: string} = $props()</script><p>{count}</p>`,
  )
  expect((await checker.check(await document())).ok).toBe(true)
  checker.clear()
  expect((await checker.check(await document())).ok).toBe(true)
  expect(transform.mock.calls.length).toBeGreaterThan(3)
})

test(`sessions serialize assertions, isolate projects, and reject queued work after disposal`, async () => {
  const source = fence(`ts`, `const value: number = 1`, `test="hold"`)
  const document = assert_ok(await create_markdown().parse(source, { filename }))
  const checker = create_checker({ tsconfig: false, typescript })
  const release = Promise.withResolvers<undefined>()
  const started = Promise.withResolvers<undefined>()
  const events: string[] = []
  const first = checker.check(document, {
    assertions: {
      hold: async () => {
        events.push(`start`)
        started.resolve(undefined)
        await release.promise
        events.push(`end`)
      },
    },
  })
  await started.promise
  const second = checker.check(document, {
    assertions: {
      hold: () => {
        events.push(`second`)
      },
    },
  })
  const rejected = second.catch((error: unknown) => error)
  const independent = create_checker({ tsconfig: false, typescript })
  expect(
    (
      await independent.check(document, {
        assertions: {
          hold: () => {
            events.push(`independent`)
          },
        },
      })
    ).ok,
  ).toBe(true)
  independent.dispose()
  checker.dispose()
  release.resolve(undefined)
  expect((await first).ok).toBe(true)
  expect(await rejected).toMatchObject({
    message: expect.stringContaining(`Checker is disposed`),
  })
  expect(events).toEqual([`start`, `independent`, `end`])
})

test(`project configuration inherits aliases, libraries and types, caches reads, and follows edits`, async () => {
  const root = await temporary_directory()
  const parse_config = vi.fn(typescript.getParsedCommandLineOfConfigFile)
  const compiler = new Proxy(typescript, {
    get: (target, key, receiver) =>
      key === `getParsedCommandLineOfConfigFile`
        ? parse_config
        : Reflect.get(target, key, receiver),
  })
  const checker = create_checker({ root, typescript: compiler })
  const engine = create_markdown()
  const document = assert_ok(
    await engine.parse(
      fence(
        `ts`,
        `import {value} from '$value'; const count: number = value; const label: string = PROJECT_LABEL; [count].toSorted()`,
      ),
      { filename: resolve(root, `guide.md`) },
    ),
  )
  const base_path = resolve(root, `settings/base.json`)
  const ambient_path = resolve(root, `types/project/index.d.ts`)
  const base = {
    compilerOptions: {
      lib: [`es2023`],
      types: [`project`],
      typeRoots: [`../types`],
      paths: { $value: [`../src/value.ts`] },
      strict: true,
      composite: true,
      incremental: true,
      rootDir: `../src`,
      tsBuildInfoFile: `../build.tsbuildinfo`,
    },
  }

  for (const directory of [
    `settings`,
    `src`,
    `types/project`,
    `docs`,
    `node_modules/fixture-config`,
  ])
    await mkdir(resolve(root, directory), { recursive: true })
  await write_json(base_path, base)
  const package_path = resolve(root, `node_modules/fixture-config/package.json`)
  await write_json(package_path, { tsconfig: `config.json` })
  await write_json(resolve(root, `node_modules/fixture-config/config.json`), {
    extends: `../../settings/base.json`,
  })
  await write_json(resolve(root, `tsconfig.json`), {
    extends: `fixture-config`,
    include: [`src/**/*`],
  })
  // Included application files are not documentation roots.
  await writeFile(resolve(root, `src/unrelated.ts`), `const invalid: number = 'wrong'`)
  await writeFile(resolve(root, `src/value.ts`), `export const value = 1`)
  await writeFile(ambient_path, `declare const PROJECT_LABEL: string`)
  expect(await checker.check(document)).toMatchObject({ ok: true, diagnostics: [] })
  expect((await checker.check(document)).ok).toBe(true)
  expect(parse_config).toHaveBeenCalledTimes(1)
  const dom_document = assert_ok(
    await engine.parse(
      `${document.source}\n\n${fence(`ts`, `document.title = 'Docs'`)}`,
      { filename: document.filename },
    ),
  )
  expect((await checker.check(dom_document)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2584` }),
  )
  base.compilerOptions.lib.push(`dom`)
  await write_json(base_path, base)
  expect((await checker.check(dom_document)).ok).toBe(true)
  expect(parse_config).toHaveBeenCalledTimes(2)
  await writeFile(ambient_path, `declare const PROJECT_LABEL: number`)
  expect((await checker.check(document)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2322` }),
  )
  expect(parse_config).toHaveBeenCalledTimes(2)
  await writeFile(ambient_path, `declare const PROJECT_LABEL: string`)
  await rm(base_path)
  const missing = await checker.check(document)
  expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: `TS5083` }))
  await write_json(base_path, base)
  expect((await checker.check(document)).ok).toBe(true)
  await writeFile(base_path, `{ "compilerOptions": { "strict": } }`)
  const invalid = await checker.check(document)
  expect(invalid.ok).toBe(false)
  expect(invalid.diagnostics[0].range.start.filename).toBe(base_path)
  const original_diagnostics = structuredClone(invalid.diagnostics)
  Object.assign(invalid.diagnostics[0], {
    severity: `warning`,
    code: `changed`,
    message: `changed`,
  })
  Reflect.set(invalid.diagnostics[0].range.start, `filename`, `changed.md`)
  expect((await checker.check(document)).diagnostics).toEqual(original_diagnostics)
  await write_json(base_path, base)
  expect(
    (await check_document(document, { tsconfig: resolve(root, `tsconfig.json`) })).ok,
  ).toBe(true)
  const override = create_checker({ root, compiler_options: { types: [] } })
  expect((await override.check(document)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2304` }),
  )

  const nested = create_checker({ root: resolve(root, `docs`) })
  expect((await nested.check(document)).ok).toBe(true)
  await write_json(resolve(root, `docs/tsconfig.json`), {
    extends: `../tsconfig.json`,
    compilerOptions: { types: [] },
  })
  expect((await nested.check(document)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2304` }),
  )

  const explicit = create_checker({ root, tsconfig: `missing.json` })
  expect((await explicit.check(document)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS5083` }),
  )
  await write_json(resolve(root, `missing.json`), { extends: `./tsconfig.json` })
  expect((await explicit.check(document)).ok).toBe(true)

  await write_json(resolve(root, `node_modules/fixture-config/alternate.json`), {
    extends: `../../settings/base.json`,
    compilerOptions: { types: [] },
  })
  await write_json(package_path, { tsconfig: `alternate.json` })
  expect((await checker.check(document)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2304` }),
  )
  await write_json(package_path, { tsconfig: `config.json` })
  expect((await checker.check(document)).ok).toBe(true)
  const path_override = create_checker({
    root,
    compiler_options: { paths: { $value: [`./src/value.ts`] } },
  })

  expect(await path_override.check(document)).toMatchObject({
    ok: true,
    diagnostics: [],
  })

  for (const module of [`CommonJS`, `NodeNext`]) {
    await write_json(resolve(root, `tsconfig.json`), {
      extends: `fixture-config`,
      compilerOptions: { module },
      files: [],
    })
    expect(await checker.check(document)).toMatchObject({ ok: true, diagnostics: [] })
  }
})
