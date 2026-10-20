<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import type { CodeHighlight, CodeHighlighter } from './code-block'
  import CopyButton from './CopyButton.svelte'
  import Icon from './Icon.svelte'
  import type { IconData } from './icons'
  import { merge_defaults, CODE_BLOCK_LABELS, type CodeBlockLabels } from './labels'
  import { to_error } from './utils'

  let {
    code,
    language = ``,
    title,
    label,
    highlight,
    wrap = false,
    icon,
    line_count = false,
    copy = false,
    actions,
    labels,
    class: class_name,
    style,
    ...rest
  }: {
    code: string
    language?: string
    // file name or caption shown in a header above the code, e.g. `diagram.typ`
    title?: string
    label?: string
    highlight?: CodeHighlighter
    wrap?: boolean
    // header extras: an icon before and the line count after the title (both need a
    // title), a copy button, and other controls (e.g. source links) before the copy button.
    // `class` and `style` go to the outermost element, the header's figure when it shows.
    icon?: IconData
    line_count?: boolean
    copy?: boolean
    actions?: Snippet
    labels?: Partial<CodeBlockLabels>
  } & Omit<HTMLAttributes<HTMLPreElement>, `children` | `title`> = $props()

  const msg = $derived(merge_defaults(CODE_BLOCK_LABELS, labels))
  const title_id = $props.id()

  let result = $state<{ code: string; language: string; value: CodeHighlight }>()
  let error = $state(``)
  const output = $derived(
    result?.code === code && result.language === language ? result.value : undefined,
  )
  const pending = $derived(Boolean(highlight) && output === undefined && !error)
  // a trailing newline ends the last line rather than starting another
  const lines = $derived(code ? code.split(`\n`).length - Number(code.endsWith(`\n`)) : 0)
  $effect(() => {
    // Snapshot the inputs: a late result must be recorded against what it highlighted
    const [source, lang, highlighter] = [code, language, highlight]
    result = undefined
    error = ``
    if (!highlighter) return
    const request = new AbortController()
    const { signal } = request
    void Promise.resolve()
      .then(() => (signal.aborted ? undefined : highlighter(source, lang, signal)))
      .then(
        (value) => {
          if (!signal.aborted && value !== undefined)
            result = { code: source, language: lang, value }
        },
        (reason: unknown) => {
          if (!signal.aborted) error = to_error(reason).message
        },
      )
    return () => request.abort()
  })
</script>

{#snippet block(root: boolean)}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -- keyboard scrolling -->
  <pre
    aria-label={label ?? title ?? `Code`}
    role="region"
    tabindex="0"
    {...rest}
    aria-busy={pending}
    class={[`code-block`, { wrap }, root && class_name]}
    style={root ? style : undefined}><code
      >{#if typeof output === `string`}{@html output}{:else if output}{#each output as token}<span
            class={token.css}>{token.text}</span
          >{/each}{:else}{code}{/if}</code
    ></pre>
{/snippet}

{#if title || actions || copy}
  <figure
    class={[`code-block-file`, class_name]}
    {style}
    aria-labelledby={title ? title_id : undefined}
  >
    <figcaption>
      {#if title}
        <span class="title">
          {#if icon}<Icon {icon} />{/if}
          <span id={title_id}>{title}</span>
          {#if line_count}<small>{msg.line_count(lines)}</small>{/if}
        </span>
      {/if}
      <span class="actions">
        {@render actions?.()}
        {#if copy}<CopyButton content={code} aria-label={msg.copy} />{/if}
      </span>
    </figcaption>
    {@render block(false)}
  </figure>
{:else}
  {@render block(true)}
{/if}
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
  figure {
    margin: 0;
    min-inline-size: 0;
    border-radius: var(--code-block-radius, 6px);
    background: var(--code-block-bg, light-dark(#f6f8fa, #161b22));
    pre {
      background: none;
    }
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1ex;
    padding: var(--code-block-header-padding, 0.5rem 0.5rem 0);
    font-size: var(--code-block-font-size, 0.85rem);
    .title {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35em;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    small {
      font-weight: 300;
    }
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1ex;
    margin-inline-start: auto;
    > :global(a) {
      display: inline-flex;
      color: inherit;
    }
  }
</style>
