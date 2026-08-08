<script lang="ts">
  import type { Snippet } from 'svelte'
  import type {
    HTMLAttributes,
    HTMLButtonAttributes,
    HTMLDetailsAttributes,
  } from 'svelte/elements'
  import type { HastNode } from './live-examples/hast'
  import { escape_html_text, hast_to_html } from './live-examples/hast'
  import { chain_handlers } from './utils'

  type File = {
    title: string
    content: string
    language?: string
    node?: HTMLDetailsElement | null
  }

  let {
    files = $bindable([]),
    toggle_all_btn_title = `Toggle all`,
    default_lang = `svelte`,
    as = `ol`,
    title_snippet,
    button_props,
    details_props,
    ...rest
  }: {
    files?: File[]
    toggle_all_btn_title?: string
    default_lang?: string
    as?: string
    title_snippet?: Snippet<[{ idx: number } & File]>
    button_props?: Omit<HTMLButtonAttributes, `type`>
    details_props?: HTMLDetailsAttributes
  } & HTMLAttributes<HTMLOListElement> = $props()

  // Use reactive state for node refs to avoid binding_property_non_reactive warning
  let detail_elements = $state<(HTMLDetailsElement | null)[]>([])

  // DOM `open` isn't reactive, so track it in $state synced from the toggle event
  // and toggle_all, plus the $effect below (toggle doesn't fire for pre-opened details)
  let has_open_details = $state(false)
  const sync_has_open_details = () => {
    has_open_details = detail_elements.some((node) => node?.open)
  }

  // Trim stale refs when files shrink and sync detail_elements back to files.node for external access
  $effect(() => {
    if (detail_elements.length > files.length) {
      detail_elements.splice(files.length)
    }
    for (const [idx, node] of detail_elements.entries()) {
      if (files[idx]) files[idx].node = node
    }
    // initialize label for pre-opened <details> (their toggle event doesn't fire on mount)
    sync_has_open_details()
  })

  function toggle_all() {
    const should_close = detail_elements.some((node) => node?.open)
    for (const node of detail_elements) {
      if (!node) continue
      node.open = !should_close
    }
    sync_has_open_details()
  }

  // Map file extensions that differ from their starry-night language flag
  const ext_to_lang: Record<string, string> = {
    ts: `typescript`,
    js: `javascript`,
    md: `markdown`,
    py: `python`,
    rs: `rust`,
    sh: `shell`,
    yml: `yaml`,
  }

  // Infer language from title (may contain HTML like <code>foo.ts</code>)
  function lang_from_title(title: string): string | undefined {
    const ext = title
      .replaceAll(/<[^>]*>/gu, ``)
      .match(/\.(?<ext>\w+)$/u)
      ?.groups?.ext?.toLowerCase()
    return ext ? (ext_to_lang[ext] ?? ext) : undefined
  }

  const resolve_lang = (file: File): string =>
    file.language ?? lang_from_title(file.title) ?? default_lang

  // Lazy-loaded starry-night (CSS already loaded in app.css). Deliberately not
  // imported from ./live-examples/highlighter.ts, whose top-level await initializes
  // starry-night at module load.
  let highlighter:
    | {
        highlight: (code: string, scope: string) => HastNode
        flagToScope: (flag: string) => string | undefined
      }
    | undefined
  async function highlight(code: string, lang: string): Promise<string> {
    if (!highlighter) {
      const { createStarryNight, common } = await import(`@wooorm/starry-night`)
      const source_svelte = (await import(`@wooorm/starry-night/source.svelte`)).default
      highlighter = await createStarryNight([...common, source_svelte])
    }
    const scope = highlighter.flagToScope(lang)
    if (!scope) return escape_html_text(code)
    return hast_to_html(highlighter.highlight(code, scope))
  }

  // Cache of highlighted HTML keyed by content+language
  let highlighted_cache = $state<Record<string, string>>({})
  $effect(() => {
    for (const file of files) {
      const lang = resolve_lang(file)
      const key = `${lang}:${file.content}`
      if (!(key in highlighted_cache)) {
        highlight(file.content, lang).then(
          (html) => {
            highlighted_cache[key] = html
          },
          () => {}, // silently skip unsupported languages
        )
      }
    }
  })
</script>

{#if files?.length > 1}
  <button
    title={toggle_all_btn_title}
    {...button_props}
    type="button"
    onclick={chain_handlers(toggle_all, button_props?.onclick)}
  >
    <span aria-hidden={has_open_details}>Open all</span>
    <span aria-hidden={!has_open_details}>Close all</span>
  </button>
{/if}

<svelte:element this={as} {...rest}>
  <!-- object identity supports duplicate titles and preserves open state across inserts -->
  {#each files as file, idx (file)}
    {@const { title, content } = file}
    {@const language = resolve_lang(file)}
    {@const cache_key = `${language}:${content}`}
    <li>
      <details
        bind:this={detail_elements[idx]}
        {...details_props}
        ontoggle={(event) => {
          sync_has_open_details()
          details_props?.ontoggle?.(event)
        }}
      >
        {#if title || title_snippet}
          <summary>
            {#if title_snippet}
              {@render title_snippet({ idx, ...file })}
            {:else}
              {@html title}
            {/if}
          </summary>
        {/if}

        <pre class="language-{language}"><span class="lang-label">{language}</span><code
            >{#if highlighted_cache[cache_key]}{@html highlighted_cache[
                cache_key
              ]}{:else}{content}{/if}</code
          ></pre>
      </details>
    </li>
  {/each}
</svelte:element>

<style>
  button {
    display: inline-grid;
    float: inline-end;
    width: fit-content;
    white-space: nowrap;
  }
  button > span {
    grid-area: 1 / 1;
    text-align: center;
  }
  button > [aria-hidden='true'] {
    visibility: hidden;
  }
  ol {
    padding: 0;
  }
  ol > li {
    margin: 1ex 0;
  }
  pre {
    position: relative;
    background: var(--pre-bg, light-dark(#f3f5f8, rgba(0, 0, 0, 0.3)));
  }
  /* the label is emitted inline before <code>; pre is white-space: pre, so it
  must be taken out of flow or it indents the first code line */
  .lang-label {
    position: absolute;
    bottom: 2px;
    inset-inline-end: 6px;
    font-size: 0.65rem;
    opacity: 0.35;
    text-transform: uppercase;
    pointer-events: none;
    user-select: none;
    line-height: 1;
  }
</style>
