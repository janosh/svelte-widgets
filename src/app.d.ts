/// <reference types="@sveltejs/kit" />

declare module '*?toc' {
  import type { TocHeadingData } from 'svelte-widgets'
  const items: readonly TocHeadingData[]
  export default items
}

declare module '*.md'
declare module '*package.json'

declare module '*.yaml' {
  const data: unknown
  export default data
}

declare module '*.yml' {
  const data: unknown
  export default data
}

declare module '*.cff' {
  const data: unknown
  export default data
}
