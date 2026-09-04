<script lang="ts">
  import type { Snippet } from 'svelte'
  import CodeBlock from './CodeBlock.svelte'
  import type {
    HTMLAttributes,
    HTMLButtonAttributes,
    HTMLDetailsAttributes,
  } from 'svelte/elements'
  import { language_label_html } from './internal/language-label'
  import { merge_defaults, FILE_DETAILS_LABELS, type FileDetailsLabels } from './labels'
  import { default_highlighter } from './live-examples/default-highlighter'
  import { chain_handlers } from './utils'

  type File = {
    title: string
    content: string
    language?: string
  }

  let {
    files = [],
    toggle_all_btn_title = `Toggle all`,
    default_lang = `svelte`,
    as = `ol`,
    title_snippet,
    button_props,
    details_props,
    labels,
    ...rest
  }: {
    files?: readonly File[]
    toggle_all_btn_title?: string
    default_lang?: string
    as?: string
    title_snippet?: Snippet<[{ idx: number } & File]>
    button_props?: Omit<HTMLButtonAttributes, `type`>
    details_props?: HTMLDetailsAttributes
    labels?: Partial<FileDetailsLabels>
  } & HTMLAttributes<HTMLOListElement> = $props()

  const msg = $derived(merge_defaults(FILE_DETAILS_LABELS, labels))

  let detail_elements = $state<(HTMLDetailsElement | null)[]>([])

  // Mirror native open state for the toggle-all label.
  let has_open_details = $state(false)
  const sync_has_open_details = () => {
    has_open_details = detail_elements.some((node) => node?.open)
  }

  $effect(() => {
    if (detail_elements.length > files.length) {
      detail_elements.splice(files.length)
    }
    // Include pre-opened details, which emit no initial toggle event.
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
    {@const language = file.language ?? lang_from_title(title) ?? default_lang}
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

        <div style="position: relative">
          <CodeBlock
            code={content}
            {language}
            label={`Source (${language})`}
            highlight={default_highlighter.highlight}
            class="language-{language}"
            --code-block-bg="var(--pre-bg, light-dark(#f3f5f8, rgba(0, 0, 0, 0.3)))"
          />
          {@html language_label_html(language)}
        </div>
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
</style>
