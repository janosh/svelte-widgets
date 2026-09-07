import { assert_ok, create_markdown } from '$lib/markdown'
import { create_checker } from '$lib/markdown/check'
import { runInNewContext } from 'node:vm'
import { as_fence, checked_examples } from './examples'

const engine = create_markdown()

export const load = async () => {
  const checker = create_checker()
  try {
    return {
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
            result: await checker.check(document, {
              assertions: {
                increment: ({ code }) => {
                  // Only the fixed, authored samples above reach this build-time runner.
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
    }
  } finally {
    checker.dispose()
  }
}
