<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { sync_fullscreen } from './fullscreen.svelte'
  import Icon from './Icon.svelte'
  import { ExitFullscreen, Fullscreen, type IconData } from './icons'
  import {
    merge_labels,
    FULLSCREEN_BUTTON_LABELS,
    type FullscreenButtonLabels,
  } from './labels'
  import { chain_handlers } from './utils'

  const DEFAULT_ICONS = { enter: Fullscreen, exit: ExitFullscreen }

  let {
    fullscreen = $bindable(false),
    wrapper,
    placement = `inline`,
    bg_css_var = `--fullscreen-bg`,
    icons,
    labels,
    on_change,
    on_request_error,
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, `children`> & {
    fullscreen?: boolean
    // element to send fullscreen; omit to only toggle the flag and drive fullscreen yourself
    wrapper?: HTMLElement
    // `corner`: top-right of nearest positioned ancestor (CSS vars, overridable)
    placement?: `inline` | `corner`
    bg_css_var?: string
    icons?: Partial<{ enter: IconData; exit: IconData }>
    labels?: Partial<FullscreenButtonLabels>
    on_change?: (fullscreen: boolean) => void
    on_request_error?: (error: unknown) => void
    children?: Snippet<[{ fullscreen: boolean }]>
  } = $props()

  const msg = $derived(merge_labels(FULLSCREEN_BUTTON_LABELS, labels))
  const icon_set = $derived({ ...DEFAULT_ICONS, ...icons })
  const label = $derived(fullscreen ? msg.exit : msg.enter)

  // the flag is the single source of truth: clicking flips it, the effects below turn
  // that into requestFullscreen/exitFullscreen and flip it back on Esc
  sync_fullscreen({
    get_wrapper: () => wrapper,
    get_fullscreen: () => fullscreen,
    set_fullscreen: (next_fullscreen) => (fullscreen = next_fullscreen),
    get_bg_css_var: () => bg_css_var,
    on_change: (next_fullscreen) => on_change?.(next_fullscreen),
    on_request_error: (error) => on_request_error?.(error),
  })
</script>

<button
  type="button"
  title={label}
  aria-label={label}
  {...rest}
  aria-pressed={fullscreen}
  class={[`fullscreen-btn`, placement === `corner` && `corner`, rest.class]}
  onclick={chain_handlers(() => (fullscreen = !fullscreen), rest.onclick)}
>
  {#if children}
    {@render children({ fullscreen })}
  {:else}
    <Icon icon={fullscreen ? icon_set.exit : icon_set.enter} />
  {/if}
</button>

<style>
  .fullscreen-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--fullscreen-btn-padding, 2pt);
    border-radius: var(--fullscreen-btn-border-radius, var(--border-radius, 3pt));
    background: var(--fullscreen-btn-bg, transparent);
    color: var(--fullscreen-btn-color, inherit);
    cursor: pointer;
    opacity: var(--fullscreen-btn-opacity, 1);
    transition:
      background 0.2s,
      opacity 0.2s;
  }
  .fullscreen-btn.corner {
    position: var(--fullscreen-btn-position, absolute);
    top: var(--fullscreen-btn-top, 5pt);
    right: var(--fullscreen-btn-right, 4px);
    z-index: var(--fullscreen-btn-z-index, 10);
  }
  .fullscreen-btn:hover,
  .fullscreen-btn:focus-visible {
    background: var(
      --fullscreen-btn-hover-bg,
      color-mix(in srgb, currentcolor 8%, transparent)
    );
    opacity: var(--fullscreen-btn-hover-opacity, 1);
  }
</style>
