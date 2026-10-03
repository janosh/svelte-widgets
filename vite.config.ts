import { sveltekit } from '@sveltejs/kit/vite'
import { resolve } from 'node:path'
import { generate_icons } from './scripts/generate-icons.ts'
import { site_adapter } from './scripts/site-content.ts'
import type { ContentManifest } from './src/lib/markdown/content.ts'
import { default_highlighter } from './src/lib/highlight/default-highlighter.ts'
import { create_markdown } from './src/lib/markdown/index.ts'
import { markdown_vite } from './src/lib/markdown/vite.ts'
import source_links from './src/lib/source-links/vite-plugin.ts'
import { make_config } from './src/lib/vite-config.ts'
import { asset_imports } from './src/lib/assets.ts'
import package_json from './package.json' with { type: 'json' }

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

// Demos, tests and docs import the package by name so examples stay copy-pasteable, which
// subpath imports can't express. Stateful exports point at `.svelte.ts` modules, so their
// aliases precede the prefix rule. tsconfig.json `paths` mirrors these for TS.
const self_aliases: { find: string | RegExp; replacement: string }[] = []
for (const [path, target] of Object.entries(package_json.exports)) {
  if (`default` in target && target.default.endsWith(`.svelte.js`))
    self_aliases.push({
      find: path.replace(`.`, `svelte-widgets`),
      replacement: resolve(
        import.meta.dirname,
        target.default.replace(`./dist/`, `src/lib/`).replace(/\.js$/u, `.ts`),
      ),
    })
}
self_aliases.push({
  find: /^svelte-widgets(?=\/|$)/u,
  replacement: resolve(import.meta.dirname, `src/lib`),
})

// svelte-package loads this config too (as `serve`, so only an env var tells them apart).
// Keep it to plain `.svelte` without site preprocessors so it neither compiles src/lib
// Markdown guides into dist nor runs docs transforms over library components.
const packaging = Boolean(process.env.SVELTE_PACKAGE)

// Inline Kit options configure the docs site
const svelte_config = {
  extensions: packaging ? [`.svelte`] : [`.svelte`, `.md`],

  preprocess: packaging ? [] : [docs.preprocess, asset_imports()],

  adapter: site_adapter(manifests),
  paths: { base: base_path },

  prerender: {
    handleHttpError: ({ status, referrer, message }) => {
      // Ignore 404s from the /nav demo page which contains links to non-existent routes
      if (status === 404 && referrer === `${base_path}/nav`) return
      throw new Error(message)
    },
  },

  inspector: true,
} satisfies Parameters<typeof sveltekit>[0]

// vite-plugin-svelte inlines all of node_modules/svelte so tests get its browser runtime.
// The compiler is ~230 stateless ES modules without browser-specific imports, so loading
// it natively gives identical output while sparing every test file that compiles Markdown
// or Svelte a module-runner transform and evaluation of the whole compiler.
const native_svelte_compiler = {
  name: `test:native-svelte-compiler`,
  configResolved: {
    order: `post`,
    handler({ test }: { test?: { server?: { deps?: { inline?: unknown } } } }) {
      const inline = test?.server?.deps?.inline
      if (!Array.isArray(inline) || !inline.includes(`svelte`))
        throw new Error(`Expected Vitest to inline svelte, got ${String(inline)}`)
      inline[inline.indexOf(`svelte`)] = /\/node_modules\/svelte(?!\/src\/compiler\/)/u
    },
  },
} as const

export default {
  // shared lint/fmt/build/staged, published as svelte-widgets/vite-config
  ...make_config({
    staged: {
      // afterAll is a Vitest API; `fo` is a fixture splitting `foo` across markup;
      // `alle` is German for "all", used by the label-override tests
      '*': `codespell --ignore-words-list afterall,falsy,fo,alle --check-filenames`,
    },
  }),

  plugins: [
    sveltekit(svelte_config),
    docs.plugin,
    source_links(),
    ...(process.env.VITEST ? [native_svelte_compiler] : []),
  ],

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
    alias: self_aliases,
    conditions: process.env.TEST ? [`browser`] : undefined,
  },

  server: {
    port: 3000,
  },

  preview: {
    port: 3000,
  },
}
