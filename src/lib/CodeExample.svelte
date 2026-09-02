<script lang="ts">
  // see vite.config.ts where this component is set as the live-examples Wrapper
  import type { Snippet } from 'svelte'
  import type {
    HTMLAnchorAttributes,
    HTMLAttributes,
    HTMLButtonAttributes,
  } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { ChevronCollapse, ChevronExpand, GitHub, Svelte } from './icons'
  import { language_label_html } from './internal/language-label'
  import { merge_labels, CODE_EXAMPLE_LABELS, type CodeExampleLabels } from './labels'
  import { chain_handlers } from './utils'

  let {
    src = ``,
    meta = {},
    open = $bindable(!meta.collapsible),
    title,
    example,
    code,
    // applied after the computed `title` and `target`/`rel`, so those stay overridable
    link_props,
    button_props,
    labels,
    ...rest
  }: {
    // src+meta are passed in by live-examples remark plugin
    src?: string // code fence content, dedented by the remark plugin
    meta?: {
      // code fence metadata
      collapsible?: boolean // whether to show a button to expand/collapse the code
      code_above?: boolean // whether to show the code above the example (default: true when collapsible, false otherwise)
      id?: string // id of the <div> wrapping the code and example (e.g. to write very specific testing selectors)
      repl?: string // Svelte REPL URL
      github?: string | boolean // GitHub URL or true to link to the file serving the current page
      repo?: string // GitHub repo URL
      Wrapper?: string // Svelte component to wrap the example
      example?: boolean
      file?: string
      filename?: string // path of the file serving the current page (set by mdsvex transform)
      lang?: string
    }
    open?: boolean
    title?: Snippet<[]>
    example?: Snippet<[]>
    code?: Snippet<[]>
    // one bag is shared by every external link, so an `href` on it could only ever
    // point the repl, github and repo icons at the same URL
    link_props?: Omit<HTMLAnchorAttributes, `href`>
    button_props?: Omit<HTMLButtonAttributes, `type`>
    labels?: Partial<CodeExampleLabels>
  } & Omit<HTMLAttributes<HTMLDivElement>, `title`> = $props()

  const msg = $derived(merge_labels(CODE_EXAMPLE_LABELS, labels))

  let {
    id: meta_id,
    collapsible,
    repl,
    github,
    repo,
    file,
    filename,
    lang,
  } = $derived(meta)
  let code_above = $derived(meta.code_above ?? collapsible) // if code is collapsed, render code above example by default
  // mdsvex transform emits the current page's path as meta.filename, so fall back
  // to it when meta.file is unset (github: true is documented to link there)
  let github_file = $derived(file ?? filename)
  let external_links = $derived([
    { cond: repl, href: repl, icon: Svelte, title: `Svelte` },
    {
      cond: github && repo,
      // string github is an explicit path and needs no file/filename fallback
      href:
        github && (github !== true || github_file)
          ? `${repo}/blob/-/${github === true ? github_file : github}`
          : repo,
      icon: GitHub,
      title: `GitHub`,
    },
  ])
  const links = { target: `_blank`, rel: `noreferrer` }
</script>

<nav>
  {#each external_links as { cond, href, icon, title } (title)}
    <a
      {...links}
      {title}
      {...link_props}
      {href}
      style:display={cond ? `inline-block` : `none`}
    >
      <Icon {icon} />
    </a>
  {/each}
  {#if collapsible}
    {@render title?.()}
    <button
      {...button_props}
      type="button"
      onclick={chain_handlers(() => (open = !open), button_props?.onclick)}
    >
      <Icon icon={open ? ChevronCollapse : ChevronExpand} />
      {open ? msg.hide_code : msg.show_code}
    </button>
  {/if}
</nav>
<!-- wrap in div with id for precise CSS selectors in playwright E2E tests -->
<div
  {...rest}
  id={meta_id ?? rest.id}
  class={[`code-example`, rest.class, { 'code-above': code_above }]}
>
  {@render example?.()}
  <pre class:open>{#if lang}{@html language_label_html(lang)}{/if}<code
      >{#if code}{@render code()}{:else}{src}{/if}</code
    ></pre>
</div>

<style>
  div.code-example {
    display: flex;
    flex-direction: column;
    margin: var(--code-example-margin, 1em auto);
    position: relative;
    /* a wide example scrolls inside its own pre/preview instead of widening the page */
    min-width: 0;
  }
  div.code-example.code-above > pre {
    order: -1;
  }
  nav {
    display: flex;
    justify-content: end;
    align-items: center;
    margin: var(--code-example-nav-margin, initial);
    gap: var(--code-example-nav-gap, 1ex);
  }
  nav > button {
    white-space: nowrap;
  }
  pre code {
    background-color: transparent;
    display: inline-block;
  }
  pre {
    position: relative;
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    padding: 0 1em;
    margin: 0;
    transition-property: max-height, opacity, padding, margin;
    transition-duration: var(--code-example-pre-transition-duration, 0.3s);
    transition-timing-function: ease;
    border-radius: var(--code-example-pre-border-radius, 4pt);
    background-color: var(--code-example-pre-bg, var(--pre-bg));
  }
  pre.open {
    opacity: 1;
    max-height: var(--code-example-pre-max-height, 80vh);
    overflow-x: auto;
    overflow-y: auto;
    padding: var(--code-example-pre-padding, 1ex 1em);
    margin: var(--code-example-pre-margin, 1em 0 0 0);
  }
  .code-above > pre.open {
    margin: var(--code-example-pre-margin, 0 0 1em 0);
  }
</style>
