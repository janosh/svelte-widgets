import { get_bg_color } from './attachments/index'

export type FullscreenSyncOptions = {
  // the element that goes fullscreen; sync is inert until this resolves
  get_wrapper: () => HTMLElement | undefined
  get_fullscreen: () => boolean
  set_fullscreen: (fullscreen: boolean) => void
  // CSS variable painted on the wrapper with the page background, e.g. `--struct-bg-fullscreen`
  get_bg_css_var?: () => string | undefined
  on_change?: (fullscreen: boolean) => void
  // Reports rejected enter and exit requests.
  on_request_error?: (error: unknown) => void
}

// Page background as an explicit color. `get_bg_color` walks body then html — themes
// usually paint body — and the OS color scheme decides when both are transparent.
export function get_page_background(
  fallback_dark = `#1a1a1a`,
  fallback_light = `#ffffff`,
): string {
  if (typeof document === `undefined`) return ``
  const page_bg = get_bg_color(document.body)
  if (page_bg) return page_bg
  const prefers_dark = matchMedia(`(prefers-color-scheme: dark)`).matches
  return prefers_dark ? fallback_dark : fallback_light
}

// Two-way sync between a bindable `fullscreen` flag and the browser's fullscreen state,
// scoped to one wrapper element. Creates $effects, so call during component init.
export function sync_fullscreen(options: FullscreenSyncOptions): void {
  let pending_request: { wrapper: HTMLElement; entering: boolean } | null = null

  function reconcile(wrapper: HTMLElement): void {
    if (options.get_wrapper() !== wrapper) return
    const entering = options.get_fullscreen()
    if (entering !== (document.fullscreenElement === wrapper)) {
      void request_fullscreen(wrapper, entering)
    }
  }

  async function request_fullscreen(
    wrapper: HTMLElement,
    entering: boolean,
  ): Promise<void> {
    if (pending_request?.wrapper === wrapper && pending_request.entering === entering)
      return
    const request = { wrapper, entering }
    pending_request = request
    try {
      if (entering) await wrapper.requestFullscreen()
      else await document.exitFullscreen()
    } catch (error) {
      if (pending_request !== request) return
      pending_request = null
      if (options.get_wrapper() !== wrapper) return
      if (entering && !options.get_fullscreen()) return
      if (entering || document.fullscreenElement === wrapper)
        options.set_fullscreen(!entering)
      const operation = entering ? `requestFullscreen` : `exitFullscreen`
      console.error(`${operation} failed for`, wrapper, error)
      options.on_request_error?.(error)
    }
  }

  // flag -> browser
  $effect(() => {
    const wrapper = options.get_wrapper()
    if (!wrapper) return
    const fullscreen = options.get_fullscreen()
    reconcile(wrapper)

    // a fullscreened element inherits nothing from the page and would render on black.
    // Dropped again on the way out so a later theme switch cannot be read off a stale value.
    const bg_css_var = options.get_bg_css_var?.() ?? `--fullscreen-bg`
    if (fullscreen) wrapper.style.setProperty(bg_css_var, get_page_background())
    else wrapper.style.removeProperty(bg_css_var)
  })

  // browser -> flag, covering Esc, F11 and programmatic exits
  $effect(() => {
    const wrapper = options.get_wrapper()
    if (!wrapper) return undefined

    const handle_change = () => {
      // key the flag to this wrapper: comparing against document.fullscreenElement alone
      // would flip every mounted flag whenever any element goes fullscreen, and each
      // flipped flag then fires its own requestFullscreen
      const is_fullscreen = document.fullscreenElement === wrapper
      const request_settling =
        pending_request?.wrapper === wrapper && pending_request.entering === is_fullscreen
      if (request_settling) {
        pending_request = null
        if (is_fullscreen !== options.get_fullscreen()) {
          reconcile(wrapper)
          return
        }
      }
      if (is_fullscreen === options.get_fullscreen()) return
      options.set_fullscreen(is_fullscreen)
      options.on_change?.(is_fullscreen)
    }
    document.addEventListener(`fullscreenchange`, handle_change)
    return () => {
      pending_request = null
      document.removeEventListener(`fullscreenchange`, handle_change)
    }
  })
}
