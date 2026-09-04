// Render ```svelte example blocks with highlighting and live previews.
// Import create-highlighter from its subpath to avoid this barrel's eager grammar compilation.
export type { Grammar, Highlighter, StarryNight } from './create-highlighter.ts'
export { hast_to_html } from './hast.ts'
export { starry_night, starry_night_highlighter } from './highlighter.ts'
export {
  default as mdsvex_transform,
  EXAMPLE_COMPONENT_PREFIX,
  EXAMPLE_MODULE_PREFIX,
} from './mdsvex-transform.ts'
export { default as vite_plugin } from './vite-plugin.ts'
