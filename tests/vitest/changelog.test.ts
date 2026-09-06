import { load } from '$root/src/routes/changelog/+page.server'
import { expect, test } from 'vitest'

test(`changelog uses consistent release sections and literal code`, async () => {
  const html = (await load()).changelog.code
  for (const code of [
    `ul.selected &gt; li`,
    `ul.options &gt; li`,
    `&lt;input&gt;`,
    `&lt;slot name="user-msg"&gt;`,
    `&lt;slot name="after-input"&gt;`,
    `&lt;base href="/svelte-multiselect" /&gt;`,
    `&lt;MultiSelect&gt;`,
  ])
    expect(html).toContain(`<code>${code}</code>`)
  const page_document = new DOMParser().parseFromString(html, `text/html`)
  expect(
    [...page_document.querySelectorAll(`h1`)].map((heading) => heading.textContent),
  ).toEqual([`Changelog`])
  const releases = [...page_document.querySelectorAll(`h2`)]
  expect(releases.length).toBeGreaterThan(50)
  for (const release of releases) {
    expect(release.textContent).toMatch(/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/u)
    const date = release.nextElementSibling
    expect(date?.tagName).toBe(`BLOCKQUOTE`)
    expect(date?.textContent.trim()).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/u)
  }
  for (const heading of page_document.querySelectorAll(`h3`)) {
    expect(heading.textContent).toBe(`New contributors`)
  }
  expect(html).toContain(`<h2 id="v11-8-0">`)
  expect(html).not.toContain(`\``)
})
