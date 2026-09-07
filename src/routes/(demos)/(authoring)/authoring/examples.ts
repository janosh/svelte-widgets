// Shared authored inputs keep the prerendered examples and browser editors in sync.
export const manifest_source = `---
title: Field guide
---
# Getting started

Read [the next page](./next.md#details).

## Measurements

![Plot](./plot.svg)

\`\`\`ts check
const count: number = 1
\`\`\``

export const checked_examples = [
  {
    id: `valid`,
    title: `Valid TypeScript`,
    language: `ts`,
    code: `const count: number = 1`,
    info: `check`,
  },
  {
    id: `type-error`,
    title: `Type mismatch`,
    language: `ts`,
    code: `const count: number = "one"`,
    info: `check`,
  },
  {
    id: `component`,
    title: `Valid Svelte component`,
    language: `svelte`,
    code: `<script lang="ts">\n  let count = $state(0)\n</script>\n<button onclick={() => count++}>Count: {count}</button>`,
    info: `check`,
  },
  {
    id: `assertion`,
    title: `Passing assertion`,
    language: `js`,
    code: `let count = 0\nconst increment = () => count += 1\nincrement()`,
    info: `test="increment"`,
  },
  {
    id: `assertion-error`,
    title: `Failing assertion`,
    language: `js`,
    code: `let count = 0\nconst increment = () => count += 2\nincrement()`,
    info: `test="increment"`,
  },
]

export const as_fence = (language: string, code: string, info = `check`): string =>
  `\`\`\`${language} ${info}\n${code}\n\`\`\``

export const scientific_source = (image: string): string =>
  `A forward reference to [@eq:energy], an illustration in [@fig:widgets], and a citation to the authoring guide [@guide].

$$ {#eq:energy}
E = mc^2
$$

![Svelte Widgets](${image}){#fig:widgets}

::: bibliography`

export const bibliography = {
  guide: {
    title: `Svelte Widgets Markdown guide`,
    url: `https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/readme.md`,
  },
}
