<script lang="ts">
  import { onMount } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { tooltip, type TooltipOptions } from './attachments/index'
  import Icon from './Icon.svelte'
  import { Monitor, Moon, Sun } from './icons'
  import {
    apply_theme_mode,
    listen_theme_storage,
    resolve_theme_mode,
    theme,
    THEME_MODE_CYCLE,
  } from './theme.svelte'
  import { chain_handlers } from './utils'

  let {
    tooltip: tooltip_opts = {},
    icon_props = {},
    ...rest
  }: HTMLAttributes<HTMLButtonElement> & {
    tooltip?: TooltipOptions | false
    icon_props?: HTMLAttributes<SVGSVGElement>
  } = $props()

  const mode_icons = { light: Sun, dark: Moon, system: Monitor } as const
  const mode_labels = { light: `light`, dark: `dark`, system: `system (auto)` } as const
  let is_hydrated = $state(false)
  let next_mode = $derived(THEME_MODE_CYCLE[theme.mode])
  let title = $derived(`Switch to ${mode_labels[next_mode]} theme`)

  onMount(() => {
    // Only hydrate from storage when still at the default. An externally applied mode
    // (e.g. CommandMenu before this mounts) wins when storage is empty or unavailable.
    if (theme.mode === `system`) apply_theme_mode(resolve_theme_mode())
    is_hydrated = true

    const color_scheme_query = matchMedia(`(prefers-color-scheme: dark)`)
    const on_change = () => {
      if (theme.mode === `system`) apply_theme_mode(`system`)
    }
    color_scheme_query.addEventListener(`change`, on_change)
    const stop_storage_listener = listen_theme_storage()
    return () => {
      color_scheme_query.removeEventListener(`change`, on_change)
      stop_storage_listener()
    }
  })
</script>

<button
  type="button"
  {title}
  aria-label={title}
  style:visibility={is_hydrated ? `visible` : `hidden`}
  {@attach tooltip_opts !== false && tooltip({ placement: `bottom`, ...tooltip_opts })}
  {...rest}
  onclick={chain_handlers(() => apply_theme_mode(next_mode), rest.onclick)}
>
  {#if is_hydrated}
    <Icon
      icon={mode_icons[theme.mode]}
      {...icon_props}
      style="transform: scale(1.5); {icon_props.style ?? ``}"
    />
  {/if}
</button>

<style>
  button {
    display: inline-flex;
    place-items: center;
    place-content: center;
    width: var(--theme-toggle-size, 1.8em);
    height: var(--theme-toggle-size, 1.8em);
    line-height: var(--theme-toggle-line-height, 1);
    background: var(--theme-toggle-background, transparent);
    border: var(--theme-toggle-border, none);
    box-sizing: border-box;
    border-radius: var(--theme-toggle-border-radius, 50%);
    cursor: pointer;
  }
  button:hover {
    background: light-dark(rgba(0, 0, 100, 0.1), rgba(200, 200, 255, 0.1));
  }
</style>
