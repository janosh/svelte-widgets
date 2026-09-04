export type CodeToken = { text: string; css?: string }
// HTML must come from a trusted highlighter; token text is escaped by Svelte.
export type CodeHighlight = string | readonly CodeToken[]
export type CodeHighlighter = (
  code: string,
  language: string,
  signal: AbortSignal,
) => CodeHighlight | Promise<CodeHighlight>
