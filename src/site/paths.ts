import { resolve } from '$app/paths'
import { page } from '$app/state'
import { demo_descriptions, demo_pages, demo_title } from '../routes/(demos)'

// SvelteKit can resolve links relatively during SSR. Navigation state needs the same
// absolute pathname on the server and client, including the configured base path.
const resolve_route = resolve as (path: string) => string
export const resolve_demo_path = (path: string): string =>
  new URL(resolve_route(path), page.url).pathname

export const current_demo_route = () =>
  demo_pages.find((route) => resolve_demo_path(route) === page.url.pathname)

export function demo_card(route: string): [string, string, string] {
  const description = demo_descriptions[route]
  if (!description) throw new Error(`Missing demo description: ${route}`)
  return [demo_title(route), resolve_demo_path(route), description]
}
