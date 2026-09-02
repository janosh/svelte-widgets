<script lang="ts">
  import { ChevronDown } from './icons'
  import type { Snippet } from 'svelte'
  import type {
    HTMLAnchorAttributes,
    HTMLAttributes,
    HTMLButtonAttributes,
  } from 'svelte/elements'
  import type { TooltipOptions } from './attachments/index'
  import { click_outside, focus_trap, tooltip } from './attachments/index'
  import Icon from './Icon.svelte'
  import { merge_defaults, NAV_LABELS, type NavLabels } from './labels'
  import type { NavRoute, NavRouteObject } from './types'
  import { chain_handlers, step_focus } from './utils'

  type NavLinkRouteObject = NavRouteObject & { href: string }

  // Parameter passed to the item snippet
  interface ItemSnippetParams {
    route: NavRouteObject // normalized route object
    href: string
    label: string
    is_active: boolean
    is_dropdown: boolean
    render_default: Snippet // escape hatch to render default
  }

  let {
    routes = [],
    children,
    item,
    link,
    menu_props,
    link_props,
    burger_props,
    page,
    route_labels,
    labels,
    tooltips,
    tooltip_options,
    breakpoint = 767,
    onnavigate,
    onopen,
    onclose,
    ...rest
  }: {
    routes: NavRoute[]
    children?: Snippet<[{ is_open: boolean; panel_id: string; routes: NavRoute[] }]>
    item?: Snippet<[ItemSnippetParams]>
    link?: Snippet<[{ href: string; label: string; isActive: boolean }]>
    menu_props?: Omit<HTMLAttributes<HTMLDivElement>, `id`>
    // `href` and `aria-current` stay component-owned: one shared bag cannot carry a
    // per-route destination, and overriding it would point every link at the same page
    link_props?: Omit<HTMLAnchorAttributes, `aria-current` | `href`>
    // mobile menu toggle; style/class land here rather than on the <nav> host
    burger_props?: Omit<HTMLButtonAttributes, `aria-controls` | `aria-expanded` | `type`>
    page?: { url: { pathname: string } }
    // renames individual routes, keyed by the auto-generated label
    route_labels?: Record<string, string>
    labels?: Partial<NavLabels>
    tooltips?: Record<string, string | Omit<TooltipOptions, `disabled`>>
    tooltip_options?: Omit<TooltipOptions, `content` | `render`>
    breakpoint?: number
    onnavigate?: (data: {
      href: string
      event: MouseEvent
      route: NavRouteObject
    }) => false | undefined
    onopen?: () => void
    onclose?: () => void
  } & Omit<HTMLAttributes<HTMLElementTagNameMap[`nav`]>, `children`> = $props()

  const msg = $derived(merge_defaults(NAV_LABELS, labels))

  let is_open = $state(false)
  // Submenus open on click/tap only. Hover-opening them made every pass of the pointer
  // across the nav pop a panel open over the page, and a touch device has no hover to
  // begin with, so the two input modes behaved differently for no gain.
  let open_dropdown = $state<string | null>(null)
  // Start from the real width on the client so hydration doesn't flash the desktop nav on phones
  let viewport_width = $state(globalThis.innerWidth ?? Infinity)
  let is_mobile = $derived(viewport_width <= breakpoint)
  let focus_timeout: ReturnType<typeof setTimeout> | undefined
  // `$props.id()` survives hydration; a random uuid would mismatch aria-controls
  const unique_id = $props.id()
  const panel_id = `nav-menu-${unique_id}`

  // Track previous is_open state for callbacks. Deliberately not $state: it's
  // written inside the $effect below, which would re-trigger the effect if reactive.
  let prev_is_open = false

  $effect(() => {
    if (is_open && !prev_is_open) {
      onopen?.()
    } else if (!is_open && prev_is_open) {
      onclose?.()
    }
    prev_is_open = is_open
  })

  $effect(() => () => clearTimeout(focus_timeout))

  function close_menus() {
    is_open = false
    open_dropdown = null
  }

  // Query the submenu links / toggle button of the dropdown for a given route href, scoped
  // to this instance: `data-href` is the route href, so two Navs rendering the same route
  // would otherwise match each other's dropdowns and steal each other's focus. The scope is
  // an id string rather than a `bind:this` ref so it is already usable while children
  // render, which is when `focus_trap`'s `restore` reads the toggle.
  const dropdown_sel = (href: string) =>
    `[data-nav="${unique_id}"] .dropdown[data-href="${CSS.escape(href)}"]`
  const dropdown_links = (href: string) =>
    document.querySelectorAll<HTMLElement>(`${dropdown_sel(href)} [data-submenu] a`)
  const dropdown_toggle = (href: string) =>
    document.querySelector<HTMLButtonElement>(
      `${dropdown_sel(href)} [data-dropdown-toggle]`,
    )

  function toggle_dropdown(href: string, focus_first = false) {
    const is_opening = open_dropdown !== href
    open_dropdown = is_opening ? href : null
    if (is_opening && focus_first) {
      clearTimeout(focus_timeout)
      focus_timeout = setTimeout(() => dropdown_links(href)[0]?.focus(), 0)
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === `Escape`) close_menus()
  }

  const is_dropdown_open = (href: string) => open_dropdown === href

  function handle_toggle_keydown(event: KeyboardEvent, href: string) {
    const { key } = event
    const opens =
      key === `Enter` || key === ` ` || (key === `ArrowDown` && !is_dropdown_open(href))
    if (!opens) return
    event.preventDefault()
    toggle_dropdown(href, true)
  }

  // On the whole dropdown, so arrows keep working after focus has moved from the toggle
  // onto a link and Escape hands focus back to the toggle from anywhere inside.
  function handle_dropdown_keydown(event: KeyboardEvent, href: string) {
    if (!is_dropdown_open(href)) return
    if (event.key === `Escape`) {
      event.preventDefault()
      close_menus()
      dropdown_toggle(href)?.focus()
    } else step_focus(event, [...dropdown_links(href)])
  }

  function is_current(path: string | undefined) {
    if (!path) return
    if (path === `/`) return page?.url.pathname === `/` ? `page` : undefined
    // Match exact path or path followed by / to avoid partial matches
    const pathname = page?.url.pathname
    const exact_match = pathname === path
    const prefix_match = pathname?.startsWith(`${path}/`)
    return exact_match || prefix_match ? `page` : undefined
  }

  const is_child_current = (sub_routes: string[]) =>
    sub_routes.some((child_path) => is_current(child_path) === `page`)

  function format_label(text: string | undefined, remove_parent = false) {
    if (!text) return { label: ``, style: `` }
    const custom_label = route_labels?.[text]
    if (custom_label) return { label: custom_label, style: `` }

    if (remove_parent) text = text.split(`/`).findLast(Boolean) ?? text
    let label = text.replace(/^\//u, ``).replaceAll(`-`, ` `)
    // Handle root path '/' which becomes empty after stripping
    if (!label && text === `/`) label = `Home`
    return { label, style: label ? `text-transform: capitalize` : `` }
  }

  function parse_route(route: NavRoute): NavLinkRouteObject {
    if (typeof route === `string`) return { href: route }
    if (Array.isArray(route)) {
      const [href, second] = route
      return Array.isArray(second) ? { href, children: second } : { href, label: second }
    }
    return { ...route, href: route.href ?? `` }
  }

  function get_route_key(route: NavRoute, route_idx: number): string {
    return `${route_idx}-${parse_route(route).href || `sep-${route_idx}`}`
  }

  function get_tooltip(route: NavRouteObject) {
    // Priority: disabled message > route.tooltip > tooltips[href]
    if (typeof route.disabled === `string`) {
      return tooltip({ ...tooltip_options, content: route.disabled })
    }
    const content = route.tooltip ?? (route.href ? tooltips?.[route.href] : undefined)
    if (!content) return
    // Support both string (content only) and object (full options) formats
    const tooltip_overrides = typeof content === `string` ? { content } : content
    return tooltip({ ...tooltip_options, ...tooltip_overrides })
  }

  function handle_link_click(event: MouseEvent, route: NavLinkRouteObject) {
    if (route.disabled) {
      event.preventDefault()
      return
    }
    if (onnavigate) {
      const result = onnavigate({ href: route.href, event, route })
      if (result === false) {
        event.preventDefault()
        return
      }
    }
    close_menus()
  }
  const link_click_handler = (route: NavLinkRouteObject) =>
    chain_handlers(
      (event: MouseEvent) => handle_link_click(event, route),
      link_props?.onclick,
    )
  function get_external_attrs(route: NavRouteObject) {
    if (!route.external) return {}
    return { target: `_blank`, rel: `noopener noreferrer` }
  }
</script>

<svelte:window {onkeydown} bind:innerWidth={viewport_width} />

<!-- Default item rendering snippet for escape hatch -->
{#snippet default_item_render(
  parsed_route: NavLinkRouteObject,
  formatted: { label: string; style: string },
  item_tooltip: ReturnType<typeof tooltip> | undefined,
)}
  {@const is_disabled = Boolean(parsed_route.disabled)}
  {#if is_disabled}
    <span
      class={[`disabled`, parsed_route.class]}
      style={`${formatted.style}; ${parsed_route.style ?? ``}`}
      aria-disabled="true"
      {@attach item_tooltip}>{@html formatted.label}</span
    >
  {:else if link}
    {@render link({
      href: parsed_route.href,
      label: formatted.label,
      isActive: is_current(parsed_route.href) === `page`,
    })}
  {:else}
    <a
      {...link_props}
      {...get_external_attrs(parsed_route)}
      href={parsed_route.href}
      aria-current={is_current(parsed_route.href)}
      class={[parsed_route.class, link_props?.class]}
      style={`${formatted.style}; ${link_props?.style ?? ``}; ${parsed_route.style ?? ``}`}
      onclick={link_click_handler(parsed_route)}
      {@attach item_tooltip}
    >
      {@html formatted.label}
    </a>
  {/if}
{/snippet}

<nav
  {...rest}
  data-nav={unique_id}
  class:mobile={is_mobile}
  onclick={chain_handlers((event: MouseEvent) => {
    // The `link` snippet renders the consumer's own markup, which carries none of the
    // wiring `link_click_handler` adds to the default anchor. Without this, navigating
    // from the burger menu left the overlay covering the page it had just moved to.
    const target = event.target
    if (target instanceof Element && target.closest(`a[href]`)) close_menus()
  }, rest?.onclick)}
  {@attach click_outside({
    // skip the document listener (and its scrollbar layout read) when nothing is open
    enabled: is_open || Boolean(open_dropdown),
    callback: close_menus,
  })}
>
  <button
    aria-label="Toggle navigation menu"
    {...burger_props}
    type="button"
    aria-expanded={is_open}
    aria-controls={panel_id}
    class={[`burger`, burger_props?.class]}
    onclick={chain_handlers(() => (is_open = !is_open), burger_props?.onclick)}
  >
    <span aria-hidden="true"></span>
    <span aria-hidden="true"></span>
    <span aria-hidden="true"></span>
  </button>

  <!-- Escape is also handled on window, but a consumer onkeydown that stops propagation
  would prevent that, so close from the element too -->
  <div
    {...menu_props}
    id={panel_id}
    class={[`menu`, menu_props?.class, { open: is_open }]}
    onkeydown={chain_handlers(onkeydown, menu_props?.onkeydown)}
  >
    {#each routes as route, route_idx (get_route_key(route, route_idx))}
      {@const parsed_route = parse_route(route)}
      {@const formatted = format_label(parsed_route.label ?? parsed_route.href)}
      {@const sub_routes = parsed_route.children}
      {@const is_active = is_current(parsed_route.href) === `page`}
      {@const is_dropdown = Boolean(sub_routes)}
      {@const is_right = parsed_route.align === `right`}
      {@const item_tooltip = get_tooltip(parsed_route)}

      <!-- Separator-only item -->
      {#if parsed_route.separator && !parsed_route.href}
        <div class="separator" role="separator"></div>
      {:else if sub_routes}
        <!-- Dropdown menu item -->
        {@const child_is_active = is_child_current(sub_routes)}
        {@const parent_page_exists = sub_routes.includes(parsed_route.href)}
        {@const filtered_sub_routes = sub_routes.filter(
          (route) => route !== parsed_route.href,
        )}
        {@const dropdown_open = is_dropdown_open(parsed_route.href)}
        <!-- svelte-ignore a11y_no_static_element_interactions -- native navigation links keep semantics; the keydown handler only routes arrows/Escape within the open submenu -->
        <div
          class={[`dropdown`, { active: child_is_active, 'align-right': is_right }]}
          data-href={parsed_route.href}
          onkeydown={(event: KeyboardEvent) =>
            handle_dropdown_keydown(event, parsed_route.href)}
        >
          <div>
            {#if parsed_route.disabled}
              <span
                class={[`disabled`, parsed_route.class]}
                style={`${formatted.style}; ${parsed_route.style ?? ``}`}
                aria-disabled="true"
                {@attach item_tooltip}>{@html formatted.label}</span
              >
            {:else if parent_page_exists}
              <a
                href={parsed_route.href}
                aria-current={is_current(parsed_route.href)}
                onclick={(event: MouseEvent) => handle_link_click(event, parsed_route)}
                class={parsed_route.class}
                style={`${formatted.style}; ${parsed_route.style ?? ``}`}
                {...get_external_attrs(parsed_route)}
                {@attach item_tooltip}
              >
                {@html formatted.label}
              </a>
            {:else}
              <span
                class={parsed_route.class}
                style={`${formatted.style}; ${parsed_route.style ?? ``}`}
                {@attach item_tooltip}>{@html formatted.label}</span
              >
            {/if}
            <button
              type="button"
              class={[`dropdown-toggle`, { open: dropdown_open }]}
              data-dropdown-toggle
              aria-label={msg.toggle_submenu(formatted.label)}
              aria-expanded={dropdown_open}
              aria-haspopup="true"
              onclick={() => toggle_dropdown(parsed_route.href, false)}
              onkeydown={(event: KeyboardEvent) =>
                handle_toggle_keydown(event, parsed_route.href)}
            >
              <Icon icon={ChevronDown} style="width: 1em; height: 1em" />
            </button>
          </div>
          <div
            class:visible={dropdown_open}
            data-submenu
            tabindex="-1"
            {@attach focus_trap({
              enabled: dropdown_open, // an open submenu owns the keyboard
              initial: false, // toggle_dropdown already picks the entry point
              restore: dropdown_toggle(parsed_route.href) ?? false,
            })}
          >
            <!-- `display: contents` everywhere except the mobile layout, where this wrapper is
            the single grid row whose 0fr -> 1fr animates the section open -->
            <div class="submenu-inner">
              {#each filtered_sub_routes as child_href (child_href)}
                {@const child_formatted = format_label(child_href, true)}
                {@const child_tooltip = get_tooltip({ href: child_href })}
                {#if link}
                  {@render link({
                    href: child_href,
                    label: child_formatted.label,
                    isActive: is_current(child_href) === `page`,
                  })}
                {:else}
                  <a
                    {...link_props}
                    href={child_href}
                    aria-current={is_current(child_href)}
                    style={`${child_formatted.style}; ${link_props?.style ?? ``}`}
                    onclick={link_click_handler({ href: child_href })}
                    {@attach child_tooltip}
                  >
                    {@html child_formatted.label}
                  </a>
                {/if}
              {/each}
            </div>
          </div>
        </div>
        <!-- Separator after dropdown if specified -->
        {#if parsed_route.separator}
          <div class="separator" role="separator"></div>
        {/if}
      {:else}
        <!-- Regular link item -->
        {#if item}
          <!-- User-provided item snippet with render_default escape hatch -->
          {#snippet render_default_snippet()}
            {@render default_item_render(parsed_route, formatted, item_tooltip)}
          {/snippet}
          <span class:align-right={is_right}>
            {@render item({
              route: parsed_route,
              href: parsed_route.href,
              label: formatted.label,
              is_active,
              is_dropdown,
              // svelte2tsx types inline snippets as `() => ReturnType<Snippet>`, whose
              // brand doesn't unify with Snippet (svelte#13670); plain assertion suffices
              render_default: render_default_snippet as Snippet,
            })}
          </span>
        {:else}
          <span class:align-right={is_right}>
            {@render default_item_render(parsed_route, formatted, item_tooltip)}
          </span>
        {/if}
        <!-- Separator after item if specified -->
        {#if parsed_route.separator}
          <div class="separator" role="separator"></div>
        {/if}
      {/if}
    {/each}

    {@render children?.({ is_open, panel_id, routes })}
  </div>
</nav>

<style>
  nav {
    position: relative;
    margin: -0.75em auto 1.25em;
    --nav-border-radius: 3pt;
    --nav-surface-bg: light-dark(#fafafa, #222226);
    --nav-surface-border: light-dark(rgba(128, 128, 128, 0.25), rgba(200, 200, 200, 0.2));
    --nav-surface-shadow: light-dark(
      0 2px 8px rgba(0, 0, 0, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.5)
    );
    --nav-link-bg-hover: light-dark(rgba(70, 70, 140, 0.2), rgba(120, 170, 255, 0.2));
    --nav-dropdown-border-color: color-mix(in srgb, currentColor 30%, transparent 70%);
  }
  .menu {
    display: flex;
    gap: 1em;
    place-content: center;
    place-items: center;
    flex-wrap: wrap;
    padding: 0.5em;
  }
  .menu > span {
    display: flex;
    align-items: center;
    border-radius: var(--nav-border-radius);
    background-color: var(--nav-link-bg);
    transition: background-color 0.2s;
  }
  .menu > span:hover {
    background-color: var(--nav-link-bg-hover, rgba(0, 0, 0, 0.1));
  }
  .menu > span > a {
    line-height: 1.3;
    padding: var(--nav-item-padding, 1pt 4pt);
    text-decoration: none;
    color: inherit;
  }
  .menu > span > a[aria-current='page'] {
    color: var(--nav-link-active-color);
  }
  /* Disabled items */
  .menu .disabled {
    opacity: var(--nav-disabled-opacity, 0.5);
    cursor: not-allowed;
    pointer-events: none;
  }
  /* Right-aligned items - only first one gets margin-inline-start: auto */
  .menu > :is(.align-right, .dropdown.align-right) {
    margin-inline-start: auto;
  }
  .menu
    > :is(.align-right, .dropdown.align-right)
    + :is(.align-right, .dropdown.align-right) {
    margin-inline-start: 0;
  }
  /* Separator */
  .menu > .separator {
    width: 1px;
    height: 1.2em;
    background-color: var(--nav-separator-color, currentColor);
    opacity: 0.3;
    margin: var(--nav-separator-margin, 0 0.25em);
  }
  /* Dropdown styles */
  .dropdown {
    position: relative;
  }
  .dropdown.active > div:first-child :is(a, span) {
    color: var(--nav-link-active-color);
  }
  .dropdown > div:first-child {
    display: flex;
    align-items: center;
    border-radius: var(--nav-border-radius);
    background-color: var(--nav-link-bg);
    transition: background-color 0.2s;
  }
  .dropdown > div:first-child:hover {
    background-color: var(--nav-link-bg-hover, rgba(0, 0, 0, 0.1));
  }
  .dropdown > div:first-child > :is(a, span) {
    line-height: 1.3;
    padding: var(--nav-item-padding, 1pt 4pt);
    padding-inline-end: 2pt;
    text-decoration: none;
    color: inherit;
    border-start-start-radius: var(--nav-border-radius);
    border-end-start-radius: var(--nav-border-radius);
  }
  .dropdown > div:first-child > a[aria-current='page'] {
    color: var(--nav-link-active-color);
  }
  .dropdown > div:first-child > button {
    padding-block: 2pt;
    padding-inline: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-start-end-radius: var(--nav-border-radius);
    border-end-end-radius: var(--nav-border-radius);
    outline-offset: -1px;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  .dropdown > div:first-child > button :global(svg) {
    transition: transform 0.2s ease;
  }
  .dropdown > div:first-child > button:hover {
    opacity: 1;
  }
  .dropdown > div:first-child > button.open {
    opacity: 1;
  }
  .dropdown > div:first-child > button.open :global(svg) {
    transform: rotate(180deg);
  }
  .dropdown > div:first-child > button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -2px;
    opacity: 1;
  }
  .dropdown > div:last-child {
    position: absolute;
    top: 100%;
    inset-inline-start: var(--nav-dropdown-left, 0);
    inset-inline-end: var(--nav-dropdown-right, auto);
    margin: var(--nav-dropdown-margin, 2pt) 0 0 0;
    min-width: var(--nav-dropdown-min-width, 100%); /* at least as wide as parent */
    max-width: var(--nav-dropdown-max-width, none);
    width: var(--nav-dropdown-width, max-content); /* grow wider if content needs it */
    background-color: var(--nav-dropdown-bg, var(--nav-surface-bg));
    border: 1px solid var(--nav-dropdown-border-color, var(--nav-surface-border));
    border-radius: var(--nav-border-radius, 6pt);
    box-shadow: var(--nav-dropdown-shadow, var(--nav-surface-shadow));
    padding: var(--nav-dropdown-padding, 0);
    display: none;
    flex-direction: column;
    z-index: var(--nav-dropdown-z-index, 100);
  }
  .dropdown > div:last-child.visible {
    display: flex;
  }
  /* the links are direct flex/grid items of the popover on desktop; only the mobile layout
     below gives this wrapper a box of its own */
  .submenu-inner {
    display: contents;
  }
  .dropdown > div:last-child a {
    padding: var(--nav-dropdown-link-padding, 2pt 6pt);
    text-decoration: none;
    color: inherit;
    white-space: nowrap;
    font-size: 0.9em;
    transition: background-color 0.15s;
  }
  .dropdown > div:last-child a:hover {
    background-color: var(--nav-link-bg-hover, rgba(0, 0, 0, 0.1));
  }
  .dropdown > div:last-child a[aria-current='page'] {
    color: var(--nav-link-active-color);
  }
  /* Mobile burger button */
  .burger {
    display: none;
    /* `absolute` scopes the burger to the nearest positioned ancestor instead of the viewport,
       which is what an embedded demo wants: two Navs on one page otherwise pin two burgers to
       the same corner and the top one wins every tap. Pair it with --nav-mobile-menu-position. */
    position: var(--nav-burger-position, fixed);
    top: 1rem;
    inset-inline-start: 1rem;
    flex-direction: column;
    justify-content: space-around;
    /* 1.4rem bars in a 0.3rem-padded box, matching Toc's mobile toggle — the two are the only
       pinned mobile chrome a page has, so they have to read as a set */
    width: var(--nav-burger-size, 1.4rem);
    height: var(--nav-burger-size, 1.4rem);
    box-sizing: content-box;
    padding: var(--nav-burger-padding, 0.3rem);
    /* The same opaque chip as Toc's toggle, for the same reason: pinned over scrolling page
       content, a transparent button leaves the bars sitting on whatever text passes beneath.
       Both toggles are anchored by their box edge — no negative margin pulling the padding
       out — so the chip, not the glyph, is what lines up 1rem from the corner. */
    background: var(--nav-burger-bg, var(--nav-surface-bg));
    border: 1px solid var(--nav-burger-border-color, var(--nav-surface-border));
    border-radius: var(--nav-border-radius, 6pt);
    box-shadow: var(--nav-burger-shadow, var(--nav-surface-shadow));
    z-index: var(--nav-toggle-btn-z-index, 10);
  }
  .burger span {
    width: 100%;
    height: 0.18rem;
    /* hosts that don't define --text still get visible bars */
    background-color: var(--text, currentColor);
    border-radius: 8pt;
    transition:
      opacity 0.2s linear,
      transform 0.2s linear;
    transform-origin: center;
  }
  /* Both strokes must land on the box's centre line or the X reads as lopsided. Under
     `space-around` with three equal bars, adjacent bar centres are exactly height/3 apart —
     the outer bars are one step from the middle one, which is already centred. A hardcoded
     offset (0.4rem against a 1.4rem box) left them ~1px shy of meeting. */
  .burger[aria-expanded='true'] span:first-child {
    transform: translateY(calc(var(--nav-burger-size, 1.4rem) / 3)) rotate(45deg);
  }
  .burger[aria-expanded='true'] span:nth-child(2) {
    opacity: 0;
  }
  .burger[aria-expanded='true'] span:nth-child(3) {
    transform: translateY(calc(var(--nav-burger-size, 1.4rem) / -3)) rotate(-45deg);
  }
  /* Mobile styles - using .mobile class set via JS based on breakpoint prop */
  nav.mobile .burger {
    display: flex;
  }
  nav.mobile .menu {
    position: var(--nav-mobile-menu-position, fixed);
    top: 3rem;
    /* Hug the content and hang off the burger's side rather than spanning the viewport: a
       full-width bar of mostly empty space reads as a broken layout, and the menu is chrome
       floating over the page, not a section of it. Capped so a long route label still can't
       push it off-screen. Hosts wanting the full-width bar can set --nav-mobile-inset to a
       single value like `0.5rem`. */
    inset-inline: var(--nav-mobile-inset, 0.5rem auto);
    width: max-content;
    max-width: calc(100dvw - 1rem);
    background-color: var(--nav-surface-bg);
    border: 1px solid var(--nav-surface-border);
    box-shadow: var(--nav-surface-shadow);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.3s ease,
      visibility 0.3s ease;
    z-index: var(--nav-mobile-z-index, 2);
    flex-direction: column;
    /* one scrollable column: with several submenus expanded the menu outgrows a phone
       screen, and wrapping would spill entries into a second column off the panel */
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: start;
    gap: 0.2em;
    max-height: calc(100dvh - 4rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 6pt;
  }
  nav.mobile .menu.open {
    opacity: 1;
    visibility: visible;
  }
  /* `.menu > span` and `.dropdown > div:first-child` are the two elements that paint a row's
     highlight. Padding must land on both or neither: padding `.dropdown` instead of its inner
     wrapper grew the row around the pill rather than the pill itself, so plain links rendered
     visibly wider and taller pills than dropdown rows. */
  nav.mobile :is(.menu > span, .dropdown > div:first-child) {
    padding: 1pt 8pt;
  }
  /* Fill the pill, matching the flex:1 that dropdown rows already give their link, so the
     whole row is tappable rather than just the text. flex:1 only fills the content box, so
     the negative margin pulls the link back out over the span's padding and its own padding
     puts the text back where it was — otherwise the padding is a dead band inside the
     painted pill. The padding stays on the span so a custom `item` snippet still gets it. */
  nav.mobile .menu > span > a {
    flex: 1;
    margin: -1pt -8pt;
    padding: 1pt 8pt;
  }
  /* Same pull-out for dropdown rows, inline-start only — the chevron owns the other end. The
     link keeps its own --nav-item-padding, which stacked on the row's padding and left every
     expandable entry indented past its plain siblings. */
  nav.mobile .dropdown > div:first-child > :is(a, span) {
    margin-inline-start: -8pt;
    padding-inline-start: 8pt;
  }
  /* Mobile separator */
  nav.mobile .menu > .separator {
    width: 100%;
    height: 1px;
    margin: var(--nav-separator-margin, 0.25em 0);
  }
  /* Mobile dropdown styles - show as expandable section */
  nav.mobile .dropdown {
    flex-direction: column;
    align-items: stretch;
  }
  nav.mobile .dropdown > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  nav.mobile .dropdown > div:first-child > :is(a, span) {
    flex: 1;
    border-radius: var(--nav-border-radius);
  }
  nav.mobile .dropdown > div:first-child > button {
    /* The caret is the only way to open a section, so it gets the biggest target the row can
       give it: full row height via `stretch`, and negative margins pulling it out over the
       row's own padding so the tap area runs to the painted edge instead of stopping short
       of it. The padding puts back what the margins take, keeping the glyph where it was. */
    align-self: stretch;
    margin: -1pt -8pt -1pt 0;
    padding: 1pt 8pt 1pt 14pt;
    border-radius: var(--nav-border-radius);
    opacity: 0.6;
  }
  nav.mobile .dropdown > div:first-child > button.open {
    opacity: 1;
  }
  /* Expand the section rather than switching it on: `display: none` can't transition, so the
     collapsed state is a zero-height grid row (0fr -> 1fr against the wrapper below) plus a
     fade. `visibility` rides along because the links stay in the DOM while collapsed and
     would otherwise keep collecting Tab focus behind a closed section. */
  nav.mobile .dropdown > div:last-child {
    position: static;
    border: none;
    box-shadow: none;
    padding: 0;
    background-color: transparent;
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    transition:
      grid-template-rows var(--nav-submenu-duration, 0.25s) ease,
      opacity var(--nav-submenu-duration, 0.25s) ease,
      visibility var(--nav-submenu-duration, 0.25s);
  }
  nav.mobile .dropdown > div:last-child.visible {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
  }
  /* The animated row. Its gap above the first link is padding that opens with it, not a
     margin on the section: `min-height: 0` zeroes the row's content but not its padding, so
     a static 2pt would sit under every collapsed submenu as a visible sliver. */
  nav.mobile .submenu-inner {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-top: 0;
    transition: padding-top var(--nav-submenu-duration, 0.25s) ease;
    /* One rule down the whole section instead of one per link: the links abut, so their own
       borders would nearly join, but the section's opening padding leaves a notch above the
       first one and the line has to read as a single stroke tying the group to its parent.
       A hairline sitting close under the parent label — it marks where the section belongs,
       so it should not compete with the labels beside it. Its own colour rather than
       --nav-surface-border, which is tuned for a 1px panel edge over the page background,
       not for a rule over the panel's own fill. */
    margin-inline-start: 10pt;
    border-inline-start: 1px solid
      var(
        --nav-submenu-line-color,
        light-dark(rgba(128, 128, 128, 0.55), rgba(200, 200, 200, 0.4))
      );
  }
  nav.mobile .dropdown > div:last-child.visible .submenu-inner {
    padding-top: 2pt;
  }
  nav.mobile .dropdown > div:last-child a {
    padding-block: 2pt;
    padding-inline: 6pt 8pt;
    /* An inherited 1.6 made every child row taller than the parent it hangs under, which read
       as a list of headings rather than a nested section. 1.3 is what the top-level rows use. */
    line-height: 1.3;
    /* Pull the link's own border onto the wrapper's guide line, so the active row recolours a
       segment of that line instead of drawing a second one beside it. Same width as the rule
       it covers, or the two would not line up on both edges. */
    margin-inline-start: -1px;
    border-inline-start: 1px solid transparent;
    font-size: 0.9em;
  }
  nav.mobile .dropdown > div:last-child a[aria-current='page'] {
    border-inline-start-color: var(--nav-link-active-color, currentColor);
  }
  /* Mobile right-aligned items stack normally */
  nav.mobile .menu > :is(.align-right, .dropdown.align-right) {
    margin-inline-start: 0;
  }
</style>
