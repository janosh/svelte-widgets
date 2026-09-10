<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import CommandMenu from './CommandMenu.svelte'
  import {
    create_pagefind_loader,
    strip_html_extension,
    type PagefindLoaderOptions,
  } from './pagefind'
  import type { CmdAction } from './types'
  import { clamp_integer } from './utils'

  type Props = Omit<
    ComponentProps<typeof CommandMenu>,
    `actions` | `load_options` | `max_recent` | `recent_actions_key`
  > &
    PagefindLoaderOptions & {
      batch_size?: number
      debounce_ms?: number
      // matched locally, so these stay searchable while the Pagefind index loads
      fallback_actions?: CmdAction[]
      strip_html_suffix?: boolean
    }

  let {
    fallback_actions = [],
    load_pagefind,
    navigate,
    pagefind_key,
    pagefind_path = `/pagefind/pagefind.js`,
    transform_url,
    strip_html_suffix = false,
    batch_size = 12,
    debounce_ms = 120,
    fuzzy = false,
    open = $bindable(false),
    dialog = $bindable(null),
    input = $bindable(null),
    ...rest
  }: Props = $props()

  const pagefind_source = $derived(
    load_pagefind ? `custom-loader:${pagefind_key ?? ``}` : pagefind_path,
  )
  // The option loader reloads when fetch identity changes, so key it only to the index.
  const load_options = $derived(
    create_pagefind_loader(pagefind_source, () => ({
      load_pagefind,
      navigate,
      transform_url: (url) => {
        const normalized_url = strip_html_suffix ? strip_html_extension(url) : url
        return transform_url?.(normalized_url) ?? normalized_url
      },
    })),
  )
</script>

<CommandMenu
  actions={fallback_actions}
  bind:open
  bind:dialog
  bind:input
  {fuzzy}
  aria_label="Site search"
  load_options={{
    fetch: load_options,
    debounce_ms,
    batch_size: clamp_integer(batch_size, 1, Infinity, 12),
  }}
  placeholder="Search every page..."
  no_matching_options_msg="No matching pages"
  {...rest}
/>
