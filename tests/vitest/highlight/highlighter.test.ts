import { create_highlighter, default_highlighter } from '$lib/highlight'
import grammar_typst from '@wooorm/starry-night/source.typst'
import grammar_latex from '@wooorm/starry-night/text.tex.latex'
import { describe, expect, test, vi } from 'vitest'

describe(`default_highlighter.highlight_block`, () => {
  test(`shares one default instance with lazy component consumers`, async () => {
    expect(await default_highlighter.ready()).toBe(await default_highlighter.ready())
  })

  test(`reports missing optional starry-night peer dependency`, async () => {
    vi.resetModules()
    vi.doMock(`@wooorm/starry-night`, () => {
      throw new Error(`Cannot find package '@wooorm/starry-night'`)
    })

    const { default_highlighter: missing_peer } = await import(
      `$lib/highlight/default-highlighter`
    )
    await expect(missing_peer.ready()).rejects.toThrow(
      `svelte-widgets/highlight requires optional peer dependency @wooorm/starry-night`,
    )

    vi.doUnmock(`@wooorm/starry-night`)
    vi.resetModules()
  })

  // Cover custom grammar, common grammar, and punctuation in language flags.
  test.each([
    [`svelte`, `<div>test</div>`],
    [`ts`, `const x: number = 1`],
    [`c++`, `int main() {}`],
  ])(`highlights %s code`, async (lang, code) => {
    const result = await default_highlighter.highlight_block(code, lang)
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
    async (lang) => {
      const result = await default_highlighter.highlight_block(`const x = 1`, lang)
      expect(result).toContain(`<pre class="highlight highlight-${lang.toLowerCase()}">`)
      expect(result).toBe(
        await default_highlighter.highlight_block(`const x = 1`, lang.toLowerCase()),
      )
    },
  )

  test.each([`unknown`, `cobol`, `fortran`, null, undefined])(
    `returns escaped code for lang=%s`,
    async (lang) => {
      expect(await default_highlighter.highlight_block(`<a>{x}&</a>`, lang)).toBe(
        `<pre class="highlight"><code>&lt;a&gt;&#123;x&#125;&amp;&lt;/a&gt;</code></pre>`,
      )
    },
  )

  test.each([
    [`HTML special characters`, `<div>&</div>`, `&lt;div&gt;&amp;&lt;/div&gt;`],
    [`braces`, `{#if x}{/if}`, `&#123;#if x&#125;&#123;/if&#125;`],
  ])(`escapes %s in unhighlighted code`, async (_desc, code, expected) => {
    expect(await default_highlighter.highlight_block(code)).toBe(
      `<pre class="highlight"><code>${expected}</code></pre>`,
    )
  })

  test(`escapes braces in highlighted code`, async () => {
    const result = await default_highlighter.highlight_block(`{#if x}{/if}`, `svelte`)

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
    expect((await default_highlighter.ready()).flagToScope(`typ`)).toBeUndefined()
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

  test(`highlight_block wraps in the same markup as default_highlighter.highlight_block`, async () => {
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

  test(`public entry point defers loading until first use, then reports missing peer dependency`, async () => {
    vi.resetModules()
    let load_count = 0
    vi.doMock(`@wooorm/starry-night`, () => {
      load_count += 1
      throw new Error(`Cannot find package '@wooorm/starry-night'`)
    })

    const { create_highlighter: create } = await import(`$lib/highlight`)
    const highlighter = create([grammar_typst])
    // Flush pending imports to detect eager peer loading.
    await new Promise((resolve) => void setTimeout(resolve, 0))
    expect(load_count).toBe(0)

    const peer_error = `svelte-widgets/highlight requires optional peer dependency @wooorm/starry-night`
    await expect(highlighter.ready()).rejects.toThrow(peer_error)
    await expect(highlighter.highlight(`#let x = 1`, `typ`)).rejects.toThrow(peer_error)
    expect(load_count).toBe(1) // failed load is cached, not retried

    vi.doUnmock(`@wooorm/starry-night`)
    vi.resetModules()
  })
})
