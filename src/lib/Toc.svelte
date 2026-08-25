<script lang="ts">
  import type { Snippet } from 'svelte'
  import { untrack } from 'svelte'
  import type { SVGAttributes, SvelteHTMLElements } from 'svelte/elements'
  import { blur, type BlurParams } from 'svelte/transition'
  import type {
    CollapseMode,
    OpenChangeHandler,
    OpenChangeTrigger,
    SlugifyHeading,
    TocHeadingData,
  } from './types'
  import { slugify_heading, unique_heading_id } from './heading-anchors'
  import { get_heading_visibility } from './toc-utils'

  let {
    activeHeading = $bindable(null),
    activeHeadingScrollOffset = 100,
    activeTocLi = $bindable(null),
    aside = $bindable(),
    breakpoint = 1000,
    desktop = $bindable(true),
    flash_clicked_headings_for_ms: flash_duration_ms = 1500,
    getHeadingData = (node: HTMLHeadingElement): TocHeadingData => ({
      id: node.id,
      level: Number(node.nodeName[1]),
      title: node.textContent ?? ``,
    }),
    headings = $bindable([]),
    headingSelector = `:is(h2, h3, h4)`,
    excludeSelector = `.toc-exclude`,
    hide = $bindable(false),
    hideOnIntersect = null,
    autoIds = true,
    autoHide = true,
    keepActiveTocItemInView = true,
    minItems = 0,
    nav = $bindable(),
    open = $bindable(false),
    openButtonLabel = `Open table of contents`,
    reactToKeys = [`ArrowDown`, `ArrowUp`, ` `, `Enter`, `Escape`, `Tab`],
    scrollBehavior = `smooth`,
    title = `On this page`,
    tocItems = $bindable([]),
    warnOnEmpty = false,
    collapseSubheadings = false,
    slugifyHeading = (node: HTMLHeadingElement, idx: number) =>
      slugify_heading(node.textContent ?? ``) || `heading-${idx + 1}`,
    blurParams = { duration: 200 },
    openTocIcon,
    titleSnippet,
    tocItem,
    onOpenChange,
    asideProps = {},
    navProps = {},
    titleProps = {},
    olProps = {},
    liProps = {},
    openButtonProps = {},
    openButtonIconProps = {},
  }: {
    activeHeading?: HTMLHeadingElement | null
    activeHeadingScrollOffset?: number
    activeTocLi?: HTMLLIElement | null
    aside?: HTMLElement | undefined
    breakpoint?: number // in pixels (smaller window width is considered mobile, larger is desktop)
    desktop?: boolean
    flash_clicked_headings_for_ms?: number
    getHeadingData?: (node: HTMLHeadingElement) => TocHeadingData | null
    // the result of document.querySelectorAll(headingSelector). can be useful for binding
    headings?: HTMLHeadingElement[]
    headingSelector?: string
    excludeSelector?: string
    hide?: boolean
    hideOnIntersect?: string | HTMLElement[] | null
    autoIds?: boolean
    autoHide?: boolean
    keepActiveTocItemInView?: boolean // requires scrollend event browser support
    minItems?: number
    nav?: HTMLElement | undefined
    open?: boolean
    openButtonLabel?: string
    reactToKeys?: false | string[]
    scrollBehavior?: `auto` | `smooth`
    title?: string
    tocItems?: HTMLLIElement[]
    warnOnEmpty?: boolean
    // collapse subheadings under inactive parent headings
    // true = full nested collapse (each level collapses independently)
    // 'h3' = h3 is deepest collapsing level, h4+ expand together when h3 ancestor visible
    collapseSubheadings?: CollapseMode
    slugifyHeading?: SlugifyHeading
    blurParams?: BlurParams | null | undefined
    openTocIcon?: Snippet
    titleSnippet?: Snippet
    tocItem?: Snippet<[HTMLHeadingElement]>
    onOpenChange?: OpenChangeHandler
    asideProps?: SvelteHTMLElements[`aside`]
    navProps?: SvelteHTMLElements[`nav`]
    titleProps?: SvelteHTMLElements[`h2`]
    olProps?: SvelteHTMLElements[`ol`]
    liProps?: SvelteHTMLElements[`li`]
    openButtonProps?: SvelteHTMLElements[`button`]
    openButtonIconProps?: SVGAttributes<SVGSVGElement>
  } = $props()

  // fallback to clear scroll_target if scrollend never fires (e.g. no scroll needed)
  const scroll_target_fallback_ms = 1000
  // distance increase (px) that counts as the user manually scrolling away from a target
  const manual_scroll_threshold_px = 50
  const custom_interactive_selector = `a, button, input, select, textarea, summary, [role="button"], [role="link"], [tabindex]`
  const is_activation_key = (key: string) => key === `Enter` || key === ` `
  const is_modified_click = (event: MouseEvent) =>
    event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

  let window_width: number = $state(0)
  // page_has_scrolled controls ignoring spurious scrollend events on page load before any actual
  // scrolling in chrome. see https://github.com/janosh/svelte-toc/issues/57
  let page_has_scrolled: boolean = $state(false)
  // tracks whether TOC overlaps with any hideOnIntersect elements (desktop only)
  let is_overlapping_hide_target: boolean = $state(false)
  // tracks the target heading during programmatic scrolls (click/keyboard-initiated)
  // prevents scroll events from incorrectly updating activeHeading during smooth scroll
  let scroll_target: HTMLHeadingElement | null = $state(null)
  // fallback timeout to clear scroll_target if scrollend doesn't fire
  // (e.g., no scroll needed, or browser doesn't support scrollend)
  let scroll_target_timeout: ReturnType<typeof setTimeout> | null = null
  // tracks previous distance to scroll_target to detect manual scroll direction
  // initialized to Infinity so first scroll event always passes the "distance increasing" check
  let prev_scroll_target_distance: number = Infinity
  // cache selector validity (keyed by `name:selector`) to avoid re-querying every update
  let selector_validity: Record<string, boolean> = {}
  // tracks which invalid collapseSubheadings values were already warned about
  let collapse_mode_warned: Record<string, boolean> = {}
  let last_reported_open: boolean | undefined = undefined
  let heading_data: TocHeadingData[] = $state([])
  // whether update_toc_headings has completed a pass. without this, a page that genuinely
  // has no headings can't tell its first run apart from "nothing changed", since both
  // compare an empty query result against the empty initial headings array.
  let headings_initialized = false

  // helper to clear scroll_target state and cancel fallback timeout
  function clear_scroll_target() {
    if (scroll_target_timeout) {
      clearTimeout(scroll_target_timeout)
      scroll_target_timeout = null
    }
    scroll_target = null
    prev_scroll_target_distance = Infinity
  }

  function set_open(value: boolean, trigger: OpenChangeTrigger) {
    if ((last_reported_open ?? open) === value) return
    last_reported_open = value
    open = value
    onOpenChange?.({ open: value, desktop, trigger })
  }

  type LiEvent = (MouseEvent | KeyboardEvent) & {
    currentTarget: EventTarget & HTMLLIElement
  }

  function event_targets_custom_interactive(event: LiEvent) {
    if (!tocItem || !(event.target instanceof Element)) return false
    // only bypass scroll-to-heading when the event lands on an interactive element
    // nested *inside* the li; fallback li semantics must not count as custom content
    const interactive = event.target.closest(custom_interactive_selector)
    return interactive !== null && interactive !== event.currentTarget
  }

  let levels: number[] = $derived(heading_data.map(({ level }) => level))
  let min_level: number = $derived(levels.length ? Math.min(...levels) : 0)

  // the CollapseMode type only permits h2-h6, so a bad level is reachable only from
  // untyped callers. warn (once per value, like selector_is_valid) and fall back to no
  // collapsing rather than quietly picking some threshold off a NaN.
  function normalize_collapse_mode(mode: CollapseMode): CollapseMode {
    if (typeof mode !== `string`) return mode
    const heading_level = Number(mode.slice(1))
    const valid = mode[0] === `h` && [2, 3, 4, 5, 6].includes(heading_level)
    if (valid) return mode
    if (!collapse_mode_warned[mode]) {
      collapse_mode_warned[mode] = true
      console.warn(
        `Toc received invalid collapseSubheadings='${mode}'. Not collapsing subheadings.`,
      )
    }
    return false
  }

  // every consumer reads this rather than the raw prop, so an invalid value disables
  // collapsing everywhere instead of only zeroing out the threshold
  let collapse_mode: CollapseMode = $derived(normalize_collapse_mode(collapseSubheadings))

  function get_collapse_threshold(mode: CollapseMode): number {
    if (mode === true) return 6
    if (typeof mode !== `string`) return Infinity
    return Number(mode.slice(1))
  }

  // Collapse threshold: true -> 6 (full nesting), 'h3' -> 3, false -> Infinity
  let collapse_threshold: number = $derived(get_collapse_threshold(collapse_mode))

  // Memoized visibility array - computed once per render cycle
  let heading_visibility: boolean[] = $derived.by(() => {
    const active_idx =
      collapse_mode && activeHeading ? headings.indexOf(activeHeading) : null
    return get_heading_visibility(levels, active_idx, collapse_threshold)
  })

  $effect(() => {
    desktop = window_width > breakpoint
  })
  $effect(() => {
    const current_open = open
    if (current_open === last_reported_open) return
    untrack(() => {
      last_reported_open = current_open
      onOpenChange?.({ open: current_open, desktop, trigger: `programmatic` })
    })
  })

  // Re-check overlap when headings or hideOnIntersect change
  $effect(() => {
    void headings // track headings as dependency
    void hideOnIntersect // track prop changes
    check_toc_overlap()
  })

  const close = (event: MouseEvent) => {
    if (!(event.target instanceof Node) || !aside?.contains(event.target)) {
      set_open(false, `outside-click`)
    }
  }

  function visible_toc_sibling(
    node: HTMLLIElement,
    prop: `nextElementSibling` | `previousElementSibling`,
  ) {
    for (
      let sibling = node[prop];
      sibling instanceof HTMLLIElement;
      sibling = sibling[prop]
    ) {
      if (!sibling.classList.contains(`collapsed`)) return sibling
    }
    return null
  }

  const first_custom_interactive = (node: HTMLLIElement | null) =>
    node?.querySelector<HTMLElement>(custom_interactive_selector) ?? null

  const focus_toc_item = (node: HTMLLIElement | null) =>
    (first_custom_interactive(node) ?? node)?.focus({ preventScroll: true })

  function focus_is_in_custom_interactive_toc_item() {
    if (!tocItem || !(document.activeElement instanceof HTMLElement)) return false
    const current_toc_li = document.activeElement.closest<HTMLLIElement>(`li`)
    const interactive = document.activeElement.closest<HTMLElement>(
      custom_interactive_selector,
    )
    return (
      current_toc_li !== null &&
      nav?.contains(current_toc_li) === true &&
      interactive !== null &&
      interactive !== current_toc_li &&
      current_toc_li.contains(interactive)
    )
  }

  const href_for_id = (id: string | undefined) =>
    id ? `#${encodeURIComponent(id)}` : undefined

  function activate_heading(node: HTMLHeadingElement, idx = headings.indexOf(node)) {
    if (idx === -1) return
    activeHeading = node
    activeTocLi = tocItems[idx]
    scroll_target = node
    prev_scroll_target_distance = Infinity
    if (scroll_target_timeout) clearTimeout(scroll_target_timeout)
    scroll_target_timeout = setTimeout(clear_scroll_target, scroll_target_fallback_ms)
    node.scrollIntoView?.({ behavior: scrollBehavior, block: `start` })

    // use the raw id as the URL fragment so it matches the DOM id exactly. encodeURIComponent
    // (used for the <a href> attribute) would emit e.g. #sec%3A1 for id="sec:1", which only
    // resolves via the browser's percent-decode fallback rather than matching directly.
    const id = heading_data[idx]?.id
    if (id) history.replaceState({}, ``, `#${id}`)

    if (flash_duration_ms) {
      node.classList.add(`toc-clicked`)
      setTimeout(() => node.classList.remove(`toc-clicked`), flash_duration_ms)
    }
  }

  type SelectorName = `headingSelector` | `excludeSelector` | `hideOnIntersect`

  function selector_is_valid(selector_name: SelectorName, selector: string) {
    if (selector_name === `excludeSelector` && selector === ``) return true

    const key = `${selector_name}:${selector}`
    if (key in selector_validity) return selector_validity[key]
    try {
      document.querySelector(selector)
      selector_validity[key] = true
    } catch {
      const fallback =
        selector_name === `hideOnIntersect`
          ? `Ignoring selector.`
          : `Showing empty table of contents.`
      console.warn(`Toc received invalid ${selector_name}='${selector}'. ${fallback}`)
      selector_validity[key] = false
    }
    return selector_validity[key]
  }

  function query_toc_headings() {
    if (
      !selector_is_valid(`headingSelector`, headingSelector) ||
      !selector_is_valid(`excludeSelector`, excludeSelector)
    )
      return null

    return Array.from(
      document.querySelectorAll<HTMLHeadingElement>(headingSelector),
    ).filter(
      (heading) =>
        !heading.closest(`aside.toc`) &&
        (!excludeSelector || !heading.closest(excludeSelector)),
    )
  }

  const element_matches_heading_selector = (element: Element | null) =>
    element !== null &&
    selector_is_valid(`headingSelector`, headingSelector) &&
    element.closest(headingSelector) !== null

  const should_update_for_mutations = (records: MutationRecord[]) =>
    records.some((record) => {
      if (record.type === `childList`) return true
      if (record.type === `characterData`) {
        return element_matches_heading_selector(record.target.parentElement)
      }
      if (record.type !== `attributes` || !(record.target instanceof Element))
        return false
      const target = record.target
      if (target === document.body) return false
      return (
        selector_is_valid(`headingSelector`, headingSelector) &&
        (target.closest(headingSelector) !== null ||
          target.querySelector(headingSelector) !== null ||
          headings.some((heading) => target.contains(heading)))
      )
    })

  function normalize_heading_data(
    heading: HTMLHeadingElement,
    data: TocHeadingData,
    idx: number,
    get_used_ids: () => Set<string>,
  ): TocHeadingData {
    if (heading.id) return data.id === heading.id ? data : { ...data, id: heading.id }

    if (!autoIds) return data

    const used_ids = get_used_ids()
    const id = unique_heading_id(data.id || slugifyHeading(heading, idx), used_ids)
    heading.id = id
    return { ...data, id }
  }

  // (re-)query headings on mount and on route changes
  function update_toc_headings() {
    // guards the async MutationObserver callback firing after document teardown
    if (typeof document === `undefined`) return

    const queried_headings = query_toc_headings()
    const invalid_selector = queried_headings === null
    let used_ids: Set<string> | undefined
    const get_used_ids = () =>
      (used_ids ??= new Set(
        Array.from(document.querySelectorAll<HTMLElement>(`[id]`), ({ id }) => id),
      ))
    const heading_entries: { data: TocHeadingData; heading: HTMLHeadingElement }[] = []
    for (const [idx, heading] of (queried_headings ?? []).entries()) {
      const heading_meta = getHeadingData(heading)
      if (heading_meta === null) continue
      heading_entries.push({
        data: normalize_heading_data(heading, heading_meta, idx, get_used_ids),
        heading,
      })
    }

    // Use untrack to avoid creating dependencies on the state we're about to modify
    untrack(() => {
      // skip state churn when an unrelated DOM mutation left the heading set unchanged.
      // this must also hold for the empty set, or every mutation on a heading-less page
      // re-runs the whole rebuild and repeats the warnOnEmpty warning.
      const unchanged =
        headings_initialized &&
        heading_entries.length === headings.length &&
        heading_entries.every(
          ({ heading, data }, idx) =>
            heading === headings[idx] &&
            data.id === heading_data[idx]?.id &&
            data.level === heading_data[idx]?.level &&
            data.title === heading_data[idx]?.title,
        )
      if (unchanged) return
      headings_initialized = true

      headings = heading_entries.map(({ heading }) => heading)
      heading_data = heading_entries.map(({ data }) => data)
      if (scroll_target && !headings.includes(scroll_target)) clear_scroll_target()
      if (headings.length === 0) {
        activeHeading = null
        activeTocLi = null
        if (warnOnEmpty && !invalid_selector) {
          const exclude_msg = excludeSelector
            ? ` after applying excludeSelector='${excludeSelector}'`
            : ``
          console.warn(
            `Toc found no headings for headingSelector='${headingSelector}'${exclude_msg}. ${
              autoHide ? `Hiding` : `Showing empty`
            } table of contents.`,
          )
        }
        if (autoHide) hide = true
      } else {
        set_active_heading()
        if (hide && autoHide) hide = false
      }
    })
  }

  $effect(update_toc_headings)

  let toc_item_has_interactive = $derived(
    tocItem
      ? tocItems.map((toc_item) => Boolean(first_custom_interactive(toc_item)))
      : [],
  )

  $effect(() => {
    const observer = new MutationObserver((records) => {
      if (should_update_for_mutations(records)) update_toc_headings()
    })

    // Attribute changes can affect headingSelector/excludeSelector membership.
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true, // Watch text changes inside existing headings
      subtree: true, // Watch all descendants, not just direct children
    })

    return () => observer.disconnect()
  })

  // clear_scroll_target writes component state, so a pending fallback must not outlive
  // the component. The flash timer only strips a class off a detached node, so it can run.
  $effect(() => () => {
    if (scroll_target_timeout) clearTimeout(scroll_target_timeout)
  })

  function set_active_heading() {
    // if we're in a programmatic scroll (click/keyboard initiated), keep the target active
    // until scrollend fires to prevent highlighting intermediate headings during smooth scroll
    if (scroll_target && !headings.includes(scroll_target)) clear_scroll_target()
    if (scroll_target) {
      // detect if user manually scrolled away from scroll_target by checking if distance
      // is increasing (user scrolling away) rather than decreasing (smooth scroll in progress)
      const distance = Math.abs(
        scroll_target.getBoundingClientRect().top - activeHeadingScrollOffset,
      )
      // a large enough increase detects manual scroll while tolerating scroll jitter
      if (distance > prev_scroll_target_distance + manual_scroll_threshold_px) {
        // user manually scrolled away from target, clear and allow normal detection
        clear_scroll_target()
      } else {
        // smooth scroll still in progress (distance decreasing or stable), keep target active
        prev_scroll_target_distance = distance
        return
      }
    }

    let idx = headings.length
    while (idx--) {
      const { top } = headings[idx].getBoundingClientRect()

      // loop through headings from last to first until we find one that the viewport already
      // scrolled past. if none is found, set make first heading active
      if (top < activeHeadingScrollOffset || idx === 0) {
        activeHeading = headings[idx]
        activeTocLi = tocItems[idx]
        return // exit while loop if updated active heading
      }
    }
  }

  // check if TOC overlaps with any hideOnIntersect elements (desktop only)
  function check_toc_overlap() {
    if (!hideOnIntersect || !aside || !desktop) {
      is_overlapping_hide_target = false
      return
    }

    const toc = aside.getBoundingClientRect()
    is_overlapping_hide_target = hide_on_intersect_elements().some((element) => {
      const rect = element.getBoundingClientRect()
      return !(
        toc.right < rect.left ||
        toc.left > rect.right ||
        toc.bottom < rect.top ||
        toc.top > rect.bottom
      )
    })
  }

  function hide_on_intersect_elements() {
    if (!hideOnIntersect) return []
    if (typeof hideOnIntersect !== `string`) return hideOnIntersect
    return selector_is_valid(`hideOnIntersect`, hideOnIntersect)
      ? Array.from(document.querySelectorAll<HTMLElement>(hideOnIntersect))
      : []
  }

  // click and key handler for ToC items that scrolls to the heading
  const li_click_key_handler = (node: HTMLHeadingElement) => (event: LiEvent) => {
    if (event instanceof KeyboardEvent) liProps.onkeydown?.(event)
    else liProps.onclick?.(event)
    if (event.defaultPrevented) return
    if (event_targets_custom_interactive(event)) return
    if (event instanceof MouseEvent && is_modified_click(event)) return
    if (event instanceof KeyboardEvent && !is_activation_key(event.key)) {
      return
    }
    const idx = headings.indexOf(node)
    if (idx === -1) return
    event.preventDefault()
    set_open(false, `toc-item`)
    activate_heading(node, idx)
  }

  function scroll_to_active_toc_item(behavior: `auto` | `smooth` | `instant` = `smooth`) {
    if (keepActiveTocItemInView && activeTocLi && nav) {
      // scroll the active ToC item into the middle of the ToC container
      const top = activeTocLi.offsetTop - nav.offsetHeight / 2
      nav.scrollTo?.({ top, behavior })
    }
  }

  // ensure active ToC is in view when ToC opens on mobile. untracked because both calls
  // read (and set_active_heading writes) activeTocLi: tracking it would re-run this on
  // every arrow-key move and snap the selection straight back to the scroll position.
  $effect(() => {
    if (!open || !nav) return
    untrack(() => {
      set_active_heading()
      scroll_to_active_toc_item(`instant`)
    })
  })

  // enable keyboard navigation
  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (!reactToKeys || !reactToKeys.includes(event.key)) return

    // `:hover`.at(-1) returns the most deeply nested hovered element
    const hovered = [...document.querySelectorAll(`:hover`)].at(-1)
    const toc_is_hovered = hovered && nav?.contains(hovered)
    const toc_has_focus = nav?.contains(document.activeElement)
    const is_open = last_reported_open ?? open

    if (
      // ignore keyboard events when ToC is closed on mobile or inactive on desktop
      (!desktop && !is_open) ||
      (desktop && !toc_is_hovered && !toc_has_focus)
    )
      return

    if (event.key === `Tab`) {
      if (toc_has_focus) set_open(false, `tab`)
      return
    }
    if (is_activation_key(event.key) && focus_is_in_custom_interactive_toc_item()) {
      return
    }

    if (event.key === `Escape`) {
      // nothing to close on desktop, so leave the key to e.g. an open dialog
      if (!is_open) return
      event.preventDefault()
      set_open(false, `escape`)
      return
    }
    event.preventDefault()
    const current_toc_li = activeTocLi ?? nav?.querySelector<HTMLLIElement>(`li.active`)

    if (current_toc_li) {
      const sibling_prop =
        event.key === `ArrowDown`
          ? `nextElementSibling`
          : event.key === `ArrowUp`
            ? `previousElementSibling`
            : null
      activeTocLi = sibling_prop
        ? (visible_toc_sibling(current_toc_li, sibling_prop) ?? current_toc_li)
        : current_toc_li
      // move DOM focus onto the navigated item so the focused link's own keydown handler
      // can't override arrow-navigation on the next Enter/Space (tab->arrow->Enter)
      if (sibling_prop) focus_toc_item(activeTocLi)
      // update active heading
      activeHeading = headings[tocItems.indexOf(activeTocLi)]
    }
    if (activeTocLi && is_activation_key(event.key) && activeHeading) {
      activate_heading(activeHeading)
    }
  }

  function on_scroll() {
    page_has_scrolled = true
    set_active_heading()
    check_toc_overlap()
  }

  function on_scrollend() {
    clear_scroll_target()
    if (!page_has_scrolled) return
    // wait for scroll end since Chrome doesn't support multiple simultaneous scrolls,
    // smooth or otherwise (https://stackoverflow.com/a/63563437)
    scroll_to_active_toc_item()
  }

  function on_resize() {
    desktop = window_width > breakpoint
    set_active_heading()
    check_toc_overlap()
  }
