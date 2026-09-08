import type { PlaywrightTestConfig } from '@playwright/test'
import process from 'node:process'

// CI previews a production build to avoid cold dev-server hydration flakes. Pagefind
// writes after the build, so copy it into preview's client root. Local dev retains HMR.
const on_ci = Boolean(process.env.CI)

export default {
  webServer: {
    command: on_ci
      ? `npm run build:site && cp -R build/pagefind .svelte-kit/output/client/ && vp preview --port 3005`
      : `vp dev --port 3005`,
    port: 3005,
    reuseExistingServer: true,
    timeout: on_ci ? 180_000 : 15_000,
  },
  // CI runners share a small CPU budget across test workers and Vite fixture servers.
  workers: on_ci ? 2 : 16,
  testDir: `tests/playwright`,
} satisfies PlaywrightTestConfig
