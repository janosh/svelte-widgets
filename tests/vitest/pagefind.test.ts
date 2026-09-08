import { create_pagefind_loader, strip_html_extension } from '$lib/pagefind'
import { expect, test, vi } from 'vitest'

test(`retries a failed index download after its caller aborts`, async () => {
  const pending = Promise.withResolvers<never>()
  const search = vi.fn(async () => ({ results: [] }))
  const load_pagefind = vi
    .fn(async () => ({ search }))
    .mockImplementationOnce(() => pending.promise)
  const load = create_pagefind_loader(`unused`, () => ({ load_pagefind }))
  const controller = new AbortController()
  const params = { search: `guide`, offset: 0, limit: 1 }
  const aborted = load({ ...params, signal: controller.signal }).catch(
    (error: unknown) => error,
  )
  controller.abort()
  pending.reject(new Error(`Index unavailable`))
  await expect(aborted).resolves.toMatchObject({ name: `AbortError` })
  await expect(load(params)).resolves.toMatchObject({ options: [], hasMore: false })
  expect(load_pagefind).toHaveBeenCalledTimes(2)
  expect(search).toHaveBeenCalledExactlyOnceWith(`guide`)
})

test.each([
  [`before`, false],
  [`index`, false],
  [`search`, false],
  [`search`, true],
  [`shard`, false],
  [`shard`, true],
])(
  `cancels at %s (reject: %s) without disrupting another query`,
  async (stage, reject) => {
    const entered = Promise.withResolvers<undefined>()
    const pending = Promise.withResolvers<undefined>()
    const pause = () => {
      entered.resolve(undefined)
      return pending.promise
    }
    const results = Object.fromEntries(
      [`obsolete`, `current`].map((query) => [
        query,
        [0, 1].map((idx) => ({
          id: `${query}-${idx}`,
          data: vi.fn(async () => {
            if (query === `obsolete` && stage === `shard`) await pause()
            return {
              url: `/${query}-${idx}/`,
              plain_excerpt: `Content`,
              meta: {},
              sub_results: [],
            }
          }),
        })),
      ]),
    )
    const search = vi.fn(async (query: string) => {
      if (query === `obsolete` && stage === `search`) await pause()
      return { results: results[query] }
    })
    const load_pagefind = vi.fn(async () => {
      if (stage === `index`) await pause()
      return { search }
    })
    const load = create_pagefind_loader(`unused`, () => ({ load_pagefind }))
    const controller = new AbortController()
    const params = { search: `obsolete`, offset: 1, limit: 1, signal: controller.signal }
    if (stage === `before`) controller.abort()
    const aborted = load(params).catch((error: unknown) => error)
    if (stage !== `before`) await entered.promise
    controller.abort()
    const current = load({ search: `current`, offset: 0, limit: 1 })
    if (reject) pending.reject(new Error(`Obsolete request failed`))
    else pending.resolve(undefined)
    await expect(aborted).resolves.toMatchObject({ name: `AbortError` })
    expect((await current).options.map(({ label }) => label)).toEqual([`Current 0`])
    const next = await load({ search: `current`, offset: 1, limit: 1 })
    expect(next.options.map(({ label }) => label)).toEqual([`Current 0`, `Current 1`])
    expect(next.hasMore).toBe(false)
    expect(load_pagefind).toHaveBeenCalledOnce()
    expect(search.mock.calls.filter(([query]) => query === `current`)).toHaveLength(1)
    expect(results.obsolete[0].data).toHaveBeenCalledTimes(stage === `shard` ? 1 : 0)
    expect(results.obsolete[1].data).not.toHaveBeenCalled()
    for (const result of results.current) expect(result.data).toHaveBeenCalledOnce()
  },
)

test.each([
  [
    `/phase-diagram.html#temperature-composition`,
    `/phase-diagram#temperature-composition`,
  ],
  [`/download?file=guide.html`, `/download?file=guide.html`],
  [`/docs/index.html?next=/legacy.html`, `/docs/?next=/legacy.html`],
  [`/docs/#config.html`, `/docs/#config.html`],
])(`strips only the pathname HTML suffix in %s`, (url, expected) => {
  expect(strip_html_extension(url)).toBe(expected)
})

