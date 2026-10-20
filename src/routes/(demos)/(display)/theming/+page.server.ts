import { collect_css_vars, shared_min_groups } from '#site/css-vars.ts'
import { globSync, readFileSync } from 'node:fs'

// Read from disk on the prerendered server so the tables can't drift from the components
// and the library source stays out of the bundle. Icons hold no CSS.
export const load = () => {
  const paths = globSync(`src/lib/**/*.{svelte,css,ts}`, {
    exclude: [`src/lib/icons/**`, `**/*.d.ts`],
  })
  const sources = Object.fromEntries(
    paths.map((path) => [`/${path}`, readFileSync(path, `utf8`)]),
  )
  return { ...collect_css_vars(sources), shared_min_groups }
}
