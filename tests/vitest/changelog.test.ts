import { load } from '$root/src/routes/changelog/+page.server'
import { expect, test } from 'vitest'

test(`changelog transform preserves code spans and wraps entity tags`, async () => {
  const { changelog } = await load()
  const { code: html } = changelog

  // regression: an earlier transform injected backticks before every entity, splitting
  // existing code spans mid-way
  expect(html).toContain(`<code>ul.selected &gt; li</code>`)
  expect(html).toContain(`<code>&lt;input&gt;</code>`)
  // # Changelog stays h1, ## version headings stay h2
  expect(html).toMatch(/<h1[ >]/u)
  expect(html).toContain(`<h2 id="v11-8-0">`)
  expect(html).not.toContain(`\``)
})
