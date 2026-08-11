import type { Attachment } from 'svelte/attachments'
import { SvelteMap } from 'svelte/reactivity'
import type { Placement } from '../utils'
import { clamp, compute_position, get_uuid } from '../utils'
import { auto_update_position } from './float'
import { css_px, register_escape_layer } from './shared'

export type TooltipTrigger = `hover-focus` | `hover` | `focus` | `manual`
export type TooltipWrap = `balance` | `normal` | `nowrap`
export type TooltipStrategy = `top-layer` | `fixed` | `absolute`
export type TooltipOpenReason =
  | `pointer`
  | `focus`
  | `blur`
  | `escape`
  | `controlled`
  | `visibility`

export type TooltipOpenDetail = {
  trigger: HTMLElement
  reason: TooltipOpenReason
}

export interface TooltipOptions {
  content?: string | ((trigger: HTMLElement) => string)
  render?: (content_el: HTMLElement, trigger: HTMLElement) => undefined | (() => void)
  placement?: Placement | `auto`
  align?: `center` | `start` | `end`
  fallback_placements?: Placement[]
  offset?: number
  cross_axis_offset?: number
  viewport_padding?: number
  boundary?: Element | `viewport`
  flip?: boolean
  shift?: boolean
  strategy?: TooltipStrategy
  wrap?: TooltipWrap
  trigger?: TooltipTrigger
  open_delay_ms?: number
  close_delay_ms?: number
  skip_delay_ms?: number
  open?: boolean
  on_open_change?: (open: boolean, detail: TooltipOpenDetail) => void
  disabled?: boolean
  delegate?: boolean | string
  style?: string
  show_arrow?: boolean
  // HTML is opt-in, including delegated title/aria-label/data-title. Only pass trusted
  // content; pair user-controlled delegated attributes with sanitize_html.
  allow_html?: boolean
  sanitize_html?: (html: string) => string
}

type TooltipRegistration = {
  root: HTMLElement
  options: TooltipOptions
  delegate_selector: string | null
  original_titles: SvelteMap<HTMLElement, string>
  cleaned: boolean
}

type TooltipLocation = `trigger` | `surface` | null
type TooltipPhase = `idle` | `open-requested` | `close-requested` | `dismissed`

type ActiveTooltip = {
  registration: TooltipRegistration
  trigger: HTMLElement
  pointer_trigger: boolean
  pointer_surface: boolean
  focus: TooltipLocation
  open: boolean
  phase: TooltipPhase
}

type HideOptions = { keep_active?: boolean; notify?: boolean; replay_queued?: boolean }

type QueuedActivation = {
  registration: TooltipRegistration
  trigger: HTMLElement
  reason: `pointer` | `focus`
  pointer: boolean
  focus: boolean
}

const TOOLTIP_SOURCE_SELECTOR = `[title], [aria-label], [data-title]`
const TOOLTIP_CONTENT_ATTRIBUTES = [`title`, `aria-label`, `data-title`]
const TOOLTIP_OBSERVED_ATTRIBUTES = [
  ...TOOLTIP_CONTENT_ATTRIBUTES,
  `class`,
  `style`,
  `lang`,
  `dir`,
]
const TOOLTIP_CSS_VARS = [
  `--tooltip-bg`,
  `--text-color`,
  `--tooltip-border`,
  `--tooltip-padding`,
  `--tooltip-radius`,
  `--tooltip-font-size`,
  `--tooltip-font-family`,
  `--tooltip-shadow`,
  `--tooltip-max-width`,
  `--tooltip-max-height`,
  `--tooltip-opacity`,
  `--tooltip-arrow-size`,
  `--tooltip-transition`,
  `--tooltip-z-index`,
] as const

const OPPOSITE_PLACEMENT: Record<Placement, Placement> = {
  top: `bottom`,
  bottom: `top`,
  left: `right`,
  right: `left`,
}

const handled_tooltip_events = new WeakSet<Event>()

const is_transparent = (color: string): boolean =>
  [``, `transparent`, `rgba(0, 0, 0, 0)`].includes(color.trim())

// Computed length or a fallback when the property is unset or not in px.
const css_px_or = (css_length: string, fallback: number): number => {
  const parsed = css_px(css_length)
  return Number.isFinite(parsed) ? parsed : fallback
}

const accepts_tooltip_trigger = (
  options: TooltipOptions,
  trigger: `hover` | `focus`,
): boolean => [trigger, `hover-focus`].includes(options.trigger ?? `hover-focus`)