test.each([
  [0, 1, 1, 1],
  [0, 2, 1, 1],
  [2, 1, 1, 1],
  [2, 2, 1, 1],
  [2, 1, 4, 2],
  [0, 1, 1, 1, 1],
])(
  `retries offset %s with %s failed shards, %s sections and %s failures per shard`,
  async (offset, failures, sections, attempts, retry_limit = 2) => {
    const results = [
      ...Array.from({ length: offset }, (_, idx) => `/first-${idx}/`),
      `/reference-guide.html?tab=api`,
      `/docs/`,
    ].map((url) => ({
      id: url,
      data: vi.fn(async () => ({
        url,
        plain_excerpt: `Content`,
        meta: {},
        sub_results:
          url.includes(`reference-guide`) && sections > 1
            ? Array.from({ length: sections }, (_, idx) => ({
                title: `Section ${idx}`,
                url: `${url}#section-${idx}`,
                plain_excerpt: `Content`,
              }))
            : [],
      })),
    }))
    for (const result of results.slice(offset, offset + failures))
      for (let attempt = 0; attempt < attempts; attempt++)
        result.data.mockRejectedValueOnce(new Error(`Fragment unavailable`))
    const search = vi.fn(async () => ({ results }))
    const load_pagefind = vi.fn(async () => ({ search }))
    const load = create_pagefind_loader(`unused`, () => ({ load_pagefind }))
    const params = { search: ` content `, offset: 0, limit: 2 }
    const previous = Array.from({ length: offset }, (_, idx) => `First ${idx}`)
    if (offset) {
      const first = await load(params)
      expect(first.options.map(({ label }) => label)).toEqual(previous)
      expect(first.hasMore).toBe(true)
    }
    for (let attempt = 0; attempt < attempts; attempt++) {
      const partial = await load({ ...params, offset })
      expect(partial.options.map(({ label }) => label)).toEqual([
        ...previous,
        ...(failures === 1 ? [`Docs`] : []),
      ])
      expect(partial.replace).toBe(true)
      expect(partial.error?.message).toBe(`Fragment unavailable`)
      expect(partial.hasMore).toBe(true)
    }
    // Retry restarts the UI offset but must keep already-visible results and their order.
    const recovered = await load({ ...params, limit: retry_limit })
    expect(recovered.options.map(({ label }) => label)).toEqual([
      ...previous,
      ...(sections > 1
        ? Array.from({ length: sections }, (_, idx) => `Reference Guide › Section ${idx}`)
        : [`Reference Guide`]),
      `Docs`,
    ])
    expect(recovered).toMatchObject({
      replace: true,
      hasMore: retry_limit === 1,
      error: undefined,
    })
    expect(search).toHaveBeenCalledExactlyOnceWith(`content`)
    expect(load_pagefind).toHaveBeenCalledOnce()
    for (const [idx, result] of results.entries())
      expect(result.data).toHaveBeenCalledTimes(
        idx >= offset && idx < offset + failures ? attempts + 1 : 1,
      )
  },
)

test.each([0, 10_000])(
  `paginates cached sections with %s unloaded matches`,
  async (unloaded_count) => {
    const data = vi.fn(async () => ({
      url: `/guide.html`,
      plain_excerpt: `Fallback excerpt`,
      meta: { title: `Guide` },
      sub_results: [
        { title: `Guide`, url: `/guide.html`, plain_excerpt: `  A &lt; B\n &amp; C  ` },
        { title: `Details`, url: `/guide.html#details`, plain_excerpt: `x`.repeat(250) },
      ],
    }))
    const unloaded_data = vi.fn()
    const search = vi.fn(async () => ({
      results: [
        { id: `guide`, data },
        ...Array.from({ length: unloaded_count }, (_, idx) => ({
          id: `unloaded-${idx}`,
          data: unloaded_data,
        })),
      ],
    }))
    const first_navigate = vi.fn()
    const options = {
      load_pagefind: async () => ({ search }),
      navigate: first_navigate,
      transform_url: (url: string) => url,
    }
    const load = create_pagefind_loader(`unused`, () => options)
    expect(await load({ search: ` `, offset: 0, limit: 1 })).toEqual({
      options: [],
      hasMore: false,
    })
    expect(search).not.toHaveBeenCalled()
    const collect = vi.spyOn(Array.prototype, `flat`)
    const first = await load({ search: `guide`, offset: 0, limit: 1 })
    expect(first.hasMore).toBe(true)
    expect(first.options).toMatchObject([{ label: `Guide`, description: `A < B & C` }])
    const second = await load({ search: `guide`, offset: 1, limit: 1 })
    // Cached arrays grow in place, so inspect their extent rather than summing live references.
    expect(collect).toHaveBeenCalled()
    expect(
      collect.mock.contexts.every((pages) => Array.isArray(pages) && pages.length <= 1),
    ).toBe(true)
    collect.mockRestore()
    expect(unloaded_data).not.toHaveBeenCalled()
    expect(second.hasMore).toBe(unloaded_count > 0)
    expect(second.options).toHaveLength(2)
    expect(second.options[1]).toMatchObject({
      id: `pagefind:guide:1:/guide.html#details`,
      label: `Guide › Details`,
      description: `${`x`.repeat(239)}…`,
    })
    options.navigate = vi.fn()
    options.transform_url = (url) => `/docs${strip_html_extension(url)}`
    second.options[1].action(`unused`)
    expect(options.navigate).toHaveBeenCalledExactlyOnceWith(`/docs/guide#details`, {
      query: `guide`,
      label: `Guide › Details`,
      description: `${`x`.repeat(239)}…`,
    })
    expect(first_navigate).not.toHaveBeenCalled()
    expect(search).toHaveBeenCalledOnce()
    expect(data).toHaveBeenCalledOnce()
  },
)
