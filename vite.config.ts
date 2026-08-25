import { sveltekit } from '@sveltejs/kit/vite'
import { generate_icons } from './scripts/generate-icons.ts'
import live_examples from './src/lib/live-examples/vite-plugin.ts'
import source_links from './src/lib/source-links/vite-plugin.ts'
import { make_config } from './src/lib/vite-config.ts'

await generate_icons()

export default {
  // shared lint/fmt/build/staged, published as svelte-widgets/vite-config
  ...make_config({
    staged: {
      // shared hook runs the JS svelte-check; CI here uses the Rust port
      '*.{ts,svelte}': `sh -c 'npx svelte-kit sync && npx svelte-check-rs --threshold error'`,
      '*.test.ts': `sh -c '! grep -E "(test|describe)\\.only\\(" "$@"' --`,
      // afterAll is a Vitest API; `fo` is a fixture splitting `foo` across markup
      '*': `codespell --ignore-words-list afterall,falsy,fo --check-filenames`,
    },
  }),

  plugins: [sveltekit(), ...live_examples(), source_links()],

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
