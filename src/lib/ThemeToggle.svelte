<script lang="ts">
  import { onMount } from 'svelte'
  import type { HTMLAttributes, SVGAttributes } from 'svelte/elements'
  import { tooltip, type TooltipOptions } from './attachments/index'
  import Icon from './Icon.svelte'
  import { Monitor, Moon, Sun } from './icons'
  import { merge_defaults, THEME_TOGGLE_LABELS, type ThemeToggleLabels } from './labels'
  import {
    apply_theme_mode,
    init_theme,
    theme,
    THEME_MODE_CYCLE,
    THEME_MODES,
  } from './theme.svelte.ts'
  import { chain_handlers } from './utils'

  let {
    tooltip: tooltip_opts = {},
    icon_props = {},
    labels,
    ...rest
  }: HTMLAttributes<HTMLButtonElement> & {
    tooltip?: TooltipOptions | false
    icon_props?: Omit<SVGAttributes<SVGSVGElement>, `path` | `stroke` | `viewBox`>
    labels?: Partial<ThemeToggleLabels>
  } = $props()

  const mode_icons = { light: Sun, dark: Moon, system: Monitor } as const
  const msg = $derived(merge_defaults(THEME_TOGGLE_LABELS, labels))
  let is_hydrated = $state(false)
  const next_mode = $derived(THEME_MODE_CYCLE[theme.mode])
  const title = $derived(msg.switch_to(msg[next_mode]))
  const icon_style = $derived(`transform: scale(1.5); ${icon_props.style ?? ``}`)

  onMount(() => {
    is_hydrated = true
    return init_theme()
  })
</script>

<button
  type="button"
  {title}
  aria-label={title}
  {@attach tooltip_opts !== false && tooltip({ placement: `bottom`, ...tooltip_opts })}
  {...rest}
  onclick={chain_handlers(() => apply_theme_mode(next_mode), rest.onclick)}
>
  {#if is_hydrated}
    <Icon icon={mode_icons[theme.mode]} {...icon_props} style={icon_style} />
  {:else}
    <!-- the server can't know the stored mode: render every icon and let the data-theme-mode
    that theme_init_script puts on <html> pick one, so it shows from the first paint -->
    {#each THEME_MODES as mode (mode)}
      <Icon icon={mode_icons[mode]} {...icon_props} data-mode={mode} style={icon_style} />
    {/each}
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
    background: var(--theme-toggle-bg, transparent);
    border: var(--theme-toggle-border, none);
    box-sizing: border-box;
    border-radius: var(--theme-toggle-radius, 50%);
    cursor: pointer;
  }
  button > :global(svg[data-mode]) {
    display: none;
  }
  :global(:root[data-theme-mode='light']) button > :global(svg[data-mode='light']),
  :global(:root[data-theme-mode='dark']) button > :global(svg[data-mode='dark']),
  :global(:root[data-theme-mode='system']) button > :global(svg[data-mode='system']) {
    display: block;
  }
  button:hover {
    background: light-dark(rgba(0, 0, 100, 0.1), rgba(200, 200, 255, 0.1));
  }
</style>
