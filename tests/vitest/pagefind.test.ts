import { create_pagefind_loader, strip_html_extension } from '$lib/pagefind'
import { expect, test, vi } from 'vitest'

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
])(
  `retries offset %s with %s failed shards, %s sections and %s failures per shard`,
  async (offset, failures, sections, attempts) => {
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
    const recovered = await load(params)
    expect(recovered.options.map(({ label }) => label)).toEqual([
      ...previous,
      ...(sections > 1
        ? Array.from({ length: sections }, (_, idx) => `Reference Guide › Section ${idx}`)
        : [`Reference Guide`]),
      `Docs`,
    ])
    expect(recovered).toMatchObject({ replace: true, hasMore: false, error: undefined })
    expect(search).toHaveBeenCalledExactlyOnceWith(`content`)
    expect(load_pagefind).toHaveBeenCalledOnce()
    for (const [idx, result] of results.entries())
      expect(result.data).toHaveBeenCalledTimes(
        idx >= offset && idx < offset + failures ? attempts + 1 : 1,
      )
  },
)

test(`paginates cached sections, decodes excerpts and uses current navigation callbacks`, async () => {
  const data = vi.fn(async () => ({
    url: `/guide.html`,
    plain_excerpt: `Fallback excerpt`,
    meta: { title: `Guide` },
    sub_results: [
      { title: `Guide`, url: `/guide.html`, plain_excerpt: `  A &lt; B\n &amp; C  ` },
      { title: `Details`, url: `/guide.html#details`, plain_excerpt: `x`.repeat(250) },
    ],
  }))
  const search = vi.fn(async () => ({ results: [{ id: `guide`, data }] }))
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
  const first = await load({ search: `guide`, offset: 0, limit: 1 })
  expect(first.hasMore).toBe(true)
  expect(first.options).toMatchObject([{ label: `Guide`, description: `A < B & C` }])
  const second = await load({ search: `guide`, offset: 1, limit: 1 })
  expect(second.hasMore).toBe(false)
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
})
