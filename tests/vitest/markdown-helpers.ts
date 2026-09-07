// Source-to-output helpers keep syntax fixtures focused; pipeline contracts are tested directly.
import {
  assert_ok,
  create_markdown,
  compile_markdown,
  render_markdown,
  markdown,
  type MarkdownOptions,
  type MarkdownFile,
} from '$lib/markdown'
import { markdown_vite, type MarkdownViteOptions } from '$lib/markdown/vite'

export const compile_source = async (
  source: string,
  options: MarkdownOptions & MarkdownFile = {},
) => {
  const engine = create_markdown(options)
  const document = assert_ok(await engine.parse(source, options))
  return assert_ok(await compile_markdown(document))
}
export const render_source = async (
  source: string,
  options: MarkdownOptions & MarkdownFile = {},
) => {
  const engine = create_markdown(options)
  const document = assert_ok(
    await engine.parse(source, { filename: options.filename, dialect: `markdown` }),
  )
  return assert_ok(await render_markdown(document))
}
export const markdown_preprocessor = (options: MarkdownOptions = {}) =>
  markdown(create_markdown(options))
export const markdown_integration = ({
  highlight_cache_size,
  on_manifest,
  ...options
}: MarkdownOptions & MarkdownViteOptions = {}) =>
  markdown_vite(create_markdown(options), { highlight_cache_size, on_manifest })
