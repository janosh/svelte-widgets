<script lang="ts">
  import { type Snippet, untrack } from 'svelte'
  import type {
    HTMLAttributes,
    HTMLButtonAttributes,
    HTMLDetailsAttributes,
  } from 'svelte/elements'
  import { language_label_html } from './internal/language-label'
  import { merge_labels, FILE_DETAILS_LABELS, type FileDetailsLabels } from './labels'
  import { default_highlighter } from './live-examples/default-highlighter'
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
    labels,
    ...rest
  }: {
    files?: File[]
    toggle_all_btn_title?: string
    default_lang?: string
    as?: string
    title_snippet?: Snippet<[{ idx: number } & File]>
    button_props?: Omit<HTMLButtonAttributes, `type`>
    details_props?: HTMLDetailsAttributes
    labels?: Partial<FileDetailsLabels>
  } & HTMLAttributes<HTMLOListElement> = $props()

  const msg = $derived(merge_labels(FILE_DETAILS_LABELS, labels))

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
  const highlight_key = (language: string, content: string): string =>
    JSON.stringify([language, content])

  // Keyed by language+content, so a result can never go stale and in-flight requests need
  // no cancellation. The empty marker keeps a cache write from re-requesting every sibling.
  let highlighted_cache = $state<Record<string, string>>({})
  $effect(() => {
    const live_keys = new Set<string>()
    for (const file of files) {
      const language = resolve_lang(file)
      const key = highlight_key(language, file.content)
      live_keys.add(key)
      if (untrack(() => key in highlighted_cache)) continue
      highlighted_cache[key] = ``
      default_highlighter.highlight(file.content, language).then(
        (html) => (highlighted_cache[key] = html),
        () => {}, // silently skip unsupported languages
      )
    }
    // Every key holds a full copy of the content it was built from, so a caller streaming
    // edits through the bindable `files` would grow this without bound.
    untrack(() => {
      const live_entries = Object.entries(highlighted_cache).filter(([cached_key]) =>
        live_keys.has(cached_key),
      )
      if (live_entries.length !== Object.keys(highlighted_cache).length) {
        highlighted_cache = Object.fromEntries(live_entries)
      }
    })
  })
</script>

{#if files?.length > 1}
  <button
    title={toggle_all_btn_title}
    {...button_props}
    type="button"
    onclick={chain_handlers(toggle_all, button_props?.onclick)}
  >
    <span aria-hidden={has_open_details}>{msg.open_all}</span>
    <span aria-hidden={!has_open_details}>{msg.close_all}</span>
  </button>
{/if}

<svelte:element this={as} {...rest}>
  <!-- object identity supports duplicate titles and preserves open state across inserts -->
  {#each files as file, idx (file)}
    {@const { title, content } = file}
    {@const language = resolve_lang(file)}
    {@const cache_key = highlight_key(language, content)}
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

        <pre class="language-{language}">{@html language_label_html(language)}<code
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
</style>
