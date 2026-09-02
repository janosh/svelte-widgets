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

  interface ItemSnippetParams {
    route: NavRouteObject
    href: string
    label: string
    is_active: boolean
    is_dropdown: boolean
    render_default: Snippet
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
    // `href`/`aria-current` stay component-owned: one shared bag would point every link
    // at the same page
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
  // click/tap only: hover-opening popped panels on every pointer pass and touch devices
  // have no hover, so the two input modes diverged for no gain
  let open_dropdown = $state<string | null>(null)
  // Start from the real width on the client so hydration doesn't flash the desktop nav on phones
  let viewport_width = $state(globalThis.innerWidth ?? Infinity)
  let is_mobile = $derived(viewport_width <= breakpoint)
  let focus_timeout: ReturnType<typeof setTimeout> | undefined
  // `$props.id()` survives hydration; a random uuid would mismatch aria-controls
  const unique_id = $props.id()
  const panel_id = `nav-menu-${unique_id}`

  // deliberately not $state: written inside the $effect below, which would self-retrigger
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

  // scoped per instance, else two Navs rendering the same route match each other's
  // dropdowns and steal focus. An id string, not `bind:this`, so it's usable while
  // children render — when `focus_trap`'s `restore` reads the toggle.
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

  // on the whole dropdown so arrows keep working once focus leaves the toggle, and
  // Escape returns focus to the toggle from anywhere inside
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
    // exact path or `path/` prefix, never a partial segment match
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
    // '/' strips to the empty string
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
    // the `link` snippet's markup misses `link_click_handler`'s wiring, so without this
    // the burger overlay stayed up over the page it had just navigated to
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

  <!-- also on window, but a consumer onkeydown that stops propagation would block that -->
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

      {#if parsed_route.separator && !parsed_route.href}
        <div class="separator" role="separator"></div>
      {:else if sub_routes}
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
              enabled: dropdown_open,
              initial: false, // toggle_dropdown already picks the entry point
              restore: dropdown_toggle(parsed_route.href) ?? false,
            })}
          >
            <!-- `display: contents` except on mobile, where it's the grid row animating 0fr -> 1fr -->
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
        {#if parsed_route.separator}
          <div class="separator" role="separator"></div>
        {/if}
      {:else}
        {#if item}
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
  .menu .disabled {
    opacity: var(--nav-disabled-opacity, 0.5);
    cursor: not-allowed;
    pointer-events: none;
  }
  /* only the first right-aligned item gets the auto margin */
  .menu > :is(.align-right, .dropdown.align-right) {
    margin-inline-start: auto;
  }
  .menu
    > :is(.align-right, .dropdown.align-right)
    + :is(.align-right, .dropdown.align-right) {
    margin-inline-start: 0;
  }
  .menu > .separator {
    width: 1px;
    height: 1.2em;
    background-color: var(--nav-separator-color, currentColor);
    opacity: 0.3;
    margin: var(--nav-separator-margin, 0 0.25em);
  }
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
    transition:
      opacity 0.15s,
      color 0.15s;
  }
  .dropdown > div:first-child > button :global(svg) {
    transition: transform 0.2s ease;
  }
  /* the row tints its background on hover, but the caret is a separate target within it, so
     it recolors on its own to say the arrow itself is what opens the section. currentColor
     last: --nav-link-active-color has no default, and an unset one would make `color`
     invalid at computed-value time and inherit rather than drop out. */
  .dropdown > div:first-child > button:hover {
    opacity: 1;
    color: var(
      --nav-dropdown-toggle-hover-color,
      var(--nav-link-active-color, currentColor)
    );
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
    min-width: var(--nav-dropdown-min-width, 100%);
    max-width: var(--nav-dropdown-max-width, none);
    width: var(--nav-dropdown-width, max-content);
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
  /* on desktop the links are direct items of the popover; only mobile gives this
     wrapper a box of its own */
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
  .burger {
    display: none;
    /* set `absolute` (with --nav-mobile-menu-position) for embedded demos: two fixed Navs
       pin two burgers to the same corner and the top one wins every tap */
    position: var(--nav-burger-position, fixed);
    top: 1rem;
    inset-inline-start: 1rem;
    flex-direction: column;
    justify-content: space-around;
    /* sized to match Toc's mobile toggle — the only other pinned mobile chrome */
    width: var(--nav-burger-size, 1.4rem);
    height: var(--nav-burger-size, 1.4rem);
    box-sizing: content-box;
    padding: var(--nav-burger-padding, 0.3rem);
    /* opaque chip like Toc's toggle: pinned over scrolling content, a transparent button
       leaves the bars on whatever text passes beneath */
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
  /* height/3 is the exact gap between adjacent bar centres under `space-around`, so both
     strokes land on the centre line; a hardcoded 0.4rem left them ~1px shy of meeting */
  .burger[aria-expanded='true'] span:first-child {
    transform: translateY(calc(var(--nav-burger-size, 1.4rem) / 3)) rotate(45deg);
  }
  .burger[aria-expanded='true'] span:nth-child(2) {
    opacity: 0;
  }
  .burger[aria-expanded='true'] span:nth-child(3) {
    transform: translateY(calc(var(--nav-burger-size, 1.4rem) / -3)) rotate(-45deg);
  }
  /* .mobile is set in JS from the breakpoint prop, not a media query */
  nav.mobile .burger {
    display: flex;
  }
  nav.mobile .menu {
    position: var(--nav-mobile-menu-position, fixed);
    top: 3rem;
    /* hug the content beside the burger rather than spanning the viewport: a full-width bar
       of empty space reads as broken layout. Set --nav-mobile-inset to a single value like
       `0.5rem` for the full-width bar. */
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
    /* wrapping would spill entries into a second column off the panel once several
       submenus are expanded */
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
  /* both selectors paint a row's highlight, so padding must land on both or neither —
     padding `.dropdown` itself grew the row around the pill, not the pill */
  nav.mobile :is(.menu > span, .dropdown > div:first-child) {
    padding: 1pt 8pt;
  }
  /* make the whole pill tappable: flex:1 only fills the content box, so the negative margin
     pulls the link out over the span's padding, which would otherwise be a dead band. The
     padding stays on the span so a custom `item` snippet still gets it. */
  nav.mobile .menu > span > a {
    flex: 1;
    margin: -1pt -8pt;
    padding: 1pt 8pt;
  }
  /* same pull-out, inline-start only (the chevron owns the other end): the link's own
     --nav-item-padding stacked on the row's and indented every expandable entry */
  nav.mobile .dropdown > div:first-child > :is(a, span) {
    margin-inline-start: -8pt;
    padding-inline-start: 8pt;
  }
  nav.mobile .menu > .separator {
    width: 100%;
    height: 1px;
    margin: var(--nav-separator-margin, 0.25em 0);
  }
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
    /* the caret is the only way to open a section, so give it the largest tap target: full
       row height, and negative margins running it out to the row's painted edge (the
       padding puts back what they take, keeping the glyph in place) */
    align-self: stretch;
    margin: -1pt -8pt -1pt 0;
    padding: 1pt 8pt 1pt 14pt;
    border-radius: var(--nav-border-radius);
    opacity: 0.6;
  }
  /* :hover here too, or this selector's extra `nav.mobile` outranks the shared hover rule
     and pins the caret back to 0.6 */
  nav.mobile .dropdown > div:first-child > button:is(.open, :hover) {
    opacity: 1;
  }
  /* `display: none` can't transition, so collapse via a 0fr grid row + fade. `visibility`
     keeps the still-mounted links out of the tab order. */
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
  /* the animated row. Its top gap is padding that opens with it: `min-height: 0` zeroes the
     row's content but not its padding, so a static 2pt would leave a sliver when collapsed. */
  nav.mobile .submenu-inner {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-top: 0;
    transition: padding-top var(--nav-submenu-duration, 0.25s) ease;
    /* one rule down the whole section, not one per link: per-link borders leave a notch
       under the section's opening padding instead of a single stroke. Its own colour, since
       --nav-surface-border is tuned for a panel edge over the page, not a rule over the
       panel's fill. */
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
    /* matches the top-level rows; an inherited 1.6 made child rows taller than their parent */
    line-height: 1.3;
    /* pull the link's border onto the wrapper's guide line so the active row recolours a
       segment of it rather than drawing a second line beside it (hence the equal width) */
    margin-inline-start: -1px;
    border-inline-start: 1px solid transparent;
    font-size: 0.9em;
  }
  nav.mobile .dropdown > div:last-child a[aria-current='page'] {
    border-inline-start-color: var(--nav-link-active-color, currentColor);
  }
  nav.mobile .menu > :is(.align-right, .dropdown.align-right) {
    margin-inline-start: 0;
  }
</style>