const changed_attribute_names = (records: MutationRecord[], skip?: string): string[] =>
  records.flatMap(({ attributeName }) =>
    attributeName && attributeName !== skip ? [attributeName] : [],
  )

const described_by_tokens = (element: Element): string[] =>
  (element.getAttribute(`aria-describedby`) ?? ``).split(/\s+/u).filter(Boolean)

const first_nonempty = (...values: (string | null | undefined)[]): string | null =>
  values.find(
    (value): value is string => typeof value === `string` && value.length > 0,
  ) ?? null

const add_description = (element: Element, id: string): void => {
  const tokens = described_by_tokens(element)
  if (!tokens.includes(id)) tokens.push(id)
  element.setAttribute(`aria-describedby`, tokens.join(` `))
}

const remove_description = (element: Element, id: string): void => {
  const tokens = described_by_tokens(element).filter((token) => token !== id)
  if (tokens.length > 0) element.setAttribute(`aria-describedby`, tokens.join(` `))
  else element.removeAttribute(`aria-describedby`)
}

// The visual viewport (so an open on-screen keyboard shrinks it), clipped to the
// boundary element when one is given.
const resolve_boundary = (options: TooltipOptions, doc: Document) => {
  const view = doc.defaultView
  const visual = view?.visualViewport
  const left = visual?.offsetLeft ?? 0
  const top = visual?.offsetTop ?? 0
  const right = left + (visual?.width ?? view?.innerWidth ?? 0)
  const bottom = top + (visual?.height ?? view?.innerHeight ?? 0)
  if (!(options.boundary instanceof Element)) return { top, left, right, bottom }
  const limit = options.boundary.getBoundingClientRect()
  return {
    top: Math.max(top, limit.top),
    left: Math.max(left, limit.left),
    right: Math.min(right, limit.right),
    bottom: Math.min(bottom, limit.bottom),
  }
}

const apply_triangle_style = (
  triangle_el: HTMLElement,
  placement: Placement,
  px: number,
  color: string,
  cross_axis_center: number,
): void => {
  triangle_el.style.cssText = `position: absolute; width: 0; height: 0; pointer-events: none;`
  const vertical = placement === `top` || placement === `bottom`
  const set = (property: string, value: string) =>
    triangle_el.style.setProperty(property, value)
  set(vertical ? `left` : `top`, `${cross_axis_center - px}px`)
  set(OPPOSITE_PLACEMENT[placement], `-${px}px`)
  set(`border-${vertical ? `left` : `top`}`, `${px}px solid transparent`)
  set(`border-${vertical ? `right` : `bottom`}`, `${px}px solid transparent`)
  set(`border-${placement}`, `${px}px solid ${color}`)
}

const sync_arrow_styles = (
  tooltip_el: HTMLElement,
  placement: Placement,
  trigger_rect: DOMRect,
  tooltip_rect: { width: number; height: number },
  left: number,
  top: number,
): void => {
  const arrow = tooltip_el.querySelector<HTMLElement>(`.custom-tooltip-arrow`)
  if (!arrow) return
  const styles = getComputedStyle(tooltip_el)
  const background = styles.backgroundColor.trim()
  const arrow_px = css_px_or(styles.getPropertyValue(`--tooltip-arrow-size`), 6)
  const radius_px = css_px_or(styles.borderTopLeftRadius, 0)
  const vertical = placement === `top` || placement === `bottom`
  const dimension = vertical ? tooltip_rect.width : tooltip_rect.height
  const anchor_center = vertical
    ? (trigger_rect.left + trigger_rect.right) / 2 - left
    : (trigger_rect.top + trigger_rect.bottom) / 2 - top
  const min_center = arrow_px + radius_px
  const max_center = dimension - arrow_px - radius_px
  const cross_axis_center =
    max_center < min_center ? dimension / 2 : clamp(anchor_center, min_center, max_center)
  const fill_color = is_transparent(background)
    ? `var(--tooltip-bg, light-dark(#fff, #2a2a2e))`
    : background
  apply_triangle_style(arrow, placement, arrow_px, fill_color, cross_axis_center)

  const border_arrow = tooltip_el.querySelector<HTMLElement>(
    `.custom-tooltip-arrow-border`,
  )
  if (!border_arrow) return
  const border_width = css_px_or(styles.borderTopWidth, 0)
  const border_color = styles.borderTopColor
  if (border_width <= 0 || is_transparent(border_color)) {
    border_arrow.remove()
    return
  }
  apply_triangle_style(
    border_arrow,
    placement,
    arrow_px + border_width * 1.4,
    border_color,
    cross_axis_center,
  )
}

