import {
  create_highlighter,
  optional_peer_error,
  type Highlighter,
} from './create-highlighter.ts'

const load_highlighter = async (): Promise<Highlighter> => {
  const [{ common }, { default: svelte_grammar }] = await Promise.all([
    import(`@wooorm/starry-night`),
    import(`@wooorm/starry-night/source.svelte`),
  ]).catch((cause: unknown) => {
    throw new Error(optional_peer_error, { cause })
  })
  // Markdown's common grammar does not recognize Svelte fences, even when the
  // Svelte grammar is loaded. Add it ahead of the generic fenced-code rules.
  const grammars = common.map((grammar) => {
    if (grammar.scopeName !== `text.md`) return grammar
    const { repository } = grammar
    if (!repository?.[`commonmark-code-fenced`])
      throw new Error(`Markdown grammar is missing its fenced-code rules`)
    return {
      ...grammar,
      repository: {
        ...repository,
        'original-code-fenced': repository[`commonmark-code-fenced`],
        'commonmark-code-fenced': {
          patterns: [
            {
              begin: '(^|\\G)[ ]{0,3}(`{3,}|~{3,})(?i:svelte)(?=[\\t ]|$).*$',
              end: '(^|\\G)[ ]{0,3}\\2[\\t ]*$',
              name: `markup.code.svelte.md`,
              contentName: `meta.embedded.svelte`,
              patterns: [{ include: svelte_grammar.scopeName }],
            },
            { include: `#original-code-fenced` },
          ],
        },
      },
    }
  })
  return create_highlighter([...grammars, svelte_grammar])
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