</script>

<svelte:window
  bind:innerWidth={window_width}
  onscroll={on_scroll}
  onclick={close}
  onscrollend={on_scrollend}
  onresize={on_resize}
  onkeydown={on_keydown}
/>

<aside
  {...asideProps}
  class={[`toc`, asideProps.class]}
  class:collapsible={collapse_mode}
  class:desktop
  class:hidden={hide}
  class:intersecting={is_overlapping_hide_target}
  class:mobile={!desktop}
  bind:this={aside}
  hidden={hide}
  aria-hidden={hide || is_overlapping_hide_target}
  {@attach (node) => {
    // while intersecting the aside is only opacity: 0, so without inert it stays in the
    // tab order while aria-hidden tells assistive tech it is gone
    node.toggleAttribute(`inert`, is_overlapping_hide_target)
  }}
>
  {#if !open && !desktop && headings.length >= minItems}
    <button
      {...openButtonProps}
      onclick={(event) => {
        openButtonProps.onclick?.(event)
        if (event.defaultPrevented) return
        event.stopPropagation()
        event.preventDefault()
        set_open(true, `button`)
      }}
      type="button"
      aria-label={openButtonLabel}
    >
      {#if openTocIcon}{@render openTocIcon()}{:else}
        <!-- https://iconify.design/icon-sets/heroicons-solid/menu.html -->
        <svg width="1em" {...openButtonIconProps} viewBox="0 0 20 20" fill="currentColor">
          <path
            d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z"
          />
        </svg>
      {/if}
    </button>
  {/if}
  {#if open || (desktop && headings.length >= minItems)}
    <nav
      {...navProps}
      transition:blur={blurParams === null ? { duration: 0 } : blurParams}
      bind:this={nav}
    >
      {#if titleSnippet}
        {@render titleSnippet()}
      {:else if title}
        <h2 {...titleProps} class={[`toc-title`, `toc-exclude`, titleProps.class]}>
          {title}
        </h2>
      {/if}
      <ol {...olProps}>
        {#each headings as heading, idx (`${idx}-${heading.id}`)}
          {@const indent = levels[idx] - min_level}
          {@const collapsed = collapse_mode && !heading_visibility[idx]}
          {@const heading_id = heading_data[idx]?.id}
          {@const is_active = heading === activeHeading}
          {@const item_tabindex = collapsed ? -1 : 0}
          {@const use_fallback_toc_item =
            tocItem && toc_item_has_interactive[idx] === false}
          {@const item_margin_left = `calc(${indent} * var(--toc-indent-per-level, 1em))`}
          {@const item_font_size = `max(var(--toc-li-font-size-min, 2ex), calc(var(--toc-li-font-size-base, 3ex) - ${indent} * var(--toc-li-font-size-step, 0.1ex)))`}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex - fallback for custom tocItem snippets without their own focusable element -->
          <li
            {...liProps}
            class:active={is_active}
            class:collapsed
            aria-hidden={collapsed || undefined}
            aria-current={tocItem && is_active ? `location` : undefined}
            bind:this={tocItems[idx]}
            role={use_fallback_toc_item ? `link` : undefined}
            tabindex={use_fallback_toc_item ? item_tabindex : undefined}
            style:margin-left={item_margin_left}
            style:font-size={item_font_size}
            onclick={li_click_key_handler(heading)}
            onkeydown={li_click_key_handler(heading)}
          >
            {#if tocItem}
              {@render tocItem(heading)}
            {:else}
              <a
                href={href_for_id(heading_id)}
                tabindex={item_tabindex}
                aria-current={is_active ? `location` : undefined}
              >
                {heading_data[idx]?.title}
              </a>
            {/if}
          </li>
        {/each}
      </ol>
    </nav>
  {/if}
</aside>

<style>
  :where(aside.toc) {
    box-sizing: border-box;
    height: max-content;
    overflow-wrap: break-word;
    font-size: var(--toc-font-size, 0.7em);
    min-width: var(--toc-min-width, 15em);
    width: var(--toc-width);
    z-index: var(--toc-z-index);
    text-wrap: var(--toc-text-wrap, balance);
    transition: opacity 0.15s;
  }
  :where(aside.toc > nav) {
    overflow: var(--toc-overflow, auto);
    overscroll-behavior: contain;
    max-height: var(--toc-max-height, 90vh);
    padding: var(--toc-padding, 1em 1em 0 3em);
    position: relative;
  }
  aside.toc > nav > ol {
    list-style: var(--toc-ol-list-style, none);
    padding: var(--toc-ol-padding, 0);
    margin: var(--toc-ol-margin);
  }
  :where(aside.toc .toc-title) {
    padding: var(--toc-title-padding);
    margin: var(--toc-title-margin, 1em 0);
    font-size: var(--toc-title-font-size, initial);
    color: var(--toc-title-color);
    font-weight: var(--toc-title-font-weight);
  }
  :where(aside.toc > nav > ol > li) {
    cursor: pointer;
    color: var(--toc-li-color);
    background: var(--toc-li-bg);
    border: var(--toc-li-border);
    border-radius: var(--toc-li-border-radius);
    margin: var(--toc-li-margin);
    padding: var(--toc-li-padding, 2pt 4pt);
    font: var(--toc-li-font);
    transition: var(--toc-li-transition);
  }
  :where(aside.toc > nav > ol > li > a) {
    color: inherit;
    display: block;
    text-decoration: none;
  }
  :is(
    aside.toc > nav > ol > li:focus-visible,
    aside.toc > nav > ol > li > a:focus-visible
  ) {
    outline: var(--toc-focus-outline, 2px solid currentColor);
    outline-offset: var(--toc-focus-outline-offset, 1px);
  }
  aside.toc.collapsible > nav > ol > li {
    max-height: var(--toc-li-max-height, 10em);
    overflow: hidden;
    transition:
      max-height var(--toc-collapse-duration, 0.2s) ease-out,
      opacity var(--toc-collapse-duration, 0.2s) ease-out,
      padding var(--toc-collapse-duration, 0.2s) ease-out,
      margin var(--toc-collapse-duration, 0.2s) ease-out;
  }
  aside.toc.collapsible > nav > ol > li.collapsed {
    max-height: 0;
    opacity: 0;
    padding-block: 0;
    margin-block: 0;
  }
  aside.toc > nav > ol > li:hover {
    color: var(--toc-li-hover-color);
    background: var(--toc-li-hover-bg);
  }
  aside.toc > nav > ol > li.active {
    background: var(--toc-active-bg);
    color: var(--toc-active-color);
    font: var(--toc-active-li-font);
    text-shadow: var(--toc-active-text-shadow);
    border: var(--toc-active-border);
    border-width: var(--toc-active-border-width);
    border-radius: var(--toc-active-border-radius, 2pt);
  }
  :where(aside.toc > button) {
    border: none;
    bottom: var(--toc-mobile-btn-bottom, 0);
    cursor: pointer;
    font: var(--toc-mobile-btn-font, 2em sans-serif);
    line-height: var(--toc-mobile-btn-line-height, 0);
    position: absolute;
    right: var(--toc-mobile-btn-right, 0);
    z-index: var(--toc-mobile-btn-z-index, 2);
    padding: var(--toc-mobile-btn-padding, 2pt 3pt);
    border-radius: var(--toc-mobile-btn-border-radius, 4pt);
    background: var(--toc-mobile-btn-bg, rgba(255, 255, 255, 0.2));
    color: var(--toc-mobile-btn-color, black);
  }
  :where(aside.toc > nav > .toc-title) {
    margin-top: var(--toc-title-margin-top, 0);
  }
  aside.toc.mobile {
    position: fixed;
    bottom: var(--toc-mobile-bottom, 1em);
    right: var(--toc-mobile-right, 1em);
  }
  aside.toc.mobile > nav {
    border-radius: var(--toc-mobile-border-radius, 3pt);
    right: var(--toc-mobile-right, 1em);
    z-index: -1;
    box-sizing: border-box;
    background: var(--toc-mobile-bg, white);
    width: var(--toc-mobile-width, 18em);
    box-shadow: var(--toc-mobile-shadow);
    border: var(--toc-mobile-border);
  }
  aside.toc.desktop {
    position: sticky;
    background: var(--toc-desktop-bg);
    margin: var(--toc-desktop-aside-margin);
    max-width: var(--toc-desktop-max-width);
    top: var(--toc-desktop-sticky-top, 2em);
  }

  aside.toc.desktop > nav {
    margin: var(--toc-desktop-nav-margin);
  }
  aside.toc.intersecting {
    opacity: 0;
    pointer-events: none;
  }
</style>
