import type { LoadOptionsFn } from '$lib/types'
import { fail } from '@sveltejs/kit'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ModuleKind, transpileModule } from 'typescript'
import { describe, expect, test, vi } from 'vitest'

const input_docs = `${import.meta.dirname}/../../src/routes/(demos)/(inputs)/(multiselect)`
const async_docs = readFileSync(`${input_docs}/infinite-scroll/+page.md`, `utf8`)
const overview = readFileSync(`${input_docs}/multiselect/+page.md`, `utf8`)

const evaluate_recipe = (code: string, globals: Record<string, unknown>) =>
  runInNewContext(
    transpileModule(code, { compilerOptions: { module: ModuleKind.CommonJS } })
      .outputText,
    { exports: {}, ...globals },
  )

// Execute the published recipes themselves so fixes cannot drift from copied code.
function recipe_loader(source: string, fetch_mock: typeof fetch, cursor = false) {
  const match = cursor
    ? /```ts\n(?<code>[\s\S]*?function make_load_options[\s\S]*?)\n```/u.exec(source)
    : /(?<code>async function load_options\([\s\S]*?\n *\})\n/u.exec(source)
  const code = match?.groups?.code
  if (!code) throw new Error(`Missing ${cursor ? `cursor` : `offset`} loader recipe`)
  return evaluate_recipe(`${code}\n${cursor ? `make_load_options()` : `load_options`}`, {
    fetch: fetch_mock,
    URLSearchParams,
  }) as LoadOptionsFn<string>
}

function query_params(request_url: RequestInfo | URL | undefined) {
  if (typeof request_url !== `string`)
    throw new Error(`Expected the recipe to fetch a URL string`)
  return new URL(request_url, `https://example.com`).searchParams
}

const params = { search: `R&D #1`, offset: 0, limit: 20 }

test.each([
  [[`Red`, `Red`], { status: 400, data: { colors: [`Red`], error: `boring` } }],
  [[`Blue`, `Blue`, `invalid`, 1], { colors: [`Blue`], success: true }],
  [[`invalid`], { status: 400, data: { colors: [], error: `missing` } }],
])(`copied form action validates and deduplicates %j`, async (colors, expected) => {
  const source = readFileSync(`${input_docs}/kit-form-actions/+page.md`, `utf8`)
  const code = /```ts\n(?<code>import \{ fail \}[\s\S]*?)\n```/u.exec(source)?.groups
    ?.code
  if (!code) throw new Error(`Missing documented form action`)
  const action = evaluate_recipe(`${code}\nexports.actions['validate-form']`, {
    require: (name: string) => {
      if (name !== `@sveltejs/kit`) throw new Error(`Unexpected recipe import: ${name}`)
      return { fail }
    },
  }) as (event: { request: Request }) => Promise<unknown>
  const body = new FormData()
  body.set(`colors`, JSON.stringify(colors))
  const request = new Request(`https://example.com/`, { method: `POST`, body })
  expect(await action({ request })).toEqual(expected)
})

describe(`documented async loaders`, () => {
  test.each([
    [`REST recipe`, async_docs.split(`### REST API Recipe`)[1]],
    [`props reference`, overview],
  ])(
    `%s handles HTTP errors, retry, query encoding, and empty results`,
    async (_label, source) => {
      const fetch_mock = vi.fn<typeof fetch>()
      const load_options = recipe_loader(source, fetch_mock)
      const controller = new AbortController()
      fetch_mock.mockResolvedValueOnce(new Response(`unavailable`, { status: 503 }))
      await expect(
        load_options({ ...params, signal: controller.signal }),
      ).rejects.toThrow(`HTTP 503`)
      const [request_url, init] = fetch_mock.mock.calls[0]
      expect(query_params(request_url)).toEqual(
        new URLSearchParams({ q: params.search, skip: `0`, take: `20` }),
      )
      expect(init?.signal).toBe(controller.signal)

      fetch_mock.mockResolvedValueOnce(Response.json({ items: [`first`], total: 2 }))
      await expect(load_options(params)).resolves.toEqual({
        options: [`first`],
        has_more: true,
      })
      fetch_mock.mockResolvedValueOnce(Response.json({ items: [], total: 0 }))
      await expect(load_options({ ...params, search: `no match` })).resolves.toEqual({
        options: [],
        has_more: false,
      })
    },
  )

  test(`cursor recipe preserves the current cursor across aborted responses and failed pages`, async () => {
    const stale_json = Promise.withResolvers<unknown>()
    const fetch_mock = vi.fn<typeof fetch>()
    const load_options = recipe_loader(async_docs, fetch_mock, true)
    const controller = new AbortController()
    // Simulate a transport that ignores cancellation while parsing the first response.
    const stale_response = Response.json({})
    vi.spyOn(stale_response, `json`).mockReturnValue(stale_json.promise)
    fetch_mock.mockResolvedValueOnce(stale_response)
    const stale_request = load_options({ ...params, signal: controller.signal })
    await Promise.resolve()
    controller.abort()

    fetch_mock.mockResolvedValueOnce(
      Response.json({ items: [`new`], next_cursor: `next & #` }),
    )
    await expect(load_options({ ...params, search: `new` })).resolves.toEqual({
      options: [`new`],
      has_more: true,
    })
    stale_json.resolve({ items: [`old`], next_cursor: `wrong` })
    await expect(stale_request).rejects.toMatchObject({ name: `AbortError` })

    fetch_mock.mockResolvedValueOnce(new Response(`unavailable`, { status: 503 }))
    await expect(load_options({ ...params, offset: 1, search: `new` })).rejects.toThrow(
      `HTTP 503`,
    )
    fetch_mock.mockResolvedValueOnce(
      Response.json({ items: [`last`], next_cursor: null }),
    )
    await expect(load_options({ ...params, offset: 1, search: `new` })).resolves.toEqual({
      options: [`last`],
      has_more: false,
    })
    for (const [request_url] of fetch_mock.mock.calls.slice(2)) {
      expect(query_params(request_url).get(`cursor`)).toBe(`next & #`)
    }

    fetch_mock.mockResolvedValueOnce(Response.json({ items: [], next_cursor: null }))
    await expect(load_options(params)).resolves.toEqual({ options: [], has_more: false })
    const last_request = fetch_mock.mock.calls.at(-1)?.[0]
    expect(query_params(last_request).has(`cursor`)).toBe(false)
  })
})
