import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import global_setup from '../playwright/global-setup'

test(`PLAYWRIGHT_PORT moves the e2e server off the default port`, async () => {
  vi.stubEnv(`PLAYWRIGHT_PORT`, `3123`)
  onTestFinished(() => void vi.unstubAllEnvs())
  vi.resetModules()
  const { default: config } = await import(`../../playwright.config`)
  expect(config.webServer.port).toBe(3123)
  expect(config.webServer.command).toMatch(/--port 3123$/)
})

// A reused server on the port may be another repo's dev server.
test.each([
  [`<script data-domain="svelte-widgets.janosh.dev">`, false],
  [`<script data-domain="matterviz.janosh.dev">`, true],
])(`e2e global setup rejects a server serving %s: %s`, async (html, rejects) => {
  vi.stubGlobal(`fetch`, async () => new Response(html))
  onTestFinished(() => void vi.unstubAllGlobals())
  const setup = global_setup({ webServer: { port: 3006 } })
  if (rejects)
    await expect(setup).rejects.toThrow(`serves another app, not svelte-widgets`)
  else await expect(setup).resolves.toBeUndefined()
})
