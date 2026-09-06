import {
  create_highlighter,
  optional_peer_error,
  type Highlighter,
} from './create-highlighter.ts'

const load_highlighter = async (): Promise<Highlighter> => {
  try {
    const [{ common }, { default: svelte_grammar }] = await Promise.all([
      import(`@wooorm/starry-night`),
      import(`@wooorm/starry-night/source.svelte`),
    ])
    return create_highlighter([...common, svelte_grammar])
  } catch (cause) {
    throw new Error(optional_peer_error, { cause })
  }
}

// One lazy default bundle for build-time highlighting and every FileDetails instance.
// The promise also caches failures and prevents concurrent files compiling the grammar
// bundle independently.
let highlighter_promise: Promise<Highlighter> | undefined
const get_highlighter = (): Promise<Highlighter> =>
  (highlighter_promise ??= load_highlighter())

export const default_highlighter: Highlighter = {
  ready: async () => (await get_highlighter()).ready(),
  highlight: async (code, lang) => (await get_highlighter()).highlight(code, lang),
  highlight_block: async (code, lang) =>
    (await get_highlighter()).highlight_block(code, lang),
}
