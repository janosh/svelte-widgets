import { svelte } from '@sveltejs/vite-plugin-svelte'
// self-reference resolves via package.json exports to the packaged dist build,
// proving the live-examples subpath (incl. its vite parseSync import) is consumable
import { vite_plugin as live_examples } from 'svelte-widgets/live-examples'
import source_links from 'svelte-widgets/source-links/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte(), ...live_examples(), source_links()],
  resolve: {
    conditions: [`svelte`, `browser`],
  },
  build: {
    emptyOutDir: true,
    outDir: `test-results/package-smoke-build`,
    rolldownOptions: {
      input: `tests/package-smoke/index.html`,
    },
  },
})
