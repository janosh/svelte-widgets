import { create_highlighter } from '$lib/live-examples/create-highlighter'
import { default_highlighter } from '$lib/live-examples/default-highlighter'
import { starry_night, starry_night_highlighter } from '$lib/live-examples/highlighter'
import grammar_typst from '@wooorm/starry-night/source.typst'
import grammar_latex from '@wooorm/starry-night/text.tex.latex'
import { describe, expect, test, vi } from 'vitest'

describe(`starry_night_highlighter`, () => {
  test(`shares one default instance with lazy component consumers`, async () => {
    expect(await default_highlighter.ready()).toBe(starry_night)
  })

  test(`reports missing optional starry-night peer dependency`, async () => {
    vi.resetModules()
    vi.doMock(`@wooorm/starry-night`, () => {
      throw new Error(`Cannot find package '@wooorm/starry-night'`)
    })

    await expect(import(`$lib/live-examples/highlighter`)).rejects.toThrow(
      `svelte-widgets/live-examples requires optional peer dependency @wooorm/starry-night`,
    )

    vi.doUnmock(`@wooorm/starry-night`)
    vi.resetModules()
  })

  // Cover custom grammar, common grammar, and punctuation in language flags.
  test.each([
    [`svelte`, `<div>test</div>`],
    [`ts`, `const x: number = 1`],
    [`c++`, `int main() {}`],
  ])(`highlights %s code`, (lang, code) => {
    const result = starry_night_highlighter(code, lang)
    const escaped_lang = lang.replaceAll(/[+]/gu, `\\$&`)
    expect(result).toMatch(
      new RegExp(
        `^<pre class="highlight highlight-${escaped_lang}"><code>.*</code></pre>$`,
        `su`,
      ),
    )
    expect(result).toContain(`<span class="pl-`)
  })

  test.each([`TS`, `TypeScript`, `JAVASCRIPT`, `Svelte`])(
    `normalizes %s to lowercase`,
    (lang) => {
      const result = starry_night_highlighter(`const x = 1`, lang)
      expect(result).toContain(`<pre class="highlight highlight-${lang.toLowerCase()}">`)
      expect(result).toBe(starry_night_highlighter(`const x = 1`, lang.toLowerCase()))
    },
  )

  test.each([`unknown`, `cobol`, `fortran`, null, undefined])(
    `returns escaped code for lang=%s`,
    (lang) => {
      expect(starry_night_highlighter(`<a>{x}&</a>`, lang)).toBe(
        `<pre class="highlight"><code>&lt;a&gt;&#123;x&#125;&amp;&lt;/a&gt;</code></pre>`,
      )
    },
  )

  test.each([
    [`HTML special characters`, `<div>&</div>`, `&lt;div&gt;&amp;&lt;/div&gt;`],
    [`braces`, `{#if x}{/if}`, `&#123;#if x&#125;&#123;/if&#125;`],
  ])(`escapes %s in unhighlighted code`, (_desc, code, expected) => {
    expect(starry_night_highlighter(code)).toBe(
      `<pre class="highlight"><code>${expected}</code></pre>`,
    )
  })

  test(`escapes braces in highlighted code`, () => {
    const result = starry_night_highlighter(`{#if x}{/if}`, `svelte`)

    expect(result).toContain(`&#123;`)
    expect(result).toContain(`&#125;`)
    expect(result).not.toMatch(/[{}]/u)
  })
})

describe(`create_highlighter`, () => {
  // Typst and LaTeX are outside the common bundle, mirroring the diagrams docs site
  const custom = create_highlighter([grammar_latex, grammar_typst])
  const typst_html = `<span class="pl-k">#let</span> <span class="pl-smi">x</span> <span class="pl-k">= </span><span class="pl-c1">1</span>`

  test(`highlights a language outside the common bundle`, async () => {
    expect(starry_night.flagToScope(`typ`)).toBeUndefined()
    expect(await custom.highlight(`#let x = 1`, `typ`)).toBe(typst_html)
    expect(await custom.highlight(`#let x = 1`, `TYP`)).toBe(typst_html)
    expect(await custom.highlight(`\\emph{hi}`, `tex`)).toContain(`<span class="pl-`)
  })

  test(`registers only the grammars it was given and caches the instance`, async () => {
    const instance = await custom.ready()
    expect(await custom.ready()).toBe(instance)
    expect(await create_highlighter([grammar_typst]).ready()).not.toBe(instance)
    expect(instance.flagToScope(`typ`)).toBe(`source.typst`)
    for (const flag of [`py`, `ts`, `svelte`]) {
      expect(instance.flagToScope(flag)).toBeUndefined()
    }
  })

  test(`highlight_block wraps in the same markup as starry_night_highlighter`, async () => {
    expect(await custom.highlight_block(`#let x = 1`, `TYP`)).toBe(
      `<pre class="highlight highlight-typ"><code>${typst_html}</code></pre>`,
    )
    // Unknown-language output must still be safe to embed in Svelte markup.
    expect(await custom.highlight(`<a>{x}</a>`, `py`)).toBe(
      `&lt;a&gt;&#123;x&#125;&lt;/a&gt;`,
    )
    expect(await custom.highlight_block(`<a>{x}</a>`, `py`)).toBe(
      `<pre class="highlight"><code>&lt;a&gt;&#123;x&#125;&lt;/a&gt;</code></pre>`,
    )
  })

  // Importing `common` defeats the custom grammar factory's bundle savings.
  test(`never references starry-night's common bundle`, async () => {
    const source = (await import(`$lib/live-examples/create-highlighter.ts?raw`)).default
    // Ignore prose, but preserve code preceding trailing comments.
    const code = source.replaceAll(/\/\*[\s\S]*?\*\//gu, ``).replaceAll(/\/\/.*$/gmu, ``)
    expect(code).toContain(`createStarryNight`)
    expect(code).not.toContain(`common`)
  })

  test(`defers loading until first use, then reports missing peer dependency`, async () => {
    vi.resetModules()
    let load_count = 0
    vi.doMock(`@wooorm/starry-night`, () => {
      load_count += 1
      throw new Error(`Cannot find package '@wooorm/starry-night'`)
    })

    const { create_highlighter: create } = await import(
      `$lib/live-examples/create-highlighter`
    )
    const highlighter = create([grammar_typst])
    // Flush pending imports to detect eager peer loading.
    await new Promise((resolve) => void setTimeout(resolve, 0))
    expect(load_count).toBe(0)

    const peer_error = `svelte-widgets/live-examples requires optional peer dependency @wooorm/starry-night`
    await expect(highlighter.ready()).rejects.toThrow(peer_error)
    await expect(highlighter.highlight(`#let x = 1`, `typ`)).rejects.toThrow(peer_error)
    expect(load_count).toBe(1) // failed load is cached, not retried

    vi.doUnmock(`@wooorm/starry-night`)
    vi.resetModules()
  })
})
