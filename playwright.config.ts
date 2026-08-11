import type { PlaywrightTestConfig } from '@playwright/test'

// CI previews a production build to avoid cold dev-server hydration flakes. Pagefind
// writes after the build, so copy it into preview's client root. Local dev retains HMR.
// Reflect avoids requiring Node globals in this config's type scope.
const on_ci = Boolean(Reflect.get(globalThis, `process`)?.env?.CI)

export default {
  webServer: {
    command: on_ci
      ? `npm run build:site && cp -R build/pagefind .svelte-kit/output/client/ && vp preview --port 3005`
      : `vp dev --port 3005`,
    port: 3005,
    reuseExistingServer: true,
    timeout: on_ci ? 180_000 : 15_000,
  },
  workers: 16,
  testDir: `tests/playwright`,
} satisfies PlaywrightTestConfig
