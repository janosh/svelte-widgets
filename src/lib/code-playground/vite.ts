import { build, type Plugin } from 'vite'
import { runtime_modules } from './index.ts'

const public_id = `virtual:svelte-widgets/playground`
const resolved_id = `\0${public_id}`

// Bundle the installed Svelte runtime once, as source for the sandbox's local modules.
// No CDN, runtime server, or additional bundler dependency is needed.
export const playground_vite = (): Plugin => {
  let runtime_source: Promise<string> | undefined
  return {
    name: `svelte-widgets-playground`,
    resolveId: (id) => (id === public_id ? resolved_id : undefined),
    async load(id) {
      if (id !== resolved_id) return undefined
      runtime_source ??= (async () => {
        const entry = `\0widgets-playground-runtime`
        const result = await build({
          configFile: false,
          logLevel: `silent`,
          resolve: { conditions: [`browser`], dedupe: [`svelte`] },
          plugins: [
            {
              name: `widgets-playground-runtime`,
              resolveId: (source) => (source === entry ? entry : undefined),
              load: (source) =>
                source === entry
                  ? `import 'svelte/internal/disclose-version'; import 'svelte/internal/flags/legacy'; ${Object.entries(
                      runtime_modules,
                    )
                      .map(
                        ([name, specifier]) =>
                          `export * as ${name} from ${JSON.stringify(specifier)};`,
                      )
                      .join('')}`
                  : undefined,
            },
          ],
          build: {
            write: false,
            minify: true,
            rolldownOptions: {
              input: entry,
              preserveEntrySignatures: `strict`,
              output: { format: `es`, codeSplitting: false },
            },
          },
        })
        const outputs = Array.isArray(result) ? result : [result]
        const chunks = outputs
          .flatMap((output) => (`output` in output ? output.output : []))
          .filter((output) => output.type === `chunk`)
        if (chunks.length !== 1)
          throw new Error(`Expected one playground runtime chunk, got ${chunks.length}`)
        return chunks[0].code
      })()
      return `export default ${JSON.stringify(await runtime_source)}`
    },
  }
}
