import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer, type InlineConfig } from 'vite'

// Each fixture owns its files, server, and optimizer cache; only dependencies are shared.
export async function browser_fixture(
  component: string,
  files: Record<string, string>,
  config: Pick<InlineConfig, 'plugins' | 'resolve' | 'optimizeDeps'>,
) {
  const directory = await realpath(await mkdtemp(`${tmpdir()}/widgets-browser-`))
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  const close = async () => {
    await server?.close()
    await rm(directory, { recursive: true, force: true })
  }
  try {
    await symlink(`${process.cwd()}/node_modules`, `${directory}/node_modules`)
    for (const [filename, source] of Object.entries({
      'index.html': `<html><head></head><body><script type="module" src="/main.js"></script></body></html>`,
      'main.js': `import { mount } from 'svelte'; import Page from './${component}'; mount(Page, { target: document.body })`,
      ...files,
    }))
      await writeFile(`${directory}/${filename}`, source)
    server = await createServer({
      ...config,
      configFile: false,
      root: directory,
      cacheDir: `${directory}/.vite`,
      resolve: { dedupe: [`svelte`], ...config.resolve },
      server: {
        port: 0,
        host: `127.0.0.1`,
        fs: { allow: [directory, process.cwd()] },
        // Queue complete writes instead of dropping rapid saves in the watcher's 50ms throttle.
        watch: { awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 } },
      },
    })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === `string`) throw new Error(`Expected HTTP address`)
    return { server, directory, url: `http://127.0.0.1:${address.port}`, close }
  } catch (error) {
    await close()
    throw error
  }
}