const remember_and_strip_title = (
  registration: TooltipRegistration,
  trigger: HTMLElement,
): string | null => {
  const title = trigger.getAttribute(`title`)
  if (title === null) return registration.original_titles.get(trigger) ?? null
  registration.original_titles.set(trigger, title)
  trigger.removeAttribute(`title`)
  return title
}

const create_active_tooltip = (
  registration: TooltipRegistration,
  trigger: HTMLElement,
): ActiveTooltip => ({
  registration,
  trigger,
  pointer_trigger: false,
  pointer_surface: false,
  focus: null,
  open: false,
  phase: `idle`,
})

const create_tooltip_manager = (doc: Document, on_empty: () => void) => {
  let registration_count = 0
  let active: ActiveTooltip | null = null
  // A controlled tooltip owns the surface until its consumer gives it up, so another
  // trigger's activation waits here instead of taking over. Index 0 is next in line;
  // a focus activation parks the previous entry behind it, so focus moving away and
  // back again restores the hover that was already waiting. Never more than those two.
  let queued: QueuedActivation[] = []
  const surface = doc.createElement(`div`)
  surface.className = `custom-tooltip`
  surface.id = `tooltip-${get_uuid()}`
  surface.setAttribute(`role`, `tooltip`)
  const content_el = doc.createElement(`span`)
  content_el.className = `tooltip-content`
  let open_timeout: ReturnType<typeof setTimeout> | undefined
  let close_timeout: ReturnType<typeof setTimeout> | undefined
  let stop_auto_update: (() => void) | undefined
  let stop_escape_layer: (() => void) | undefined
  let render_cleanup: (() => void) | undefined
  let last_closed_at = -Infinity
  let last_input_was_touch = false
  let hide_in_progress = false

  const compact_balanced_tooltip = () => {
    const can_compact =
      surface.style.width === `max-content` &&
      surface.style.textWrap === `balance` &&
      content_el.childElementCount === 0
    if (!can_compact) return
    const line_widths = Array.from(content_el.getClientRects(), ({ width }) => width)
    if (line_widths.length < 2) return
    const styles = getComputedStyle(surface)
    const chrome_width =
      css_px_or(styles.paddingLeft, 0) +
      css_px_or(styles.paddingRight, 0) +
      css_px_or(styles.borderLeftWidth, 0) +
      css_px_or(styles.borderRightWidth, 0)
    surface.style.width = `${Math.ceil(Math.max(...line_widths) + chrome_width)}px`
  }

  const clear_open_timeout = () => {
    clearTimeout(open_timeout)
    open_timeout = undefined
  }
  const clear_close_timeout = () => {
    clearTimeout(close_timeout)
    close_timeout = undefined
  }

  const track_input = (event: PointerEvent | KeyboardEvent) => {
    last_input_was_touch = event instanceof PointerEvent && event.pointerType === `touch`
  }
  doc.addEventListener(`pointerdown`, track_input, true)
  doc.addEventListener(`keydown`, track_input, true)

  surface.addEventListener(`pointerenter`, () => {
    if (!active || !accepts_tooltip_trigger(active.registration.options, `hover`)) return
    active.pointer_surface = true
    clear_close_timeout()
  })
  surface.addEventListener(`pointerleave`, () => {
    if (!active) return
    active.pointer_surface = false
    close_if_interaction_ended(`pointer`)
  })
  surface.addEventListener(`focusin`, () => {
    if (!active) return
    active.focus = `surface`
    clear_close_timeout()
  })
  surface.addEventListener(`focusout`, (event) => {
    if (!active) return
    active.focus =
      event.relatedTarget instanceof Node && surface.contains(event.relatedTarget)
        ? `surface`
        : null
    close_if_interaction_ended(`blur`)
  })

  const release_delegated_title = (
    registration: TooltipRegistration,
    trigger: HTMLElement,
  ): void => {
    const title = registration.original_titles.get(trigger)
    if (!registration.delegate_selector || title === undefined) return
    if (!trigger.hasAttribute(`title`)) trigger.setAttribute(`title`, title)
    registration.original_titles.delete(trigger)
  }

  const resolve_content = (
    registration: TooltipRegistration,
    trigger: HTMLElement,
  ): string | null => {
    const { content } = registration.options
    if (content !== undefined) {
      return first_nonempty(typeof content === `function` ? content(trigger) : content)
    }
    const title = remember_and_strip_title(registration, trigger)
    return first_nonempty(
      title,
      trigger.getAttribute(`aria-label`),
      trigger.getAttribute(`data-title`),
    )
  }

  const apply_surface_context = (trigger: HTMLElement, options: TooltipOptions): void => {
    surface.style.cssText = `
      position: fixed; inset: auto; margin: 0; z-index: var(--tooltip-z-index, 9999);
      opacity: 0; display: inline-block; box-sizing: border-box; width: max-content;
      max-width: min(var(--tooltip-max-width, 280px), var(--tooltip-available-width, calc(100dvw - 16px)));
      max-height: var(--tooltip-max-height, min(50dvh, 480px)); overflow-y: auto;
      background-color: var(--tooltip-bg, light-dark(#fff, #2a2a2e));
      color: var(--text-color, light-dark(#222, #eee));
      border: var(--tooltip-border, 1px solid light-dark(lightgray, #555));
      padding: var(--tooltip-padding, 2px 6px); border-radius: var(--tooltip-radius, 5pt);
      font-family: var(--tooltip-font-family, inherit); font-size: var(--tooltip-font-size, 0.8rem);
      line-height: 1.4; overflow-wrap: anywhere; text-wrap: balance; white-space: normal;
      pointer-events: auto; filter: var(--tooltip-shadow, drop-shadow(0 2px 8px rgba(0,0,0,0.25)));
      transition: opacity var(--tooltip-transition, 0.15s ease-out);
    `
    const trigger_styles = getComputedStyle(trigger)
    for (const css_var_name of TOOLTIP_CSS_VARS) {
      const value = trigger_styles.getPropertyValue(css_var_name).trim()
      if (value) surface.style.setProperty(css_var_name, value)
    }
    if (!surface.style.getPropertyValue(`--tooltip-font-family`)) {
      surface.style.setProperty(`--tooltip-font-family`, trigger_styles.fontFamily)
    }
    surface.style.fontStyle = trigger_styles.fontStyle
    surface.style.fontWeight = trigger_styles.fontWeight
    surface.style.letterSpacing = trigger_styles.letterSpacing
    // `closest` matches the trigger itself first, so it covers its own lang/dir too.
    const nearest = (attribute: string, ...rest: (string | undefined)[]) =>
      first_nonempty(
        trigger.closest(`[${attribute}]`)?.getAttribute(attribute),
        ...rest,
      ) ?? ``
    surface.lang = nearest(`lang`, doc.documentElement.lang)
    surface.dir = nearest(`dir`, doc.documentElement.dir, trigger_styles.direction)

    // The base rules already wrap; only `nowrap` has to undo them.
    const wrap = options.wrap ?? `balance`
    surface.style.textWrap = wrap === `normal` ? `wrap` : wrap
    if (wrap === `nowrap`) {
      surface.style.whiteSpace = `nowrap`
      surface.style.overflowWrap = `normal`
    }
    if (matchMedia(`(prefers-reduced-motion: reduce)`).matches) {
      surface.style.transition = `none`
    }
    if (options.style) surface.style.cssText += options.style

    // A page that goes dark through CSS vars alone resolves the default light-dark()
    // background to LIGHT while inheriting near-white text. Follow the OS preference
    // instead, unless the page declares a scheme or the trigger overrides either var.
    const body_styles = getComputedStyle(doc.body)
    if (!body_styles.colorScheme || body_styles.colorScheme === `normal`) {
      const overrides_page = (css_var: string) => {
        const value = surface.style.getPropertyValue(css_var)
        return value && value !== body_styles.getPropertyValue(css_var).trim()
      }
      if (!overrides_page(`--tooltip-bg`) && !overrides_page(`--text-color`)) {
        surface.style.setProperty(`color-scheme`, `light dark`)
        surface.style.setProperty(`--text-color`, `light-dark(#222, #eee)`)
      }
    }
  }

  const render_active_content = (): boolean => {
    if (!active) return false
    render_cleanup?.()
    render_cleanup = undefined
    content_el.replaceChildren()
    const { options } = active.registration
    if (options.render) {
      render_cleanup = options.render(content_el, active.trigger) ?? undefined
      return true
    }
    const content = resolve_content(active.registration, active.trigger)
    if (!content) return false
    if (options.allow_html !== true) content_el.textContent = content
    else {
      let html = content.replaceAll(/\r\n?|\n/gu, `<br/>`)
      if (options.sanitize_html) html = options.sanitize_html(html)
      content_el.innerHTML = html
    }
    return true
  }

  const position_active = (): void => {
    if (!active?.open) return
    if (!active.trigger.isConnected) {
      hide_active(`visibility`)
      return
    }
    const { options } = active.registration
    const boundary = resolve_boundary(options, doc)
    const viewport_padding = options.viewport_padding ?? 8
    const available_width = `${Math.max(0, boundary.right - boundary.left - viewport_padding * 2)}px`
    const previous_available = surface.style.getPropertyValue(`--tooltip-available-width`)
    if (previous_available && previous_available !== available_width)
      apply_surface_context(active.trigger, options)
    surface.style.setProperty(`--tooltip-available-width`, available_width)
    compact_balanced_tooltip()
    const trigger_rect = active.trigger.getBoundingClientRect()
    // A zero-area rect carries no position, so it can never count as scrolled away.
    const has_area =
      trigger_rect.right > trigger_rect.left || trigger_rect.bottom > trigger_rect.top
    const off_screen =
      trigger_rect.right <= boundary.left ||
      trigger_rect.left >= boundary.right ||
      trigger_rect.bottom <= boundary.top ||
      trigger_rect.top >= boundary.bottom
    if (has_area && off_screen) {
      hide_active(`visibility`)
      return
    }
    const tooltip_rect = surface.getBoundingClientRect()
    // Only placement and offset differ from compute_position's own defaults, so the
    // remaining options pass straight through.
    const { top, left, placement } = compute_position(trigger_rect, tooltip_rect, {
      placement: options.placement ?? `auto`,
      offset: options.offset ?? 12,
      align: options.align,
      cross_axis_offset: options.cross_axis_offset,
      fallback_placements: options.fallback_placements,
      flip: options.flip,
      shift: options.shift,
      padding: viewport_padding,
      boundary,
    })
    const view = doc.defaultView
    const add_scroll = options.strategy !== `fixed` && !surface.hasAttribute(`popover`)
    surface.style.position = add_scroll ? `absolute` : `fixed`
    surface.style.left = `${left + (add_scroll ? (view?.scrollX ?? 0) : 0)}px`
    surface.style.top = `${top + (add_scroll ? (view?.scrollY ?? 0) : 0)}px`
    surface.dataset.placement = placement
    sync_arrow_styles(surface, placement, trigger_rect, tooltip_rect, left, top)
    surface.style.opacity =
      surface.style.getPropertyValue(`--tooltip-opacity`).trim() || `1`
  }

  function activate_queued(): void {
    if (active || hide_in_progress) return
    const [next] = queued
    queued = []
    if (!next || next.registration.cleaned || !next.trigger.isConnected) return
    active = create_active_tooltip(next.registration, next.trigger)
    active.pointer_trigger = next.pointer
    active.focus = next.focus ? `trigger` : null
    remember_and_strip_title(next.registration, next.trigger)
    request_open(next.reason)
  }

  // Callers that install an owner of their own right after pass replay_queued: false.
  function hide_active(
    reason: TooltipOpenReason,
    { keep_active = false, notify = true, replay_queued = true }: HideOptions = {},
  ): void {
    const closing = active
    clear_open_timeout()
    clear_close_timeout()
    active_observer.disconnect()
    stop_auto_update?.()
    stop_auto_update = undefined
    stop_escape_layer?.()
    stop_escape_layer = undefined
    render_cleanup?.()
    render_cleanup = undefined
    if (!closing) return
    hide_in_progress = true
    const was_open = closing.open
    closing.open = false
    closing.phase = keep_active ? `dismissed` : `idle`
    if (closing.trigger.isConnected && surface.contains(doc.activeElement)) {
      closing.phase = `dismissed`
      closing.trigger.focus({ preventScroll: true })
    }
    remove_description(closing.trigger, surface.id)
    if (surface.hasAttribute(`popover`)) surface.hidePopover()
    else {
      surface.hidden = true
      surface.style.display = `none`
    }
    if (keep_active) {
      closing.pointer_surface = false
      if (closing.focus === `surface`) closing.focus = null
      // Not a self-assignment: handing focus back above re-enters through focusout and
      // focusin, which can null `active` or install a fresh one over the dismissal.
      active = closing
    } else {
      release_delegated_title(closing.registration, closing.trigger)
      active = null
    }
    hide_in_progress = false
    if (was_open) last_closed_at = Date.now()
    if (was_open && notify)
      closing.registration.options.on_open_change?.(false, {
        trigger: closing.trigger,
        reason,
      })
    if (!keep_active && replay_queued) activate_queued()
  }

  const request_close = (
    reason: `pointer` | `blur` | `escape`,
    keep_active = false,
  ): void => {
    if (!active) return
    const { options } = active.registration
    if (options.open !== true) {
      hide_active(reason, { keep_active })
      return
    }
    if (active.phase === `close-requested`) return
    active.phase = `close-requested`
    options.on_open_change?.(false, { trigger: active.trigger, reason })
  }

  const active_observer = new MutationObserver((mutations) => {
    const observed = active
    if (!observed) return
    const changed_attributes = changed_attribute_names(mutations)
    if (changed_attributes.includes(`title`)) {
      let title = observed.trigger.getAttribute(`title`)
      if (title === null) observed.registration.original_titles.delete(observed.trigger)
      else {
        // A custom element can put `title` back from its own attributeChangedCallback,
        // so strip until it stops returning rather than trading one write per round.
        for (let strip_count = 0; title !== null; strip_count += 1) {
          if (strip_count >= 10) {
            hide_active(`visibility`, { notify: false })
            throw new Error(
              `tooltip title could not be stripped from <${observed.trigger.tagName.toLowerCase()}>`,
            )
          }
          observed.registration.original_titles.set(observed.trigger, title)
          observed.trigger.removeAttribute(`title`)
          title = observed.trigger.getAttribute(`title`)
        }
        changed_attributes.push(
          ...changed_attribute_names(active_observer.takeRecords(), `title`),
        )
      }
    }
    const content_changed = changed_attributes.some((attribute) =>
      TOOLTIP_CONTENT_ATTRIBUTES.includes(attribute),
    )
    const { options } = observed.registration
    if (
      content_changed &&
      options.content === undefined &&
      !options.render &&
      !render_active_content()
    ) {
      hide_active(`visibility`)
      return
    }
    apply_surface_context(observed.trigger, options)
    position_active()
  })

  const show_active = (reason: TooltipOpenReason): void => {
    clear_open_timeout()
    if (
      !active ||
      active.phase === `dismissed` ||
      active.open ||
      !active.trigger.isConnected
    )
      return
    const opening = active
    const { options } = opening.registration
    if (options.open === false && reason !== `controlled`) {
      if (opening.phase !== `open-requested`) {
        opening.phase = `open-requested`
        options.on_open_change?.(true, { trigger: opening.trigger, reason })
      }
      return
    }
    apply_surface_context(opening.trigger, options)
    if (!render_active_content()) {
      surface.hidden = true
      surface.style.display = `none`
      return
    }
    surface.replaceChildren(content_el)
    if (options.show_arrow !== false) {
      for (const class_name of [`custom-tooltip-arrow-border`, `custom-tooltip-arrow`]) {
        surface.append(Object.assign(doc.createElement(`div`), { className: class_name }))
      }
    }
    surface.hidden = false
    if (!surface.isConnected) doc.body.append(surface)
    const supports_top_layer =
      `popover` in surface && typeof surface.showPopover === `function`
    if ((options.strategy ?? `top-layer`) === `top-layer` && supports_top_layer) {
      surface.setAttribute(`popover`, `manual`)
      surface.showPopover({ source: opening.trigger })
    } else surface.removeAttribute(`popover`)
    add_description(opening.trigger, surface.id)
    opening.open = true
    opening.phase = `idle`
    active_observer.observe(opening.trigger, {
      attributes: true,
      attributeFilter: TOOLTIP_OBSERVED_ATTRIBUTES,
    })
    stop_auto_update = auto_update_position(opening.trigger, surface, position_active)
    stop_escape_layer = register_escape_layer((event) => {
      if (!active?.open) return true
      event.preventDefault()
      event.stopPropagation()
      request_close(`escape`, true)
      return true
    })
    position_active()
    if (active !== opening || !opening.open) return
    options.on_open_change?.(true, { trigger: opening.trigger, reason })
  }

  const request_open = (reason: `pointer` | `focus` | `controlled`): void => {
    if (!active || active.phase === `dismissed` || active.open) return
    clear_open_timeout()
    const { options } = active.registration
    const elapsed_since_close = Date.now() - last_closed_at
    const warm =
      elapsed_since_close >= 0 && elapsed_since_close <= (options.skip_delay_ms ?? 300)
    const delay = reason === `pointer` && !warm ? (options.open_delay_ms ?? 400) : 0
    if (delay === 0) show_active(reason)
    else open_timeout = setTimeout(() => show_active(reason), delay)
  }

  function close_if_interaction_ended(reason: `pointer` | `blur`): void {
    if (!active) return
    if (active.registration.options.trigger === `manual`) return
    clear_close_timeout()
    if (active.pointer_trigger || active.pointer_surface || active.focus) return
    clear_open_timeout()
    if (active.phase === `dismissed` || !active.open) {
      release_delegated_title(active.registration, active.trigger)
      active = null
      activate_queued()
      return
    }
    close_timeout = setTimeout(
      () => request_close(reason),
      active.registration.options.close_delay_ms ?? 100,
    )
  }

  const queue_activation = (
    registration: TooltipRegistration,
    trigger: HTMLElement,
    reason: `pointer` | `focus`,
  ): void => {
    const [next] = queued
    if (next?.registration === registration && next.trigger === trigger) {
      next.reason = reason
      next[reason] = true
      return
    }
    if (reason === `pointer` && next?.focus) return // a hover cannot displace a focus
    const entry = {
      registration,
      trigger,
      reason,
      pointer: reason === `pointer`,
      focus: reason === `focus`,
    }
    // focus pushes the standing entry back a place, hover replaces it
    queued =
      reason === `focus` ? [entry, ...queued.slice(0, 1)] : [entry, ...queued.slice(1)]
  }

  const activate = (
    registration: TooltipRegistration,
    trigger: HTMLElement,
    reason: `pointer` | `focus`,
  ): void => {
    if (active && (active.registration !== registration || active.trigger !== trigger)) {
      const controlled = active.registration.options.open === true
      const close_reason = reason === `focus` ? `blur` : `pointer`
      if (controlled) {
        queue_activation(registration, trigger, reason)
        request_close(close_reason)
        return
      }
      hide_active(close_reason, { replay_queued: false })
    }
    queued = []
    remember_and_strip_title(registration, trigger)
    active ??= create_active_tooltip(registration, trigger)
    if (active.phase === `close-requested`) active.phase = `idle`
    if (reason === `pointer`) active.pointer_trigger = true
    else active.focus = `trigger`
    request_open(reason)
  }

  const enter_pointer = (
    registration: TooltipRegistration,
    trigger: HTMLElement,
    pointer_type: string,
  ): void => {
    if (pointer_type === `touch`) return
    if (!accepts_tooltip_trigger(registration.options, `hover`)) return
    last_input_was_touch = false
    activate(registration, trigger, `pointer`)
  }

  const leave_trigger = (
    registration: TooltipRegistration,
    event: PointerEvent | FocusEvent,
    reason: `pointer` | `focus`,
  ): void => {
    // A queued trigger this interaction has now left no longer wants to open. Dropping
    // its last remaining interaction drops the entry, promoting whatever waits behind.
    const interaction_left = (entry: QueuedActivation): boolean =>
      entry.registration === registration &&
      entry[reason] &&
      event.target instanceof Node &&
      entry.trigger.contains(event.target) &&
      !(
        event.relatedTarget instanceof Node && entry.trigger.contains(event.relatedTarget)
      )
    queued = queued.filter((entry) => {
      if (!interaction_left(entry)) return true
      entry[reason] = false
      entry.reason = entry.focus ? `focus` : `pointer`
      return entry.pointer || entry.focus
    })
    if (!active || active.registration !== registration) return
    if (event.relatedTarget instanceof Node) {
      if (active.trigger.contains(event.relatedTarget)) return
      if (surface.contains(event.relatedTarget)) {
        if (reason === `pointer`) {
          active.pointer_trigger = false
          active.pointer_surface = true
        } else active.focus = `surface`
        clear_close_timeout()
        return
      }
    }
    if (reason === `pointer`) active.pointer_trigger = false
    else active.focus = null
    close_if_interaction_ended(reason === `pointer` ? `pointer` : `blur`)
  }

  const enter_focus = (registration: TooltipRegistration, trigger: HTMLElement): void => {
    const { options } = registration
    if (!accepts_tooltip_trigger(options, `focus`)) return
    // A tap focuses right after suppressing the hover tooltip; only explicit focus
    // mode still wants to open there.
    if (last_input_was_touch && options.trigger !== `focus`) return
    activate(registration, trigger, `focus`)
  }

  const sync_controlled = (registration: TooltipRegistration): void => {
    if (registration.cleaned) return
    if (registration.options.open !== true) {
      if (active?.registration === registration) {
        hide_active(`controlled`, { notify: false })
      }
      return
    }
    if (
      active &&
      (active.registration !== registration || active.trigger !== registration.root)
    ) {
      hide_active(`controlled`, { replay_queued: false })
    }
    active ??= create_active_tooltip(registration, registration.root)
    request_open(`controlled`)
  }

  const register = (registration: TooltipRegistration): (() => void) => {
    registration_count += 1
    return () => {
      if (registration.cleaned) return
      registration.cleaned = true
      if (active?.registration === registration)
        hide_active(`controlled`, { notify: false, replay_queued: false })
      queued = queued.filter((entry) => entry.registration !== registration)
      for (const [element, title] of registration.original_titles) {
        if (!element.hasAttribute(`title`)) element.setAttribute(`title`, title)
      }
      registration.original_titles.clear()
      registration_count -= 1
      // Whoever was waiting on the tooltip this registration held now gets its turn.
      activate_queued()
      if (registration_count > 0) return
      doc.removeEventListener(`pointerdown`, track_input, true)
      doc.removeEventListener(`keydown`, track_input, true)
      surface.remove()
      on_empty()
    }
  }

  return {
    register,
    enter_pointer,
    leave_trigger,
    enter_focus,
    sync_controlled,
  }
}

