<script lang="ts">
  import type { Snippet } from 'svelte'
  import { untrack } from 'svelte'
  import type { SVGAttributes, SvelteHTMLElements } from 'svelte/elements'
  import { blur, type BlurParams } from 'svelte/transition'
  import type {
    CollapseMode,
    OpenChangeHandler,
    OpenChangeTrigger,
    TocHeadingData,
  } from './types'
  import { flash_toc_target, get_heading_visibility } from './toc-utils'
  import { is_editable_event_target } from './utils'
  import { override_style } from './attachments/shared'

  let {
    active_heading = $bindable(null),
    active_heading_scroll_offset = 100,
    active_toc_li = $bindable(null),
    aside = $bindable(),
    breakpoint = 1000,
    desktop = $bindable(true),
    flash_clicked_headings_for_ms: flash_duration_ms = 1500,
    get_heading_data = (node: HTMLHeadingElement): TocHeadingData => ({
      id: node.id,
      level: Number(node.nodeName[1]),
      title: node.textContent ?? ``,
    }),
    headings = $bindable([]),
    heading_selector = `:is(h2, h3, h4)`,
    exclude_selector = `.toc-exclude`,
    hide = $bindable(false),
    hide_on_intersect = null,
    items,
    dynamic = false,
    auto_hide = true,
    keep_active_toc_item_in_view = true,
    min_items = 0,
    nav = $bindable(),
    open = $bindable(false),
    open_button_label = `Open table of contents`,
    close_button_label = `Close table of contents`,
    react_to_keys = [`ArrowDown`, `ArrowUp`, ` `, `Enter`, `Escape`, `Tab`],
    scroll_behavior = `smooth`,
    title = `On this page`,
    toc_items = $bindable([]),
    warn_on_empty = false,
    collapse_subheadings = false,
    blur_params = { duration: 200 },
    open_toc_icon,
    title_snippet,
    toc_item,
    footer,
    on_open_change,
    aside_props = {},
    nav_props = {},
    title_props = {},
    ol_props = {},
    li_props = {},
    open_button_props = {},
    open_button_icon_props = {},
  }: {
    active_heading?: HTMLHeadingElement | null
    active_heading_scroll_offset?: number
    active_toc_li?: HTMLLIElement | null
    aside?: HTMLElement | undefined
    breakpoint?: number // px window width below which the ToC switches to mobile
    desktop?: boolean
    flash_clicked_headings_for_ms?: number
    get_heading_data?: (node: HTMLHeadingElement) => TocHeadingData | null
    // the querySelectorAll(heading_selector) result, exposed for binding
    headings?: HTMLHeadingElement[]
    heading_selector?: string
    exclude_selector?: string
    hide?: boolean
    hide_on_intersect?: string | HTMLElement[] | null
    // Static heading metadata renders links on the server; DOM IDs remain authoritative.
    items?: readonly TocHeadingData[]
    // Observe headings added, removed, or changed after mount.
    dynamic?: boolean
    auto_hide?: boolean
    keep_active_toc_item_in_view?: boolean // requires scrollend event browser support
    min_items?: number
    nav?: HTMLElement | undefined
    open?: boolean
    open_button_label?: string
    // the toggle stays put and becomes the close button while open, so it needs a second name
    close_button_label?: string
    react_to_keys?: false | string[]
    scroll_behavior?: `auto` | `smooth`
    title?: string
    toc_items?: HTMLLIElement[]
    warn_on_empty?: boolean
    // collapse subheadings under inactive parents. true = every level collapses
    // independently; 'h3' = deepest collapsing level, h4+ expand with their h3 ancestor
    collapse_subheadings?: CollapseMode
    blur_params?: BlurParams | null | undefined
    open_toc_icon?: Snippet
    title_snippet?: Snippet
    toc_item?: Snippet<[TocHeadingData]>
    // Supplemental navigation inside the same desktop/mobile panel.
    footer?: Snippet
    on_open_change?: OpenChangeHandler
    aside_props?: SvelteHTMLElements[`aside`]
    nav_props?: SvelteHTMLElements[`nav`]
    title_props?: SvelteHTMLElements[`h2`]
    ol_props?: SvelteHTMLElements[`ol`]
    li_props?: SvelteHTMLElements[`li`]
    open_button_props?: SvelteHTMLElements[`button`]
    open_button_icon_props?: SVGAttributes<SVGSVGElement>
  } = $props()

  // Distinguish the TOC from Nav's burger; cropped viewBoxes align their visual weight.
  const TOGGLE_ICONS = {
    closed: {
      view_box: `1.9 3.9 16.2 12.2`,
      stroke_width: 2.1,
      path: `M3 5.5h.01M7 5.5h10M6 10h.01M10 10h7M6 14.5h.01M10 14.5h7`,
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
  // ignores spurious scrollend events chrome fires on page load before any real scrolling
  // see https://github.com/janosh/svelte-toc/issues/57
  let page_has_scrolled: boolean = $state(false)
  // desktop only
  let is_overlapping_hide_target: boolean = $state(false)
  // target of a programmatic scroll; keeps scroll events from moving active_heading to
  // intermediate headings while a smooth scroll is under way
  let scroll_target: HTMLHeadingElement | null = $state(null)
  let scroll_target_timeout: ReturnType<typeof setTimeout> | null = null
  // Infinity so the first scroll event always passes the "distance increasing" check
  let prev_scroll_target_distance: number = Infinity
  let last_reported_open: boolean | undefined = undefined
  let discovered_items: TocHeadingData[] = $state([])
  const heading_data = $derived(items ?? discovered_items)
  // without this a heading-less page can't tell its first update_toc_headings pass apart
  // from "nothing changed": both compare an empty query result against an empty headings
  let headings_initialized = false

  function clear_scroll_target() {
    restore_scroll_behavior?.()
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
    on_open_change?.({ open: value, desktop, trigger })
  }

  type LiEvent = (MouseEvent | KeyboardEvent) & {
    currentTarget: EventTarget & HTMLLIElement
  }

  function event_targets_custom_interactive(event: LiEvent) {
    if (!toc_item || !(event.target instanceof Element)) return false
    // only bypass scroll-to-heading for an interactive element nested *inside* the li;
    // the li's own fallback semantics must not count as custom content
    const interactive = event.target.closest(custom_interactive_selector)
    return interactive !== null && interactive !== event.currentTarget
  }

  const heading_index = (heading: HTMLHeadingElement) =>
    heading_data.findIndex(({ id }) => id === heading.id)

  let levels: number[] = $derived(heading_data.map(({ level }) => level))
  let min_level: number = $derived(levels.length ? Math.min(...levels) : 0)

  function get_collapse_threshold(mode: CollapseMode): number {
    if (mode === false) return Infinity
    if (mode === true) return 6
    if (/^h[2-6]$/u.test(mode)) return Number(mode[1])
    throw new Error(`Toc received invalid collapse_subheadings='${mode}'`)
  }

  // Infinity disables both the visibility calculation and the collapsible UI.
  let collapse_threshold = $derived(get_collapse_threshold(collapse_subheadings))
  let collapse_enabled = $derived(collapse_threshold !== Infinity)

  let heading_visibility: boolean[] = $derived.by(() => {
    const active_idx =
      collapse_enabled && active_heading ? heading_index(active_heading) : null
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
      on_open_change?.({ open: current_open, desktop, trigger: `programmatic` })
    })
  })

  $effect(() => {
    void headings // register as dependencies
    void hide_on_intersect
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
    if (!toc_item || !(document.activeElement instanceof HTMLElement)) return false
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

  let restore_scroll_behavior: (() => void) | undefined

  function activate_heading(node: HTMLHeadingElement, idx = heading_index(node)) {
    if (idx === -1) return
    active_heading = node
    active_toc_li = toc_items[idx]
    scroll_target = node
    prev_scroll_target_distance = Infinity
    if (scroll_target_timeout) clearTimeout(scroll_target_timeout)
    scroll_target_timeout = setTimeout(clear_scroll_target, scroll_target_fallback_ms)
    node.scrollIntoView?.({ behavior: scroll_behavior, block: `start` })

    // Keep root CSS until scrolling ends: browsers may start fragment scrolling after a frame.
    restore_scroll_behavior?.()
    restore_scroll_behavior = override_style(
      document.documentElement.style,
      `scroll-behavior`,
      scroll_behavior,
    )

    if (flash_duration_ms) flash_toc_target(node, flash_duration_ms)
  }

  function query_toc_headings() {
    if (items) {
      return items.flatMap(({ id }) => {
        // eslint-disable-next-line unicorn/prefer-query-selector -- IDs need not be valid CSS selectors.
        const heading = document.getElementById(id)
        return heading instanceof HTMLHeadingElement ? [heading] : []
      })
    }
    return Array.from(
      document.querySelectorAll<HTMLHeadingElement>(heading_selector),
    ).filter(
      (heading) =>
        heading.id &&
        !heading.closest(`aside.toc`) &&
        (!exclude_selector || !heading.closest(exclude_selector)),
    )
  }

  const element_matches_heading_selector = (element: Element | null) =>
    element !== null && element.closest(heading_selector) !== null

  // only nodes that are or contain a heading can change the result: short-circuiting every
  // childList record to `true` re-queried all headings on any DOM insertion (toast, tooltip,
  // virtualized row). NodeList is iterable, so this stays allocation-free.
  const some_element = (nodes: NodeList, match: (node: Element) => boolean): boolean => {
    for (const node of nodes) if (node instanceof Element && match(node)) return true
    return false
  }
  const childlist_touches_headings = (record: MutationRecord): boolean => {
    const { target } = record
    // `heading.textContent = '…'` swaps a text node: no Element in either node list, but
    // the record targets the heading itself
    if (target instanceof Element && element_matches_heading_selector(target)) return true
    return (
      some_element(
        record.addedNodes,
        (node) =>
          node.matches(heading_selector) || Boolean(node.querySelector(heading_selector)),
      ) ||
      // a removed node is detached, so `main > h2` can't match it — compare against the
      // headings currently held instead
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
        target.closest(heading_selector) !== null ||
        target.querySelector(heading_selector) !== null ||
        headings.some((heading) => target.contains(heading))
      )
    })

  // (re-)query headings on mount and on route changes
  function update_toc_headings() {
    // guards the async MutationObserver callback firing after document teardown
    if (typeof document === `undefined`) return

    const queried_headings = query_toc_headings()
    const heading_entries: { data: TocHeadingData; heading: HTMLHeadingElement }[] = []
    for (const heading of queried_headings) {
      const heading_meta = get_heading_data(heading)
      if (heading_meta === null) continue
      heading_entries.push({
        data: { ...heading_meta, id: heading.id },
        heading,
      })
    }

    // untrack: this writes the very state it would otherwise depend on
    untrack(() => {
      // skip state churn when an unrelated mutation left the heading set unchanged — the
      // empty set included, else every mutation on a heading-less page repeats warn_on_empty
      const unchanged =
        headings_initialized &&
        heading_entries.length === headings.length &&
        heading_entries.every(
          ({ heading, data }, idx) =>
            heading === headings[idx] &&
            data.id === discovered_items[idx]?.id &&
            data.level === discovered_items[idx]?.level &&
            data.title === discovered_items[idx]?.title,
        )
      if (unchanged) return
      headings_initialized = true

      headings = heading_entries.map(({ heading }) => heading)
      discovered_items = heading_entries.map(({ data }) => data)
      if (scroll_target && !headings.includes(scroll_target)) clear_scroll_target()
      if (headings.length === 0) {
        active_heading = null
        active_toc_li = null
        if (warn_on_empty) {
          const exclude_msg = exclude_selector
            ? ` after applying exclude_selector='${exclude_selector}'`
            : ``
          console.warn(
            `Toc found no headings for heading_selector='${heading_selector}'${exclude_msg}. ${
              auto_hide && !footer ? `Hiding` : `Showing`
            } table of contents.`,
          )
        }
      } else {
        set_active_heading()
      }
    })
  }

  $effect(() => {
    document.querySelector(heading_selector)
    if (exclude_selector) document.querySelector(exclude_selector)
    if (typeof hide_on_intersect === `string`) document.querySelector(hide_on_intersect)
    update_toc_headings()
  })
  $effect(() => {
    if (auto_hide) hide = heading_data.length === 0 && !footer
  })

  let toc_item_has_interactive = $derived(
    toc_item ? toc_items.map((item) => Boolean(first_custom_interactive(item))) : [],
  )

  $effect(() => {
    if (!dynamic) return
    const observer = new MutationObserver((records) => {
      if (should_update_for_mutations(records)) update_toc_headings()
    })

    // Attribute changes can affect heading_selector/exclude_selector membership.
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    })

    return () => observer.disconnect()
  })

  // clear_scroll_target writes component state, so its timer must not outlive the component.
  // The flash timer only strips a class off a detached node, so it can run.
  $effect(() => () => {
    restore_scroll_behavior?.()
    if (scroll_target_timeout) clearTimeout(scroll_target_timeout)
  })

  function set_active_heading() {
    // during a programmatic scroll keep the target active until scrollend, so intermediate
    // headings aren't highlighted on the way
    if (scroll_target && !headings.includes(scroll_target)) clear_scroll_target()
    if (scroll_target) {
      const distance = Math.abs(
        scroll_target.getBoundingClientRect().top - active_heading_scroll_offset,
      )
      // growing distance means the user scrolled away; the threshold tolerates jitter
      if (distance > prev_scroll_target_distance + manual_scroll_threshold_px) {
        clear_scroll_target()
      } else {
        prev_scroll_target_distance = distance
        return
      }
    }

    let idx = headings.length
    while (idx--) {
      const { top } = headings[idx].getBoundingClientRect()

      // last heading the viewport has scrolled past, else the first one
      if (top < active_heading_scroll_offset || idx === 0) {
        active_heading = headings[idx]
        active_toc_li = toc_items[heading_index(headings[idx])]
        return
      }
    }
  }

  function check_toc_overlap() {
    if (!hide_on_intersect || !aside || !desktop) {
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
    if (!hide_on_intersect) return []
    if (typeof hide_on_intersect !== `string`) return hide_on_intersect
    return Array.from(document.querySelectorAll<HTMLElement>(hide_on_intersect))
  }

  let forwarding_navigation = false
  // click/key handler on ToC items: scrolls to the heading
  const li_click_key_handler = (id: string) => (event: LiEvent) => {
    const node = headings.find((heading) => heading.id === id)
    if (!node) return
    if (forwarding_navigation) return
    if (event instanceof KeyboardEvent) li_props.onkeydown?.(event)
    else li_props.onclick?.(event)
    if (event.defaultPrevented) return
    if (event_targets_custom_interactive(event)) return
    if (event instanceof MouseEvent && is_modified_click(event)) return
    if (event instanceof KeyboardEvent && !is_activation_key(event.key)) {
      return
    }
    const idx = heading_index(node)
    if (idx === -1) return
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>(`a[href]`)
        : null
    if (event instanceof KeyboardEvent && link) {
      if (event.key === `Enter`) return // the browser clicks the focused anchor
      event.preventDefault()
      link.click() // Space activates that same anchor, preserving inherited options
      return
    }
    activate_heading(node, idx)
    if (!link) {
      event.preventDefault()
      // Reuse the real link; plain snippets need a temporary child to inherit li_props.
      const anchor =
        (toc_item
          ? null
          : event.currentTarget.querySelector<HTMLAnchorElement>(`a[href]`)) ??
        document.createElement(`a`)
      const temporary = !anchor.parentElement
      if (temporary) {
        anchor.href = href_for_id(heading_data[idx]?.id) ?? `#`
        event.currentTarget.append(anchor)
      }
      forwarding_navigation = true
      try {
        anchor.click()
      } finally {
        forwarding_navigation = false
        if (temporary) anchor.remove()
      }
    }
    set_open(false, `toc-item`)
  }

  function scroll_to_active_toc_item(behavior: `auto` | `smooth` | `instant` = `smooth`) {
    if (keep_active_toc_item_in_view && active_toc_li && nav) {
      // centre the active item: offsetTop and scrollTop both count from the padding box,
      // so halve clientHeight (the scrollport), not the border box
      const top = active_toc_li.offsetTop - nav.clientHeight / 2
      nav.scrollTo?.({ top, behavior })
    }
  }

  // show the active item when the mobile ToC opens. untracked because tracking active_toc_li
  // (which set_active_heading writes) would re-run this on every arrow-key move.
  $effect(() => {
    if (!open || !nav) return
    untrack(() => {
      set_active_heading()
      scroll_to_active_toc_item(`instant`)
    })
  })

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (!react_to_keys || !react_to_keys.includes(event.key)) return

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

    // Supplemental links and disclosure controls keep native keyboard behavior.
    if (event.key !== `Escape` && document.activeElement?.closest(`[data-toc-footer]`))
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
    // Navigation must not consume keys owned by outside controls; Escape/Tab are handled above.
    const focused = document.activeElement
    const focus_is_idle =
      !focused || focused === document.body || focused === document.documentElement
    // a text field owns its arrows even when a custom toc_item renders it inside nav
    const key_belongs_elsewhere =
      !nav?.contains(focused) || is_editable_event_target(focused)
    if (!focus_is_idle && key_belongs_elsewhere) return
    if (event.key === `Enter` && focused?.matches(`a[href]`)) return

    event.preventDefault()
    const current_toc_li = active_toc_li ?? nav?.querySelector<HTMLLIElement>(`li.active`)

    if (current_toc_li) {
      const sibling_prop =
        event.key === `ArrowDown`
          ? `nextElementSibling`
          : event.key === `ArrowUp`
            ? `previousElementSibling`
            : null
      active_toc_li = sibling_prop
        ? (visible_toc_sibling(current_toc_li, sibling_prop) ?? current_toc_li)
        : current_toc_li
      // move DOM focus along, else the previously focused link's keydown handler hijacks
      // the next Enter/Space (tab -> arrow -> Enter)
      if (sibling_prop) focus_toc_item(active_toc_li)
      const active_id = heading_data[toc_items.indexOf(active_toc_li)]?.id
      active_heading = headings.find(({ id }) => id === active_id) ?? null
    }
    if (active_toc_li && is_activation_key(event.key) && active_heading) {
      const link = toc_item
        ? null
        : active_toc_li.querySelector<HTMLAnchorElement>(`a[href]`)
      ;(link ?? active_toc_li).click()
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
  {...aside_props}
  class={[`toc`, aside_props.class]}
  class:collapsible={collapse_enabled}
  class:desktop
  class:hidden={hide}
  class:intersecting={is_overlapping_hide_target}
  class:mobile={!desktop}
  bind:this={aside}
  hidden={hide}
  aria-hidden={hide || is_overlapping_hide_target}
  {@attach (node) => {
    // while intersecting the aside is only opacity: 0, so without inert it stays tabbable
    // even though aria-hidden tells assistive tech it is gone
    node.toggleAttribute(`inert`, is_overlapping_hide_target)
  }}
>
  <!-- the toggle stays mounted and becomes the close button: unmounting it left touch users
  no visible way out, only an outside click, Escape or a tab-out -->
  {#if !desktop && (heading_data.length >= min_items || footer)}
    <button
      {...open_button_props}
      onclick={(event) => {
        open_button_props.onclick?.(event)
        if (event.defaultPrevented) return
        event.stopPropagation()
        event.preventDefault()
        set_open(!open, `button`)
      }}
      type="button"
      aria-expanded={open}
      aria-label={open ? close_button_label : open_button_label}
    >
      {#if open_toc_icon}{@render open_toc_icon()}{:else}
        <!-- both glyphs stay mounted and cross-fade instead of swapping in one frame -->
        {#each Object.entries(TOGGLE_ICONS) as [state, icon] (state)}
          <svg
            width="1em"
            height="0.9em"
            {...open_button_icon_props}
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
  {#if open || (desktop && (heading_data.length >= min_items || footer))}
    <nav
      {...nav_props}
      transition:blur={blur_params === null ? { duration: 0 } : blur_params}
      bind:this={nav}
    >
      {#if title_snippet}
        {@render title_snippet()}
      {:else if title}
        <h2
          data-heading-anchor="false"
          {...title_props}
          class={[`toc-title`, `toc-exclude`, title_props.class]}
        >
          {title}
        </h2>
      {/if}
      <ol {...ol_props}>
        {#each heading_data as heading, idx (heading.id)}
          {@const indent = levels[idx] - min_level}
          {@const collapsed = collapse_enabled && !heading_visibility[idx]}
          {@const heading_id = heading_data[idx]?.id}
          {@const is_active = heading.id === active_heading?.id}
          {@const item_tabindex = collapsed ? -1 : 0}
          {@const use_fallback_toc_item =
            toc_item && toc_item_has_interactive[idx] === false}
          {@const item_margin_left = `calc(${indent} * var(--toc-indent-per-level, 1em))`}
          {@const item_font_size = `max(var(--toc-li-font-size-min, 2ex), calc(var(--toc-li-font-size-base, 3ex) - ${indent} * var(--toc-li-font-size-step, 0.1ex)))`}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex - fallback for custom toc_item snippets without their own focusable element -->
          <li
            {...li_props}
            class:active={is_active}
            class:collapsed
            aria-hidden={collapsed || undefined}
            aria-current={toc_item && is_active ? `location` : undefined}
            bind:this={toc_items[idx]}
            role={use_fallback_toc_item ? `link` : undefined}
            tabindex={use_fallback_toc_item ? item_tabindex : undefined}
            style:margin-left={item_margin_left}
            style:font-size={item_font_size}
            onclick={li_click_key_handler(heading.id)}
            onkeydown={li_click_key_handler(heading.id)}
          >
            {#if toc_item}
              {@render toc_item(heading)}
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
      {#if footer}
        <div data-toc-footer>{@render footer()}</div>
      {/if}
    </nav>
  {/if}
</aside>

<style>
  :global(.toc-clicked) {
    animation: toc-flash var(--toc-flash-duration, 1500ms) ease-out;
  }
  :global(.toc-clicked a) {
    color: inherit;
  }
  @keyframes toc-flash {
    0%,
    30% {
      color: var(--toc-flash-color, var(--accent, #6495ed));
    }
  }
  :where(aside.toc) {
    /* mirrors Nav's --nav-link-bg-hover / --nav-border-radius so ToC and Nav rows share one
       hover language. Fallbacks only — the public --toc-li-* tokens still win. */
    --toc-item-hover-bg: light-dark(rgba(70, 70, 140, 0.2), rgba(120, 170, 255, 0.2));
    --toc-item-radius: 3pt;
    /* shared by the mobile panel and its toggle; values match Nav's --nav-surface-* */
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
  /* must follow `.active`: equal specificity, so source order decides whether the active
     row (the likeliest hover target) keeps its hover fill. An unset --toc-active-bg made
     `background` invalid there and swallowed the fill entirely. */
  aside.toc > nav > ol > li:hover {
    color: var(--toc-li-hover-color);
    background: var(--toc-li-hover-bg, var(--toc-item-hover-bg));
  }
  /* an unset --toc-li-hover-color is guaranteed-invalid, so the rule above computes `color`
     to inherited text instead of dropping out, wiping the accent off the active row on
     hover. Restating the active colour as the fallback fixes it; an explicit one still wins. */
  aside.toc > nav > ol > li.active:hover {
    color: var(--toc-li-hover-color, var(--toc-active-color));
  }
  /* cosmetics in `:where()` so a host can restyle without fighting specificity; the box
     is not, see the structural rule below */
  :where(aside.toc > button) {
    cursor: pointer;
    font: var(--toc-mobile-btn-font, 1.4rem sans-serif);
    line-height: var(--toc-mobile-btn-line-height, 0);
    /* relative, not absolute: the aside lays both children out, but the public bottom/right
       vars must still nudge the toggle off its flex slot */
    position: relative;
    bottom: var(--toc-mobile-btn-bottom, 0);
    right: var(--toc-mobile-btn-right, 0);
    z-index: var(--toc-mobile-btn-z-index, 2);
    border: var(--toc-mobile-btn-border, var(--toc-surface-border));
    border-radius: var(--toc-mobile-btn-border-radius, 3pt);
    background: var(--toc-mobile-btn-bg, var(--toc-mobile-bg, rgba(255, 255, 255, 0.2)));
    color: var(--toc-mobile-btn-color, var(--text, black));
    box-shadow: var(--toc-mobile-btn-shadow, var(--toc-surface-shadow));
  }
  /* sized to match Nav's burger, the only other pinned mobile toggle. Not `:where()`: a host
     `button { padding }` reset outweighs a zero-specificity selector and silently resized the
     hit target. Tune with --toc-mobile-btn-padding / --toc-mobile-btn-font, which still win. */
  aside.toc > button {
    display: grid;
    place-items: center;
    box-sizing: content-box;
    /* 1em so the box tracks --toc-mobile-btn-font, which the icon already sizes from */
    width: 1em;
    height: 0.9em;
    padding-block: var(--toc-mobile-btn-padding, 0.25rem);
    padding-inline: var(--toc-mobile-btn-padding, 0.3rem);
  }
  /* both glyphs share one grid cell and swap by opacity + quarter turn, on the 0.2s linear
     Nav's burger bars use */
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
  /* in the floating panel the title is a header, not a paragraph, so it drops the desktop
     1em gap and cancels the panel's inline padding: a divider stopping short of the sides
     reads as an underline on the words rather than a break above the list */
  :where(aside.toc.mobile > nav > .toc-title) {
    margin-block-end: var(--toc-mobile-title-margin-bottom, 0.35em);
    padding-block-end: var(--toc-mobile-title-padding-bottom, 0.2em);
    /* the inherited 1.6 is prose leading; on one header line it is just space above and
       below the words, which reads as padding inside the rule */
    line-height: var(--toc-mobile-title-line-height, 1.3);
    margin-inline: calc(-1 * var(--toc-mobile-padding-inline));
    padding-inline: var(--toc-mobile-padding-inline);
    border-bottom: var(--toc-mobile-title-border, var(--toc-surface-border));
  }
  /* column-reverse against the DOM order [button, nav] pins the toggle in the corner and
     opens the panel above it. Absolute positioning off this anchor stacked the two once the
     toggle stopped unmounting on open. */
  aside.toc.mobile {
    position: fixed;
    z-index: var(--toc-z-index, 2);
    bottom: var(--toc-mobile-bottom, 1em);
    right: var(--toc-mobile-right, 1em);
    display: flex;
    flex-direction: column-reverse;
    align-items: end;
    gap: var(--toc-mobile-gap, 0.5em);
    /* overrides the base --toc-width/--toc-min-width: on mobile the aside is a corner anchor
       sized to whichever of panel or toggle is wider. The 15em floor left a closed toggle
       dragging a transparent 15em box that still ate taps aimed at the page beneath. */
    width: max-content;
    min-width: 0;
    /* a fixed panel can't scroll with the document, so cap the stack against the viewport
       and let the panel scroll inside */
    max-height: calc(100dvh - 2 * var(--toc-mobile-bottom, 1em));
    max-width: calc(100dvw - 2 * var(--toc-mobile-right, 1em));
  }
  aside.toc.mobile > nav {
    /* the desktop 3em inset is just a blank band in a floating panel. The inline half is its
       own token because the title's rule cancels it to reach the panel edge — a host replacing
       --toc-mobile-padding should set it to match. rem, not em: a custom property substitutes
       its text, so `em` would resolve against the reading element (the title is larger). */
    --toc-mobile-padding-inline: 1rem;
    padding: var(--toc-mobile-padding, 0.5em var(--toc-mobile-padding-inline) 1em);
    /* --toc-font-size shrinks the desktop column to fit beside the content; the floating
       panel has no such constraint and is read at arm's length, so it matches Nav's menu */
    font-size: var(--toc-mobile-font-size, 1rem);
    border-radius: var(--toc-mobile-border-radius, 6pt);
    box-sizing: border-box;
    background: var(--toc-mobile-bg, white);
    width: var(--toc-mobile-width, 18em);
    max-width: 100%;
    /* flex items floor at content height, so a tall toc would push the toggle off-screen
       instead of scrolling */
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
