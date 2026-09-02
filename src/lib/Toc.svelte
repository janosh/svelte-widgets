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
  import {
    document_used_ids,
    slugify_heading,
    unique_heading_id,
  } from './heading-anchors'
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
    closeButtonLabel = `Close table of contents`,
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
    // the toggle stays put and becomes a close button while the panel is open, so it needs
    // a second name — same shape as Nav's burger, which is the other pinned mobile toggle
    closeButtonLabel?: string
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

  // An indented bullet list, not a burger: the burger is Nav's, and two identical glyphs
  // pinned to the same phone screen say nothing about which one opens what. Three rows at
  // two indent levels is what a table of contents looks like.
  // The list glyph's viewBox is cropped to its own path bounds so it renders at the button's
  // full width, like the burger's bars do. The X keeps a roomier box: Nav folds its bars into
  // an X spanning ~17.9px, and one drawn edge to edge across the same 22.4px button would be
  // the larger of the two close buttons on a page showing both. Each stroke-width is the one
  // that lands on Nav's 0.18rem bars once its own box is scaled to the button.
  const TOGGLE_ICONS = {
    closed: {
      view_box: `1.9 3.9 16.2 12.2`,
      stroke_width: 2.1,
      path: `M3 5h.01M7 5h10M6 10h.01M10 10h7M6 15h.01M10 15h7`,
    },
    open: { view_box: `2.5 2.5 15 15`, stroke_width: 1.95, path: `M5 5l10 10M15 5L5 15` },
  }
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

  // A childList record used to short-circuit to `true`, so every DOM insertion anywhere in
  // the document — a toast, a tooltip, a dropdown, a virtualized editor row scrolling past —
  // re-queried every heading in the document. Only nodes that are or contain a heading can
  // change the result.
  // NodeList is iterable, so this stays allocation-free on the mutation path
  const some_element = (nodes: NodeList, match: (node: Element) => boolean): boolean => {
    for (const node of nodes) if (node instanceof Element && match(node)) return true
    return false
  }
  const childlist_touches_headings = (record: MutationRecord): boolean => {
    if (!selector_is_valid(`headingSelector`, headingSelector)) return false
    const { target } = record
    // `heading.textContent = '…'` swaps a text node, so neither node list holds an Element,
    // but the record targets the heading itself
    if (target instanceof Element && element_matches_heading_selector(target)) return true
    return (
      some_element(
        record.addedNodes,
        (node) =>
          node.matches(headingSelector) || Boolean(node.querySelector(headingSelector)),
      ) ||
      // a removed node is detached, so `main > h2` can no longer match it — compare
      // against the headings currently held instead
      some_element(record.removedNodes, (node) =>
        headings.some((heading) => node === heading || node.contains(heading)),
      )
    )
  }

  const should_update_for_mutations = (records: MutationRecord[]) =>
    records.some((record) => {
      if (record.type === `childList`) return childlist_touches_headings(record)
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
    const get_used_ids = document_used_ids()
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
      // scroll the active ToC item into the middle of the ToC container. offsetTop and
      // scrollTop both count from the padding box, so the height to halve is the
      // scrollport's (clientHeight), not the border box's.
      const top = activeTocLi.offsetTop - nav.clientHeight / 2
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
  <!-- The toggle stays mounted while open and becomes the close button, matching Nav's
  burger. Unmounting it left the panel with no visible way out — only an outside click,
  Escape or a tab-out, none of which a touch user can see. -->
  {#if !desktop && headings.length >= minItems}
    <button
      {...openButtonProps}
      onclick={(event) => {
        openButtonProps.onclick?.(event)
        if (event.defaultPrevented) return
        event.stopPropagation()
        event.preventDefault()
        set_open(!open, `button`)
      }}
      type="button"
      aria-expanded={open}
      aria-label={open ? closeButtonLabel : openButtonLabel}
    >
      {#if openTocIcon}{@render openTocIcon()}{:else}
        <!-- Both glyphs stay mounted and cross-fade, so the toggle animates on open/close
        the way Nav's burger morphs into its X instead of swapping in one frame. -->
        {#each Object.entries(TOGGLE_ICONS) as [state, icon] (state)}
          <svg
            width="1em"
            height="1em"
            {...openButtonIconProps}
            viewBox={icon.view_box}
            fill="none"
            stroke="currentColor"
            stroke-width={icon.stroke_width}
            stroke-linecap="round"
            stroke-linejoin="round"
            class:shown={open === (state === `open`)}
            aria-hidden="true"
          >
            <path d={icon.path} />
          </svg>
        {/each}
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
    /* A ToC row and a Nav row are the same thing to a reader — a link that lights up under
       the pointer — so they share one hover language: Nav's --nav-link-bg-hover colour, its
       --nav-border-radius and its 0.2s background fade. These are the fallbacks behind the
       public --toc-li-* tokens, which still win. */
    --toc-item-hover-bg: light-dark(rgba(70, 70, 140, 0.2), rgba(120, 170, 255, 0.2));
    --toc-item-radius: 3pt;
    /* shared by the mobile panel and its toggle so the two read as one surface. Values match
       Nav's --nav-surface-* so a page showing both toggles gets one visual language. */
    --toc-surface-border: 1px solid
      light-dark(rgba(128, 128, 128, 0.25), rgba(200, 200, 200, 0.2));
    --toc-surface-shadow: light-dark(
      0 2px 8px rgba(0, 0, 0, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.5)
    );
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
    border-radius: var(--toc-li-border-radius, var(--toc-item-radius));
    margin: var(--toc-li-margin);
    padding: var(--toc-li-padding, 2pt 4pt);
    font: var(--toc-li-font);
    transition: var(--toc-li-transition, background-color 0.2s);
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
  aside.toc > nav > ol > li.active {
    background: var(--toc-active-bg);
    color: var(--toc-active-color);
    font: var(--toc-active-li-font);
    text-shadow: var(--toc-active-text-shadow);
    border: var(--toc-active-border);
    border-width: var(--toc-active-border-width);
    border-radius: var(--toc-active-border-radius, var(--toc-item-radius));
  }
  /* After `.active`, not before: the two selectors have equal specificity, so source order
     decides, and the active row is the one most likely to be hovered. Nav's active row keeps
     its hover fill too (there, active is a text colour), and an unset --toc-active-bg made
     `background` invalid on that row, which swallowed the hover fill entirely. */
  aside.toc > nav > ol > li:hover {
    color: var(--toc-li-hover-color);
    background: var(--toc-li-hover-bg, var(--toc-item-hover-bg));
  }
  /* Cosmetics stay in `:where()` so a host can restyle the toggle without fighting
     specificity. Its box does not: see the structural rule below. */
  :where(aside.toc > button) {
    cursor: pointer;
    font: var(--toc-mobile-btn-font, 1.4rem sans-serif);
    line-height: var(--toc-mobile-btn-line-height, 0);
    /* relative, not absolute: the aside lays both children out now, but these two vars are
       public and still have to be able to nudge the toggle off its flex slot */
    position: relative;
    bottom: var(--toc-mobile-btn-bottom, 0);
    right: var(--toc-mobile-btn-right, 0);
    z-index: var(--toc-mobile-btn-z-index, 2);
    border: var(--toc-mobile-btn-border, var(--toc-surface-border));
    border-radius: var(--toc-mobile-btn-border-radius, 6pt);
    background: var(--toc-mobile-btn-bg, var(--toc-mobile-bg, rgba(255, 255, 255, 0.2)));
    color: var(--toc-mobile-btn-color, var(--text, black));
    box-shadow: var(--toc-mobile-btn-shadow, var(--toc-surface-shadow));
  }
  /* A 1.4rem glyph in a 0.3rem-padded box, matching Nav's burger: the two are the only pinned
     mobile toggles a page has, and at different sizes they read as unrelated chrome. Not
     `:where()`, for the same reason as the `ol` rule below — a host `button { padding }` reset
     outweighs a zero-specificity selector and silently resized the hit target. Tune it with
     --toc-mobile-btn-padding / --toc-mobile-btn-font, which still win. */
  aside.toc > button {
    display: grid;
    place-items: center;
    box-sizing: content-box;
    /* 1em so the box tracks --toc-mobile-btn-font, which the icon already sizes itself from */
    width: 1em;
    height: 1em;
    padding: var(--toc-mobile-btn-padding, 0.3rem);
  }
  /* Both glyphs share the single grid cell and swap by opacity + quarter turn, matching the
     0.2s linear the burger's bars use to fold into their X. */
  aside.toc > button > svg {
    grid-area: 1 / 1;
    opacity: 0;
    transform: rotate(-90deg) scale(0.7);
    transition:
      opacity var(--toc-mobile-btn-transition-duration, 0.2s) linear,
      transform var(--toc-mobile-btn-transition-duration, 0.2s) linear;
  }
  aside.toc > button > svg.shown {
    opacity: 1;
    transform: none;
  }
  :where(aside.toc > nav > .toc-title) {
    margin-top: var(--toc-title-margin-top, 0);
  }
  /* column-reverse against the DOM order [button, nav] keeps the toggle pinned in the corner
     and opens the panel upward above it. Both children used to be absolutely positioned off
     this zero-size anchor, which stacked them on top of each other once the toggle stopped
     unmounting on open. */
  aside.toc.mobile {
    position: fixed;
    bottom: var(--toc-mobile-bottom, 1em);
    right: var(--toc-mobile-right, 1em);
    display: flex;
    flex-direction: column-reverse;
    align-items: end;
    gap: var(--toc-mobile-gap, 0.5em);
    /* override the desktop --toc-width the base rule applies: on mobile the aside is just a
       corner anchor and has to size to whichever of the panel or the toggle is wider */
    width: max-content;
    /* a long page's toc outgrows a phone screen, and a fixed panel can't scroll with the
       document, so cap the whole stack against the viewport and let the panel scroll inside */
    max-height: calc(100dvh - 2 * var(--toc-mobile-bottom, 1em));
    max-width: calc(100dvw - 2 * var(--toc-mobile-right, 1em));
  }
  aside.toc.mobile > nav {
    /* the desktop 3em inset makes room for the sticky column's left gutter; in a floating
       panel it is just a blank band down the left of every entry */
    padding: var(--toc-mobile-padding, 0.5em 1em 1em);
    border-radius: var(--toc-mobile-border-radius, 6pt);
    box-sizing: border-box;
    background: var(--toc-mobile-bg, white);
    width: var(--toc-mobile-width, 18em);
    max-width: 100%;
    /* flex items floor at their content height without this, so a tall toc would push the
       toggle off the bottom of the screen instead of scrolling */
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    z-index: var(--toc-mobile-z-index, 2);
    box-shadow: var(--toc-mobile-shadow, var(--toc-surface-shadow));
    border: var(--toc-mobile-border, var(--toc-surface-border));
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
