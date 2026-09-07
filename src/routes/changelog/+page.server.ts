import changelog from '$root/changelog.md?raw'
import { heading_ids } from '$lib/heading-anchors'
import { render_markdown, create_markdown, assert_ok } from '$lib/markdown'

export const load = async () => {
  const document = assert_ok(
    await create_markdown().parse(changelog, { dialect: `markdown` }),
  )
  const html = assert_ok(await render_markdown(document))
  const { code } = heading_ids().markup({ content: html })
  return { changelog: { code } }
}