const tooltip_managers = new WeakMap<
  Document,
  ReturnType<typeof create_tooltip_manager>
>()

const get_tooltip_manager = (doc: Document) => {
  const existing = tooltip_managers.get(doc)
  if (existing) return existing
  const manager = create_tooltip_manager(doc, () => tooltip_managers.delete(doc))
  tooltip_managers.set(doc, manager)
  return manager
}

const validate_tooltip_options = (options: TooltipOptions): void => {
  if (
    options.render &&
    (options.content !== undefined || options.allow_html !== undefined)
  ) {
    throw new Error(`tooltip render cannot be combined with content or allow_html`)
  }
  if (options.sanitize_html && options.allow_html !== true) {
    throw new Error(`tooltip sanitize_html requires allow_html: true`)
  }
  if (options.trigger === `manual` && options.open === undefined) {
    throw new Error(`tooltip trigger: 'manual' requires the open option`)
  }
}

const registration_target = (
  registration: TooltipRegistration,
  event_target: EventTarget | null,
): HTMLElement | null => {
  const { root, delegate_selector, original_titles } = registration
  if (!(event_target instanceof Element) || !root.contains(event_target)) return null
  if (!delegate_selector) return root
  // Walk up to the root: a trigger whose title this registration already holds no longer
  // matches the default selector, so past ownership counts alongside the selector.
  let candidate: Element | null = event_target
  while (candidate) {
    if (
      candidate instanceof HTMLElement &&
      (candidate.matches(delegate_selector) || original_titles.has(candidate))
    ) {
      return candidate
    }
    candidate = candidate === root ? null : candidate.parentElement
  }
  return null
}

