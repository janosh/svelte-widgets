// Live examples: ```svelte example blocks become rendered components with highlighting and
// live preview. From `./create-highlighter` it re-exports types only: the barrel already
// pulls in `starry_night`, whose top-level await compiles the 34-grammar common bundle, so
// the factory stays at the `svelte-widgets/live-examples/create-highlighter` subpath rather
// than costing importers the very thing it avoids.
export type { Grammar, Highlighter, StarryNight } from './create-highlighter.ts'
export { hast_to_html } from './hast.ts'
export { starry_night, starry_night_highlighter } from './highlighter.ts'
export {
  default as mdsvex_transform,
  EXAMPLE_COMPONENT_PREFIX,
  EXAMPLE_MODULE_PREFIX,
} from './mdsvex-transform.ts'
export { default as vite_plugin } from './vite-plugin.ts'
