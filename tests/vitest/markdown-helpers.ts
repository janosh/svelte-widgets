// Source-to-output helpers keep syntax fixtures focused; pipeline contracts are tested directly.
import {
  assert_ok,
  create_markdown,
  compile_markdown,
  markdown,
  type MarkdownOptions,
  type MarkdownFile,
} from '$lib/markdown'
import { markdown_vite, type MarkdownViteOptions } from '$lib/markdown/vite'
import type { Plugin } from 'vite'

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
) => assert_ok(await create_markdown(options).render(source, options))
export const markdown_preprocessor = (options: MarkdownOptions = {}) =>
  markdown(create_markdown(options))
export const markdown_integration = ({
  highlight_cache_size,
  on_manifest,
  ...options
}: MarkdownOptions & MarkdownViteOptions = {}) =>
  markdown_vite(create_markdown(options), { highlight_cache_size, on_manifest })
// Vite types each hook as a function or a { handler } object; tests call the function
export const hook = (plugin: Plugin, name: keyof Plugin) => {
  const value: unknown = plugin[name]
  if (typeof value !== `function`) throw new Error(`Expected ${name} hook`)
  return (context: object, ...args: unknown[]): unknown =>
    Reflect.apply(value, context, args)
}
