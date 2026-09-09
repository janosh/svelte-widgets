import { sveltekit } from '@sveltejs/kit/vite'
import { generate_icons } from './scripts/generate-icons.ts'
import { site_adapter } from './scripts/site-content.ts'
import type { ContentManifest } from './src/lib/markdown/content.ts'
import { heading_ids } from './src/lib/heading-anchors.ts'
import { default_highlighter } from './src/lib/highlight/default-highlighter.ts'
import { create_markdown } from './src/lib/markdown/index.ts'
import { markdown_vite } from './src/lib/markdown/vite.ts'
import source_links from './src/lib/source-links/vite-plugin.ts'
import { make_config } from './src/lib/vite-config.ts'
import { asset_imports } from './src/lib/assets.ts'

await generate_icons()

const base_segment = (process.env.BASE_PATH ?? ``).replaceAll(/^\/+|\/+$/gu, ``)
const base_path: `` | `/${string}` = base_segment ? `/${base_segment}` : ``
const manifests = new Map<string, ContentManifest>()
const docs = markdown_vite(
  create_markdown({
    math: true,
    references: true,
    typography: true,
    highlight: default_highlighter.highlight,
    examples: {
      wrapper: '/src/lib/CodeExample.svelte',
      collapsible: true,
    },
  }),
  { on_manifest: (manifest) => manifests.set(manifest.filename, manifest) },
)

// Inline Kit options configure the docs site. svelte-package uses its defaults;
// src/lib needs no preprocessing, and the package script removes Markdown guides.
const svelte_config = {
  extensions: [`.svelte`, `.md`],

  preprocess: [docs.preprocess, asset_imports(), heading_ids()],

  adapter: site_adapter(manifests),
  paths: { base: base_path },

  alias: {
    $root: `.`,
    $site: `./src/site`,
    'svelte-widgets/clipboard': `./src/lib/clipboard.svelte.ts`,
    'svelte-widgets/dialogs': `./src/lib/dialogs.svelte.ts`,
    'svelte-widgets/theme': `./src/lib/theme.svelte.ts`,
    'svelte-widgets/toast-queue': `./src/lib/toast-queue.svelte.ts`,
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
    fs: { allow: [`.`] }, // $root imports include the repository's Markdown guides
    port: 3000,
  },

  preview: {
    port: 3000,
  },
}
