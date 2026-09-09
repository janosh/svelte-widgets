<script lang="ts">
  import { browser } from '$app/environment'
  import { afterNavigate, goto } from '$app/navigation'
  import { asset } from '$app/paths'
  import { page } from '$app/state'
  import { CopyButton, GitHubCorner, PageSearch, Toc } from '$lib'
  import { slug_to_title } from '$lib/utils'
  import { flash_toc_target } from '$lib/toc-utils'
  import { highlight_matches } from '$lib/attachments'
  import { apply_theme_mode, resolve_theme_mode } from '$lib/theme.svelte'
  import { repository } from '$root/package.json'
  import { DemoNav, Footer } from '$site'
  import { current_demo_route, resolve_demo_path as resolve_path } from '$site/paths'
  import { link_source_mentions } from '$site/source-links'
  import favicon from '$site/favicon.svg'
  import type { Snippet } from 'svelte'
  import { slide } from 'svelte/transition'
  // eslint-disable-next-line import/no-unassigned-import -- global route styles
  import '../app.css'
  import { demo_pages, demo_title } from './(demos)'

  let { children }: { children?: Snippet<[]> } = $props()
  let page_search_query = $state(``)
  let reference_links: { id: string; label: string; target: HTMLElement }[] = $state([])
  let toc_open = $state(false)
  let reference_open = $state<Record<string, boolean>>({ figure: true, equation: true })
  const reference_nav_id = $props.id()

  // The resolver emits these labels from the same definitions as the public manifest.
  // Observe only page content, so updating the sidebar cannot trigger another scan.
  const collect_references = (node: HTMLElement) => {
    const update = () => {
      reference_links = Array.from(
        node.querySelectorAll<HTMLElement>(`[id][data-reference-label]`),
        (target) => ({
          id: target.id,
          label: target.dataset.referenceLabel ?? ``,
          target,
        }),
      )
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [`id`, `data-reference-label`],
    })
    return () => observer.disconnect()
  }

  const actions = demo_pages.map((route) => ({
    id: route,
    label: demo_title(route),
    keywords: [route],
    action: () => goto(resolve_path(route)),
  }))
  const is_home = $derived(page.route.id === `/`)
  const page_title = $derived.by(() => {
    const route_slug = page.url.pathname
      .split(`/`)
      .findLast(Boolean)
      ?.replace(/\.html$/, ``)
    if (is_home || !route_slug) return `Svelte Widgets`
    const route = current_demo_route()
    return route ? demo_title(route) : slug_to_title(route_slug)
  })

  // source file behind each route, so the footer's edit link hits the page you're on
  const page_sources: Record<string, string> = {
    ...Object.fromEntries(
      Object.keys(import.meta.glob(`./**/+page.{svelte,md}`)).map((file) => [
        file.replace(/^\.\//u, `/`).replace(/\/?\+page\.(?:svelte|md)$/u, ``) || `/`,
        file.replace(/^\.\//u, `src/routes/`),
      ]),
    ),
    // these three render markdown from the repo root, so link the prose, not the wrapper
    '/': `readme.md`,
    '/changelog': `changelog.md`,
    '/contributing': `contributing.md`,
  }
  // a 404 has no route id, so don't look one up — `/` would send it to the readme
  const edit_href = $derived.by(() => {
    const source = page.route.id ? page_sources[page.route.id] : undefined
    return `${repository}/blob/-/${source ?? `src/routes`}`
  })

  afterNavigate(({ type }) => {
    page_search_query = ``
    // Hydration changes the sidebar layout. Align an initial scientific fragment once
    // after that layout settles; subsequent links and Back retain native scrolling.
    if (type === `enter`) {
      const reference = reference_links.find(({ id }) =>
        [`#${id}`, `#${encodeURIComponent(id)}`].includes(page.url.hash),
      )
      if (reference) requestAnimationFrame(() => reference.target.scrollIntoView())
    }
  })

  // FOUC script in app.html already painted; this syncs shared theme state for ThemeToggle.
  if (browser) apply_theme_mode(resolve_theme_mode())
</script>

<svelte:head>
  <title>{page_title}</title>
  <meta data-pagefind-default-meta="title[content]" content={page_title} />
  <link rel="icon" href={favicon} />
</svelte:head>

{#if !is_home}
  <header class="site-header">
    <a class="brand" href={resolve_path(`/`)}>
      <img src={favicon} alt="Logo" style="width: 1.2em; height: 1.2em;" />
      Svelte Widgets
    </a>
    <DemoNav />
  </header>
{/if}

<PageSearch
  fallback_actions={actions}
  navigate={async (url, { query }) => {
    await goto(url)
    page_search_query = ``
    queueMicrotask(() => (page_search_query = query))
  }}
  strip_html_suffix
  pagefind_path={asset(`/pagefind/pagefind.js`)}
/>

<GitHubCorner href={repository} />

<CopyButton global global_selector="pre:not(li > pre, .source-input pre) > code" />

<div class="docs-body">
  <div
    data-pagefind-body
    style="display: contents"
    {@attach highlight_matches({
      query: page_search_query,
      css_class: `page-search-match`,
      duration_ms: 8000,
    })}
    {@attach link_source_mentions}
    {@attach collect_references}
  >
    {@render children?.()}
  </div>

  {#snippet reference_navigation()}
    {#each [[`figure`, `Figures`], [`equation`, `Equations`]] as [kind, title] (kind)}
      {@const links = reference_links.filter(
        ({ target }) => target.matches(`figure`) === (kind === `figure`),
      )}
      {#if links.length}
        <div class="reference-navigation" role="group" aria-label={title}>
          <button
            type="button"
            aria-expanded={reference_open[kind]}
            aria-controls={`${reference_nav_id}-${kind}`}
            onclick={() => (reference_open[kind] = !reference_open[kind])}
            ><span aria-hidden="true">{reference_open[kind] ? `▾` : `▸`}</span>
            {title}</button
          >
          <div id={`${reference_nav_id}-${kind}`}>
            {#if reference_open[kind]}
              <ul transition:slide={{ duration: 180 }}>
                {#each links as { id, label, target } (id)}
                  <li>
                    <a
                      href={`#${encodeURIComponent(id)}`}
                      onclick={(event) => {
                        if (
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return
                        toc_open = false
                        flash_toc_target(target.querySelector(`figcaption`) ?? target)
                      }}>{label}</a
                    >
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  {/snippet}
  <Toc
    headingSelector="main > :where(h2, h3)"
    breakpoint={1100}
    minItems={5}
    bind:open={toc_open}
    footer={reference_links.length ? reference_navigation : undefined}
  />
</div>

<Footer {edit_href} />

<style>
  .reference-navigation {
    margin-block: 1.5em 1em;
    button {
      background: none;
      border: 0;
      padding: 0;
      color: inherit;
      font: inherit;
      cursor: pointer;
      font-weight: 600;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0.2em 0 0;
    }
    a {
      display: block;
      padding-block: 0.3em;
      overflow-wrap: anywhere;
      text-wrap: wrap;
      color: inherit;
    }
  }
  :global(::highlight(page-search-match)) {
    background: var(--page-search-highlight-bg, light-dark(#ffe07a, #806300));
    color: var(--page-search-highlight-color, light-dark(#513a00, #fff3ba));
  }
</style>
