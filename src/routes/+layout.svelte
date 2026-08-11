<script lang="ts">
  import { browser } from '$app/environment'
  import { afterNavigate, goto } from '$app/navigation'
  import { asset, resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Pathname } from '$app/types'
  import { CopyButton, GitHubCorner, PageSearch, slug_to_title, Toc } from '$lib'
  import { highlight_matches } from '$lib/attachments'
  import { apply_theme_mode, resolve_theme_mode } from '$lib/theme.svelte'
  import { repository } from '$root/package.json'
  import { DemoNav, Footer } from '$site'
  import favicon from '$site/favicon.svg'
  import type { Snippet } from 'svelte'
  // eslint-disable-next-line import/no-unassigned-import -- global route styles
  import '../app.css'
  import { demo_labels, routes } from './(demos)'

  let { children }: { children?: Snippet<[]> } = $props()
  let page_search_query = $state(``)

  // resolve's arg type distributes over the Pathname union, so a dynamic route can't
  // match a single arm. Same widening as DemoNav; every demo route is param-free.
  const resolve_path = resolve as (path: Pathname) => string
  const actions = routes.map(({ route }) => ({
    label: demo_labels[route] ?? route,
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
    return demo_labels[`/${route_slug}`] ?? slug_to_title(route_slug)
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

  afterNavigate(() => (page_search_query = ``))

  // FOUC script in app.html already painted; this syncs shared theme state for ThemeToggle.
  if (browser) apply_theme_mode(resolve_theme_mode())
</script>

<svelte:head>
  <title>{page_title}</title>
  <meta data-pagefind-meta="title[content]" content={page_title} />
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

<CopyButton global global_selector="pre:not(li > pre) > code" />

<div class="docs-body">
  <div
    data-pagefind-body
    style="display: contents"
    {@attach highlight_matches({
      query: page_search_query,
      css_class: `page-search-match`,
      duration_ms: 8000,
    })}
  >
    {@render children?.()}
  </div>

  <Toc headingSelector="main > :where(h2, h3)" breakpoint={1100} minItems={5} />
</div>

<Footer {edit_href} />

<style>
  :global(::highlight(page-search-match)) {
    background: var(--page-search-highlight-bg, light-dark(#ffe07a, #806300));
    color: var(--page-search-highlight-color, light-dark(#513a00, #fff3ba));
  }
</style>
