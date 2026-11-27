<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { create_shortcut_flash, sync_fullscreen } from './browser/index'
  import Icon from './Icon.svelte'
  import { ExitFullscreen, Fullscreen, type IconData } from './icons'
  import {
    merge_defaults,
    FULLSCREEN_BUTTON_LABELS,
    type FullscreenButtonLabels,
  } from './labels'
  import { viewer_keys } from './attachments/keyboard'
  import { format_shortcut_keys } from './shortcuts'
  import { chain_handlers } from './utils'

  // Cropped around the glyphs so both fill 76.8% of the icon box: in their own boxes
  // mdi:fullscreen (14 of 24 units) drew visibly smaller than the exit glyph (16 of 21.5)
  const DEFAULT_ICONS: { enter: IconData; exit: IconData } = {
    enter: { ...Fullscreen, viewBox: `2.885417 2.885417 18.229166 18.229166` },
    exit: { ...ExitFullscreen, viewBox: `1.583333 1.583333 20.833334 20.833334` },
  }

  let {
    fullscreen = $bindable(false),
    wrapper,
    placement = `inline`,
    bg_css_var = `--fullscreen-bg`,
    icons,
    labels,
    on_change,
    on_request_error,
    hotkey,
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
    // once per actual transition of `wrapper`, whatever initiated it; never for a rejected request
    on_change?: (fullscreen: boolean) => void
    on_request_error?: (error: unknown) => void
    // one plain key in aria-keyshortcuts spelling (`F`, `F11`; no chords) that toggles
    // fullscreen while the pointer is over `wrapper` or focus is inside it; a wrapper inside
    // another live wrapper with the same hotkey leaves it to the outer one unless it is the one
    // in fullscreen
    hotkey?: string
    children?: Snippet<[{ fullscreen: boolean }]>
  } = $props()

  const msg = $derived(merge_defaults(FULLSCREEN_BUTTON_LABELS, labels))
  const icon_set = $derived(merge_defaults(DEFAULT_ICONS, icons))
  const label = $derived(fullscreen ? msg.exit : msg.enter)
  // a hotkey only works on a wrapper, so only then is it advertised
  const live_hotkey = $derived(wrapper && hotkey)
  const title = $derived(
    live_hotkey ? `${label} (${format_shortcut_keys({ keys: live_hotkey })})` : label,
  )
  const shortcut_flash = create_shortcut_flash<`fullscreen`>()

  // marks a live hotkey wrapper with its key, so a nested one with the same key defers to it.
  // Otherwise the innermost would win: viewer_keydown hands each press to one viewer only.
  const HOTKEY_ATTR = `data-fullscreen-hotkey`
  $effect(() => {
    const root = wrapper
    // a hidden button keeps syncing the flag (Esc still exits) but takes no key
    if (!root || !hotkey || rest.hidden) return
    if (/\s/u.test(hotkey) || (hotkey.length > 1 && hotkey.includes(`+`)))
      throw new TypeError(`FullscreenButton hotkey must be one plain key, got ${hotkey}`)
    // viewer_keys matches letters lowercased (Caps Lock), other keys by event.key
    const key = hotkey.length === 1 ? hotkey.toLowerCase() : hotkey
    root.setAttribute(HOTKEY_ATTR, key)
    const outer = `[${HOTKEY_ATTR}="${CSS.escape(key)}"]`
    const detach = viewer_keys(() =>
      !fullscreen && root.parentElement?.closest(outer)
        ? {}
        : {
            [key]: () => {
              fullscreen = !fullscreen
              shortcut_flash.show(`fullscreen`)
            },
          },
    )(root)
    return () => {
      root.removeAttribute(HOTKEY_ATTR)
      detach()
    }
  })

  // the flag is the single source of truth: clicking flips it, the effects below turn
  // that into requestFullscreen/exitFullscreen and flip it back on Esc or a rejection
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
  {title}
  aria-label={label}
  aria-keyshortcuts={live_hotkey || undefined}
  {...rest}
  style={live_hotkey
    ? [rest.style, shortcut_flash.style(`fullscreen`)].filter(Boolean).join(`; `)
    : rest.style}
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
  .fullscreen-btn[hidden] {
    display: none;
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
