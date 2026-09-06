import changelog from '$root/changelog.md?raw'
import { heading_ids } from '$lib/heading-anchors'
import { render_markdown } from '$lib/markdown'

export const load = async () => {
  const html = await render_markdown(changelog)
  const { code } = heading_ids().markup({ content: html })
  return { changelog: { code } }
}
