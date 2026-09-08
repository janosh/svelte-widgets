import changelog from '$root/changelog.md?raw'
import { create_markdown, assert_ok } from '$lib/markdown'

export const load = async () => ({
  changelog: { code: assert_ok(await create_markdown().render(changelog)) },
})