export const tooltip =
  (options: TooltipOptions = {}): Attachment =>
  (node: Element): (() => void) | undefined => {
    if (typeof document === `undefined` || !(node instanceof HTMLElement))
      return undefined
    validate_tooltip_options(options)
    if (options.disabled) return undefined

    const has_root_source =
      options.content !== undefined ||
      Boolean(options.render) ||
      node.matches(TOOLTIP_SOURCE_SELECTOR)
    const delegate = options.delegate ?? (!has_root_source && options.open === undefined)
    const delegate_selector =
      typeof delegate === `string` ? delegate : delegate ? TOOLTIP_SOURCE_SELECTOR : null
    // Throws the native SyntaxError naming the selector here rather than on first hover
    if (delegate_selector) node.matches(delegate_selector)

    const registration: TooltipRegistration = {
      root: node,
      options,
      delegate_selector,
      original_titles: new SvelteMap(),
      cleaned: false,
    }
    if (!delegate_selector) remember_and_strip_title(registration, node)

    const manager = get_tooltip_manager(node.ownerDocument)
    const unregister = manager.register(registration)

    // Nested tooltip containers both see the event; the innermost to claim it wins.
    const claim = (event: Event): HTMLElement | null => {
      if (handled_tooltip_events.has(event)) return null
      const trigger = registration_target(registration, event.target)
      if (trigger) handled_tooltip_events.add(event)
      return trigger
    }
    const on_pointer_over = (event: PointerEvent) => {
      const trigger = claim(event)
      if (trigger) manager.enter_pointer(registration, trigger, event.pointerType)
    }
    const on_focus_in = (event: FocusEvent) => {
      const trigger = claim(event)
      if (trigger) manager.enter_focus(registration, trigger)
    }
    const leave = (reason: `pointer` | `focus`) => (event: PointerEvent | FocusEvent) =>
      manager.leave_trigger(registration, event, reason)

    const listeners = new AbortController()
    const { signal } = listeners
    node.addEventListener(`pointerover`, on_pointer_over, { signal })
    node.addEventListener(`focusin`, on_focus_in, { signal })
    node.addEventListener(`pointerout`, leave(`pointer`), { signal })
    node.addEventListener(`focusout`, leave(`focus`), { signal })
    if (options.open !== undefined) {
      queueMicrotask(() => manager.sync_controlled(registration))
    }

    return () => {
      listeners.abort()
      unregister()
    }
  }
