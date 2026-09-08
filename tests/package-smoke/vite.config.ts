import { svelte } from '@sveltejs/vite-plugin-svelte'
import { create_markdown } from 'svelte-widgets/markdown'
import { markdown_vite } from 'svelte-widgets/markdown/vite'
import { asset_imports } from 'svelte-widgets/assets'
import { yaml_plugin } from 'svelte-widgets/yaml'
import source_links from 'svelte-widgets/source-links/vite-plugin'
import { defineConfig } from 'vite'

const docs = markdown_vite(create_markdown({ examples: {} }))

export default defineConfig({
  plugins: [
    svelte({
      extensions: [`.svelte`, `.md`],
      preprocess: [docs.preprocess, asset_imports()],
    }),
    yaml_plugin(),
    docs.plugin,
    source_links(),
  ],
  resolve: {
    conditions: [`svelte`, `browser`],
  },
})
