import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { generate_icons } from './scripts/generate-icons.ts'
import { heading_ids } from './src/lib/heading-anchors.ts'
import { default_highlighter } from './src/lib/highlight/default-highlighter.ts'
import { markdown_vite } from './src/lib/markdown/vite.ts'
import source_links from './src/lib/source-links/vite-plugin.ts'
import { make_config } from './src/lib/vite-config.ts'

await generate_icons()

const base_segment = (process.env.BASE_PATH ?? ``).replaceAll(/^\/+|\/+$/gu, ``)
const base_path: `` | `/${string}` = base_segment ? `/${base_segment}` : ``
const docs = markdown_vite({
  math: true,
  typography: true,
  highlight: default_highlighter.highlight,
  examples: {
    wrapper: '/src/lib/CodeExample.svelte',
    collapsible: true,
    hide_style: true,
  },
})

// passed inline to sveltekit() (Kit >= 2.62) so no separate svelte.config.ts is needed;
// kit options (adapter, alias, paths, prerender) sit at the top level rather than under `kit`.
// svelte-package only reads svelte.config.*, so it packages src/lib with default config: nothing
// in src/lib relies on these preprocessors or aliases and the `package` script drops Markdown guides.
const svelte_config = {
  extensions: [`.svelte`, `.md`],

  preprocess: [docs.preprocess, heading_ids()],

  adapter: adapter(),
  paths: { base: base_path },

  alias: {
    $root: `.`,
    $site: `./src/site`,
    'svelte-widgets': `./src/lib`,
  },

  prerender: {
    handleHttpError: ({ status, referrer, message }) => {
      // Ignore 404s from the /nav demo page which contains links to non-existent routes
      if (status === 404 && referrer === `${base_path}/nav`) return
      throw new Error(message)
    },
  },

  vitePlugin: {
    inspector: true,
  },
} satisfies Parameters<typeof sveltekit>[0]

export default {
  // shared lint/fmt/build/staged, published as svelte-widgets/vite-config
  ...make_config({
    staged: {
      '*.test.ts': `sh -c '! grep -E "(test|describe)\\.only\\(" "$@"' --`,
      // afterAll is a Vitest API; `fo` is a fixture splitting `foo` across markup;
      // `alle` is German for "all", used by the label-override tests
      '*': `codespell --ignore-words-list afterall,falsy,fo,alle --check-filenames`,
    },
  }),

  plugins: [sveltekit(svelte_config), docs.plugin, source_links()],

  test: {
    include: [`tests/vitest/**/*.test.ts`],
    environment: `happy-dom`,
    css: true,
    coverage: {
      reporter: [`text`, `json-summary`],
      include: [`src/lib/**/*.{ts,svelte}`],
      thresholds: {
        statements: 95,
        branches: 89.8,
        functions: 95,
        lines: 95,
      },
    },
    setupFiles: [`tests/vitest/setup.ts`],
  },

  resolve: {
    conditions: process.env.TEST ? [`browser`] : undefined,
  },

  server: {
    fs: { allow: [`..`] }, // needed to import from $root
    port: 3000,
  },

  preview: {
    port: 3000,
  },
}
