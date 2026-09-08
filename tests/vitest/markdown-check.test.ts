import { relative, resolve } from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import * as typescript from 'typescript'
import {
  check_examples,
  check_document,
  type CheckResult,
  type CheckOptions,
} from '$lib/markdown/check'
import { assert_ok, create_markdown, DiagnosticError } from '$lib/markdown'
import { describe, expect, onTestFinished, test, vi } from 'vitest'

const filename = resolve(`tests/checked-examples.md`)
const fence = (language: string, code: string, info = `check`) =>
  `\`\`\`${language} ${info}\n${code}\n\`\`\``
const temporary_directory = async () => {
  const directory = await mkdtemp(resolve(`tests/.checked-docs-`))
  onTestFinished(() => rm(directory, { recursive: true }))
  return directory
}
const write_json = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value))

const check_source = async (
  source: string,
  options: CheckOptions = {},
): Promise<CheckResult> => {
  options = { filename, ...options }
  const parsed = await create_markdown().parse(source, {
    filename: options.filename,
  })
  return parsed.ok
    ? check_document(parsed.value, options)
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
    const invalid_component = `<script>let value = $state(0)</script>\r\n\r\n<button onclick={()=>{}} on:click={()=>{}}>Click</button>\r\n`
    await writeFile(resolve(directory, `Counter.svelte`), invalid_component)
    const invalid_import = await check(source)
    expect(invalid_import.ok).toBe(false)
    expect(diagnostics_at_start(invalid_import)).toContainEqual(
      expect.objectContaining({
        filename: resolve(directory, `Counter.svelte`),
        line: 3,
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
  }, 60_000)

  test.each([
    [`blockquote`, '> ```ts check\n> const value: number = "bad"\n> ```', [[2, 9]]],
    [
      `repeated nested fences with frontmatter and CRLF`,
      `---\ntitle: Repeated\n---\n\n${fence(`ts`, `const value: number = "bad"`)}\n\n> ${fence(`ts`, `const value: number = "bad"`).replaceAll(`\n`, `\n> `)}\n\n- Nested\n\n  ${fence(`ts`, `const value: number = "bad"`).replaceAll(`\n`, `\n  `)}`.replaceAll(
        `\n`,
        `\r\n`,
      ),
      [
        [6, 7],
        [10, 9],
        [16, 9],
      ],
    ],
  ] as const)(
    `maps diagnostic locations and token spans in %s`,
    async (_, source, positions) => {
      const result = await check_source(source)
      const offsets = [...source.matchAll(/value/gu)].map(({ index }) => index)
      expect(result.diagnostics).toMatchObject(
        positions.map(([line, column], idx) => ({
          code: `TS2322`,
          range: { start: { filename, line, column, offset: offsets[idx] } },
        })),
      )
      for (const { range } of result.diagnostics)
        expect(source.slice(range.start.offset, range.end.offset)).toBe(`value`)
      expect(result.value).toEqual({ checked: positions.length, asserted: 0 })
    },
  )

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

  test.each([false, true])(
    `explicit async assertions preserve interaction results (fail=%s)`,
    async (fail) => {
      const code = `const button = document.createElement("button");\nbutton.textContent = "0";\nbutton.onclick = () => { button.textContent = "1" };\ndocument.body.append(button);`
      const assert_increment = async ({ code: source }: { code: string }) => {
        // Execution belongs to this caller, never to the static checker.
        runInNewContext(source, { document })
        const button = document.querySelector(`button`)
        expect(button).not.toBeNull()
        button?.click()
        await Promise.resolve()
        expect(button?.textContent).toBe(`1`)
        if (fail) throw new Error(`Expected count 2, received 1`)
      }
      const source = fence(`js`, code, `test="increments"`)
      const result = await check_source(source, {
        assertions: { increments: assert_increment },
      })
      expect(result).toMatchObject({
        ok: !fail,
        value: { checked: 1, asserted: fail ? 0 : 1 },
      })
      expect(diagnostics_at_start(result)).toMatchObject(
        fail
          ? [
              {
                filename,
                line: 1,
                column: 1,
                code: `assertion`,
                message: `increments: Expected count 2, received 1`,
              },
            ]
          : [],
      )
    },
  )

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

test(`one-shot batches resolve each document's imports and rebuild after dependency changes`, async () => {
  const directory = await temporary_directory()
  const nested = resolve(directory, `nested`)
  await mkdir(nested)
  const dependency = resolve(directory, `value.ts`)
  await writeFile(dependency, `export const value = 1`)
  await writeFile(resolve(nested, `value.ts`), `export const value = 'text'`)
  const documents = await Promise.all(
    [
      [directory, `number`],
      [nested, `string`],
    ].map(async ([folder, type]) => {
      const document_filename = relative(process.cwd(), resolve(folder, `guide.md`))
      return assert_ok(
        await create_markdown().parse(
          fence(
            `ts`,
            `import { value } from './value'; const count: ${type} = value`,
            `test="validate"`,
          ),
          { filename: document_filename },
        ),
      )
    }),
  )
  const fences = documents.flatMap(({ manifest }) => manifest.fences)
  const assertion = vi.fn()
  const create_program = vi.fn(typescript.createProgram)
  const options: CheckOptions = {
    typescript: new Proxy(typescript, {
      get: (target, key, receiver) =>
        key === `createProgram` ? create_program : Reflect.get(target, key, receiver),
    }),
    assertions: { validate: assertion },
  }
  expect(await check_examples(fences, options)).toMatchObject({
    ok: true,
    value: { checked: 2, asserted: 2 },
  })
  expect((await check_document(documents[0], options)).ok).toBe(true)
  expect(create_program).toHaveBeenCalledTimes(2)
  expect(create_program.mock.calls.every((args) => args[3] === undefined)).toBe(true)
  assertion.mockClear()
  await writeFile(dependency, `export const value = 'wrong'`)
  expect((await check_examples(fences, options)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2322` }),
  )
  expect(assertion).not.toHaveBeenCalled()
  await rm(dependency)
  expect((await check_document(documents[0], options)).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2307` }),
  )
  await writeFile(dependency, `export const value = 2`)
  expect((await check_examples(fences, options)).ok).toBe(true)
  expect(await check_examples([])).toEqual({
    ok: true,
    diagnostics: [],
    value: { checked: 0, asserted: 0 },
  })
}, 60_000)

test(`explicit configuration inherits aliases and types without discovering a project config`, async () => {
  const directory = await temporary_directory()
  for (const folder of [`settings`, `types/project`, `node_modules/fixture-config`])
    await mkdir(resolve(directory, folder), { recursive: true })
  // An unrelated nearest config must never affect a standalone check.
  await writeFile(resolve(directory, `tsconfig.json`), `{ broken`)
  const page_filename = resolve(directory, `guide.md`)
  const standalone = await check_source(fence(`ts`, `const value: number = 1`), {
    filename: page_filename,
  })
  expect(standalone.ok).toBe(true)
  await writeFile(resolve(directory, `value.ts`), `export const value = 1`)
  await writeFile(
    resolve(directory, `types/project/index.d.ts`),
    `declare const PROJECT_LABEL: string`,
  )
  await write_json(resolve(directory, `settings/base.json`), {
    compilerOptions: {
      lib: [`es2023`],
      types: [`project`],
      typeRoots: [`../types`],
      paths: { $value: [`../value.ts`] },
      strict: true,
      composite: true,
      incremental: true,
      rootDir: `../application`,
    },
  })
  await write_json(resolve(directory, `node_modules/fixture-config/package.json`), {
    tsconfig: `config.json`,
  })
  await write_json(resolve(directory, `node_modules/fixture-config/config.json`), {
    extends: `../../settings/base.json`,
  })
  const config_path = resolve(directory, `docs.json`)
  await write_json(config_path, { extends: `fixture-config`, files: [] })
  const source = fence(
    `ts`,
    `import { value } from '$value'; const count: number = value; const label: string = PROJECT_LABEL; [count].toSorted()`,
  )
  const check = (options: CheckOptions = {}) =>
    check_source(source, { filename: page_filename, tsconfig: `docs.json`, ...options })
  expect(await check()).toMatchObject({ ok: true, diagnostics: [] })
  expect(
    (await check({ compiler_options: { paths: { $value: [`./value.ts`] } } })).ok,
  ).toBe(true)
  expect((await check({ compiler_options: { types: [] } })).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS2304` }),
  )
  await writeFile(config_path, `{ "compilerOptions": { "strict": } }`)
  const invalid = await check()
  expect(invalid.ok).toBe(false)
  expect(invalid.diagnostics[0].range.start.filename).toBe(config_path)
  await rm(config_path)
  expect((await check()).diagnostics).toContainEqual(
    expect.objectContaining({ code: `TS5083` }),
  )
}, 60_000)
