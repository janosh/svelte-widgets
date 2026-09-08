import { assert_ok, create_markdown } from '$lib/markdown'
import { check_document } from '$lib/markdown/check'
import { default_highlighter } from '$lib/highlight'
import { runInNewContext } from 'node:vm'
import { as_fence, checked_examples } from './examples'

const engine = create_markdown()

export const load = async () => ({
  checks: await Promise.all(
    checked_examples.map(async (example) => {
      const source = as_fence(example.language, example.code, example.info)
      const document = assert_ok(
        await engine.parse(source, {
          filename: `${process.cwd()}/tests/authoring-example.md`,
        }),
      )
      return {
        ...example,
        source,
        highlighted_source: as_fence(
          example.language,
          await default_highlighter.highlight(example.code, example.language),
          example.info,
        ),
        result: await check_document(document, {
          assertions: {
            increment: ({ code }) => {
              // Only the fixed checked_examples inputs reach this build-time runner.
              const count: unknown = runInNewContext(
                `${code}\ncount`,
                {},
                { timeout: 1000 },
              )
              if (count !== 1)
                throw new Error(`Expected count 1 after increment(), got ${count}`)
            },
          },
        }),
      }
    }),
  ),
})
