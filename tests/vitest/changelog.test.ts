import { load } from '$root/src/routes/changelog/+page.server'
import { expect, test } from 'vitest'

test(`changelog renders selectors and HTML tags as literal code`, async () => {
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
  // # Changelog stays h1, ## version headings stay h2
  expect(html).toMatch(/<h1[ >]/u)
  expect(html).toContain(`<h2 id="v11-8-0">`)
  expect(html).not.toContain(`\``)
})
