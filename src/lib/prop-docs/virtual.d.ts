// Emitted by the `svelte-widgets/prop-docs/vite-plugin` Vite plugin. Reference this file
// from your app.d.ts: /// <reference types="svelte-widgets/prop-docs/virtual" />
declare module 'virtual:prop-docs' {
  import type { ComponentDocLoaders } from 'svelte-widgets'

  // one lazy loader per component name
  const loaders: ComponentDocLoaders
  export default loaders
}
declare module 'virtual:prop-docs/*' {
  import type { ComponentDoc } from 'svelte-widgets'

  const doc: ComponentDoc
  export default doc
}
