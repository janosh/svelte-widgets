import { redirect } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

export const prerender = true

export const load: LayoutLoad = ({ url }) => {
  if (url.pathname.endsWith(`.md`)) redirect(307, url.pathname.replace(/\.md$/u, ``))
}
