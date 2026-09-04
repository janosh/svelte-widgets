import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { mdsvex } from 'mdsvex'
import { generate_icons } from './scripts/generate-icons.ts'
import { heading_ids } from './src/lib/heading-anchors.ts'
import { katex_preprocess } from './src/lib/katex.ts'
import {
  mdsvex_transform,
  starry_night_highlighter,
} from './src/lib/live-examples/index.ts'
import live_examples from './src/lib/live-examples/vite-plugin.ts'
import source_links from './src/lib/source-links/vite-plugin.ts'
import { make_config } from './src/lib/vite-config.ts'

await generate_icons()

const base_segment = (process.env.BASE_PATH ?? ``).replaceAll(/^\/+|\/+$/gu, ``)
const base_path: `` | `/${string}` = base_segment ? `/${base_segment}` : ``
const remark_plugins = [
  [
    mdsvex_transform,
    {
      defaults: {
        Wrapper: `/src/lib/CodeExample.svelte`,
        collapsible: true,
        hide_style: true,
      },
    },
  ],
]
const { before: katex_before, after: katex_after } = katex_preprocess()

// passed inline to sveltekit() (Kit >= 2.62) so no separate svelte.config.ts is needed;
// kit options (adapter, alias, paths, prerender) sit at the top level rather than under `kit`.
// svelte-package only reads svelte.config.*, so it packages src/lib with default config: nothing
// in src/lib relies on these preprocessors or aliases and the `package` script drops the one .md.
const svelte_config = {
  extensions: [`.svelte`, `.md`],

  // KaTeX before/after mdsvex so markdown never sees rendered HTML; heading IDs last.
  preprocess: [
    katex_before,
    mdsvex({
      remarkPlugins: remark_plugins,
      extensions: [`.md`],
      highlight: { highlighter: starry_night_highlighter },
    }),
    katex_after,
    heading_ids(),
  ],

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
      // shared hook runs the JS svelte-check; CI here uses the Rust port
      '*.{ts,svelte}': `sh -c 'npx svelte-kit sync && npx svelte-check-rs --threshold error'`,
      '*.test.ts': `sh -c '! grep -E "(test|describe)\\.only\\(" "$@"' --`,
      // afterAll is a Vitest API; `fo` is a fixture splitting `foo` across markup;
      // `alle` is German for "all", used by the label-override tests
      '*': `codespell --ignore-words-list afterall,falsy,fo,alle --check-filenames`,
    },
  }),

  plugins: [sveltekit(svelte_config), ...live_examples(), source_links()],

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
