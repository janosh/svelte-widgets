## `CommandMenu`

[`<MultiSelect />`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/MultiSelect.svelte) powers a full navigation [`CommandMenu`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/CommandMenu.svelte).

```svelte example id="disabled-input-title"
<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import type { Pathname } from '$app/types'
  import { CommandMenu } from '$lib'
  import { routes } from '../../index'

  const resolve_path = resolve as (path: Pathname) => string
  const actions = routes.map(({ route }) => ({
    label: route,
    action: () => goto(resolve_path(route)),
  }))
</script>

<CommandMenu {actions} triggers={[`n`]} />
```

## `PageSearch`

[`PageSearch`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/PageSearch.svelte) wraps [`CommandMenu`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/CommandMenu.svelte) with full-text search over statically generated pages.
`fallback_actions` are matched locally on every keystroke, so known routes show up without
waiting on the index (and remain the only results when the index is absent). Install
`pagefind` as a development dependency, then index the rendered site after the application
build. Run this script before previewing or deploying:

```json
{
  "scripts": {
    "build:site": "vite build && pagefind --site build"
  }
}
```

```svelte example id="page-search"
<script lang="ts">
  import { goto } from '$app/navigation'
  import { asset, resolve } from '$app/paths'
  import type { Pathname } from '$app/types'
  import { PageSearch } from '$lib'
  import { routes } from '../../index'

  const resolve_path = resolve as (path: Pathname) => string
  const fallback_actions = routes.map(({ route }) => ({
    label: route,
    action: () => goto(resolve_path(route)),
  }))
</script>

<PageSearch
  {fallback_actions}
  navigate={goto}
  strip_html_suffix
  pagefind_path={asset(`/pagefind/pagefind.js`)}
  triggers={[`j`]}
  aria_label="Search documentation"
/>

<p>Open the documentation search with <kbd>cmd/ctrl+j</kbd>.</p>
```

The `navigate` callback receives the selected result's `query`, `label`, and `description`
as its second argument. A persistent layout can carry the query across client-side
navigation and apply [`highlight_matches`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/attachments/highlight-matches.ts) to the destination content:

```svelte
<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { highlight_matches } from 'svelte-widgets/attachments'
  import type { PageSearchNavigateDetails } from 'svelte-widgets/types'

  let highlight_query = $state(``)

  const navigate = async (url: string, { query }: PageSearchNavigateDetails) => {
    await goto(url)
    highlight_query = ``
    queueMicrotask(() => (highlight_query = query))
  }

  afterNavigate(() => (highlight_query = ``))
</script>

<main
  {@attach highlight_matches({
    query: highlight_query,
    css_class: `site-search-match`,
    duration_ms: 8000,
  })}
>
  ...
</main>

<style>
  :global(::highlight(site-search-match)) {
    background: gold;
    color: inherit;
  }
</style>
```

See the [`highlight_matches` attachments demo](attachments) for options and effects.
Stemmed Pagefind results may have no exact substring.

## Shortcuts, Descriptions & Recent Actions

Actions can carry a `description`, `metadata`, `badge`, `keywords`, `shortcut`, and
`disabled` state. The default filter searches all visible fields plus `keywords` and
supports multiple terms. Shortcuts render as <kbd>⌘</kbd>-style key hints and trigger
globally while the menu is closed unless `global_shortcuts={false}`. Pass
`recent_actions_key` to persist triggered actions to `localStorage` and rank them first
when the menu reopens.

```svelte example id="command-menu-shortcuts"
<script lang="ts">
  import { CommandMenu } from '$lib'
  import { apply_theme_mode, theme, THEME_MODE_CYCLE } from '$lib/theme.svelte'

  let last_triggered = $state(``)

  const actions = [
    {
      label: `Toggle theme`,
      description: `Cycle light, system and dark modes`,
      metadata: [`Appearance`],
      badge: `Setting`,
      keywords: [`color scheme`],
      shortcut: `ctrl+shift+l`,
      action: () => {
        const next_mode = THEME_MODE_CYCLE[theme.mode]
        apply_theme_mode(next_mode)
        last_triggered = `Theme: ${next_mode}`
      },
    },
    {
      label: `Copy page URL`,
      description: `Copy the current address to the clipboard`,
      shortcut: `ctrl+shift+u`,
      action: (label: string) => (last_triggered = label),
    },
    { label: `Open settings`, action: (label: string) => (last_triggered = label) },
  ]
</script>

<CommandMenu
  {actions}
  triggers={[`p`]}
  recent_actions_key="demo-recent-actions"
  placeholder="Recently used actions float to the top..."
/>
<p>
  Open with <kbd>cmd/ctrl+p</kbd> or press <kbd>ctrl+shift+l</kbd> /
  <kbd>ctrl+shift+u</kbd> anywhere on this page. Last triggered:
  <strong>{last_triggered || `none`}</strong>
</p>
```
