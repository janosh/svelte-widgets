<script lang="ts">
  import type { CodeHighlight, CodeHighlighter } from './code-block'
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    code,
    language = ``,
    label = `Code`,
    highlight,
    wrap = false,
    ...rest
  }: {
    code: string
    language?: string
    label?: string
    highlight?: CodeHighlighter
    wrap?: boolean
  } & Omit<HTMLAttributes<HTMLPreElement>, `children`> = $props()

  let result = $state<{ code: string; language: string; value: CodeHighlight }>()
  let error = $state(``)
  let pending = $state(false)
  const output = $derived(
    result?.code === code && result.language === language ? result.value : undefined,
  )
  $effect(() => {
    const source = code
    const lang = language
    const highlighter = highlight
    const request = new AbortController()
    result = undefined
    error = ``
    pending = Boolean(highlighter)
    if (highlighter) {
      void Promise.resolve()
        .then(() =>
          request.signal.aborted ? undefined : highlighter(source, lang, request.signal),
        )
        .then(
          (value) => {
            if (!request.signal.aborted && value !== undefined) {
              result = { code: source, language: lang, value }
              pending = false
            }
          },
          (reason: unknown) => {
            if (!request.signal.aborted) {
              error = reason instanceof Error ? reason.message : String(reason)
              pending = false
            }
          },
        )
    }
    return () => request.abort()
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- keyboard scrolling -->
<pre
  aria-label={label}
  role="region"
  tabindex="0"
  {...rest}
  aria-busy={pending}
  class={[`code-block`, { wrap }, rest.class]}><code
    >{#if typeof output === `string`}{@html output}{:else if output}{#each output as token}<span
          class={token.css}>{token.text}</span
        >{/each}{:else}{code}{/if}</code
  ></pre>
{#if error}<p role="alert">{error}</p>{/if}

<style>
  pre {
    margin: 0;
    min-inline-size: 0;
    max-block-size: var(--code-block-max-block-size, none);
    overflow: auto;
    padding: var(--code-block-padding, 0.5rem);
    border-radius: var(--code-block-radius, 6px);
    background: var(--code-block-bg, light-dark(#f6f8fa, #161b22));
    font: var(--code-block-font-size, 0.85rem) / 1.5
      var(--code-font, ui-monospace, monospace);
    tab-size: 2;
    &.wrap {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }
  code {
    font: inherit;
  }
</style>
