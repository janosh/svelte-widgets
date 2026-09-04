import { Nav } from '$lib'
import type { NavRoute, NavRouteObject } from '$lib/types'
import { type ComponentProps, mount, tick } from 'svelte'
import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest'
import { doc_query } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

vi.mock(`$app/state`, () => ({ page: { url: { pathname: `/` } } }))

describe(`Nav`, () => {
  const default_routes = [`/`, `/about`, `/contact`]
  const single_dropdown_route: NavRoute[] = [[`/parent`, [`/parent`, `/parent/child`]]]
  const two_dropdown_routes: NavRoute[] = [
    [`/first`, [`/first`, `/first/child`]],
    [`/second`, [`/second`, `/second/child`]],
  ]
  const parent_other: NavRoute[] = [...single_dropdown_route, [`/other`, [`/other`]]]
  // two submenu links, so Tab/ArrowDown have somewhere to move
  const two_child_route: NavRoute[] = [[`/p`, [`/p`, `/p/child1`, `/p/child2`]]]
  const one_child_route: NavRoute[] = [[`/p`, [`/p`, `/p/1`]]]
  const two_child_props = { routes: two_child_route }
  const mount_nav = (props: ComponentProps<typeof Nav>) =>
    mount(Nav, { target: document.body, props })
  const click = (el?: Element | null) => {
    el?.dispatchEvent(new MouseEvent(`click`, { bubbles: true, cancelable: true }))
    return tick()
  }
  const keydown = (key: string, target: EventTarget = globalThis) =>
    target.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
  const escape = async () => {
    keydown(`Escape`)
    await tick()
  }
  const mouse_enter = (el?: Element | null) =>
    el?.dispatchEvent(new MouseEvent(`mouseenter`, { bubbles: true }))
  const mouse_leave = (el?: Element | null) =>
    el?.dispatchEvent(new MouseEvent(`mouseleave`, { bubbles: true }))
  const focus_in = (el: Element) =>
    el.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
  const focus_out = (el: Element, relatedTarget: EventTarget | null) =>
    el.dispatchEvent(new FocusEvent(`focusout`, { bubbles: true, relatedTarget }))
  // the attachment dismisses on the press, not the click
  const click_outside = async () => {
    const outside = document.createElement(`div`)
    document.body.append(outside)
    outside.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
    await tick()
    outside.remove()
  }
  // flush a macrotask (focus moves inside setTimeout(..., 0) in the component)
  const next_task = () => new Promise((resolve) => void setTimeout(resolve, 0))
  const set_window_width = (width: number) =>
    Object.defineProperty(globalThis, `innerWidth`, { value: width, writable: true })
  afterEach(() => set_window_width(1024)) // reset any per-test viewport override
  const is_visible = (element: Element) => element.classList.contains(`visible`)
  const query_dropdown_elements = () => {
    const dropdown = doc_query(`.dropdown`)
    const dropdown_menu = dropdown.querySelector<HTMLElement>(`[data-submenu]`)
    assert(dropdown_menu !== null, `No dropdown menu found`)
    return { dropdown, dropdown_menu }
  }
  const mount_dropdown = (props: Partial<ComponentProps<typeof Nav>> = {}) => {
    mount_nav({ routes: single_dropdown_route, ...props })
    const { dropdown, dropdown_menu } = query_dropdown_elements()
    const toggle = dropdown.querySelector<HTMLElement>(`[data-dropdown-toggle]`)
    assert(toggle !== null, `No dropdown toggle found`)
    return { dropdown, dropdown_menu, toggle }
  }
  const query_all_dropdowns = () =>
    [...document.querySelectorAll(`.dropdown`)].map((dropdown) => {
      const menu = dropdown.querySelector<HTMLElement>(`[data-submenu]`)
      assert(menu !== null, `No dropdown menu found`)
      return { dropdown, menu }
    })

  test(`burger menu has accessible structure and closes on Escape or link click`, async () => {
    const link_props = { onclick: vi.fn() }
    // stopPropagation keeps Escape from reaching <svelte:window>, so the menu can only
    // still close if menu_props.onkeydown is chained on the .menu element itself
    const menu_props = {
      onkeydown: vi.fn((event: KeyboardEvent) => event.stopPropagation()),
    }
    mount_nav({ routes: default_routes, link_props, menu_props })
    const [button, menu] = [doc_query(`.burger`), doc_query(`.menu`)]
    const panel_id = button.getAttribute(`aria-controls`)

    expect(button.tagName).toBe(`BUTTON`)
    expect(button.getAttribute(`aria-label`)).toBe(`Toggle navigation menu`)
    expect(button.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(button.querySelectorAll(`span`)).toHaveLength(3)
    expect(panel_id).toBeTypeOf(`string`)
    expect(menu.id).toBe(panel_id)
    expect(panel_id?.startsWith(`nav-menu-`)).toBe(true)
    expect(menu.getAttribute(`role`)).toBeNull()
    expect(menu.getAttribute(`tabindex`)).toBeNull()
    expect(menu.classList.contains(`open`)).toBe(false)

    await click(button)
    expect(button.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(menu.classList.contains(`open`)).toBe(true)

    keydown(`Escape`, menu)
    await tick()
    expect(button.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(menu.classList.contains(`open`)).toBe(false)
    expect(menu_props.onkeydown).toHaveBeenCalledOnce()

    await click(button)
    await click(doc_query(`a`))
    expect(button.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(link_props.onclick).toHaveBeenCalledOnce()
  })

  test(`applies custom props and chains the burger click`, async () => {
    const onclick = vi.fn()
    const burger_props = {
      style: `opacity: 0.5`,
      class: `custom-burger`,
      'aria-label': `Open site menu`,
      onclick,
    } satisfies NonNullable<ComponentProps<typeof Nav>[`burger_props`]>
    Reflect.set(burger_props, `type`, `submit`)
    Reflect.set(burger_props, `aria-expanded`, true)
    Reflect.set(burger_props, `aria-controls`, `wrong-panel`)
    // component-owned keys the nested bags must not be able to replace: a shared bag
    // cannot carry a per-route href, and the menu's id is the burger's aria-controls
    const menu_props = { style: `background: red;`, class: `custom-menu` }
    Reflect.set(menu_props, `id`, `wrong-panel`)
    const link_props = { class: `custom-link` }
    Reflect.set(link_props, `href`, `/hijacked`)
    Reflect.set(link_props, `aria-current`, `page`)
    mount_nav({
      routes: default_routes,
      class: `custom-class`,
      page: { url: { pathname: `/` } },
      menu_props,
      link_props,
      burger_props,
    })
    const [nav, menu, burger] = [
      doc_query(`nav`),
      doc_query(`.menu`),
      doc_query(`.burger`),
    ]
    expect(nav.classList.contains(`custom-class`)).toBe(true)
    expect(menu.getAttribute(`style`)).toBe(`background: red;`)
    // consumer class merges with the component's own rather than replacing it
    expect([...menu.classList]).toContain(`custom-menu`)
    expect([...menu.classList]).toContain(`menu`)
    expect(menu.id).toBe(burger.getAttribute(`aria-controls`))
    expect(menu.id.startsWith(`nav-menu-`)).toBe(true)
    expect(burger.classList.contains(`custom-burger`)).toBe(true)
    expect(burger.getAttribute(`style`)).toBe(`opacity: 0.5;`)
    expect([
      burger.getAttribute(`type`),
      burger.getAttribute(`aria-label`),
      burger.getAttribute(`aria-expanded`),
      burger.getAttribute(`aria-controls`),
    ]).toEqual([`button`, `Open site menu`, `false`, menu.id])

    const links = [...document.querySelectorAll(`.menu a`)]
    expect(links.map((link) => link.getAttribute(`href`))).toEqual(default_routes)
    // aria-current still tracks the active route instead of marking every link
    expect(links.map((link) => link.getAttribute(`aria-current`))).toEqual([
      `page`,
      null,
      null,
    ])
    links.forEach((link) => expect([...link.classList]).toContain(`custom-link`))

    await click(burger)
    expect(burger.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(onclick).toHaveBeenCalledOnce()
  })

  test.each([
    [
      `tuple routes with custom labels`,
      [
        [`/`, `Home`],
        [`/about`, `About Us`],
        [`/contact`, `Get In Touch`],
      ] satisfies NavRoute[],
      [`Home`, `About Us`, `Get In Touch`],
    ],
    [
      `mixed routes`,
      [`/`, [`/about`, `About Page`], `/contact`] satisfies NavRoute[],
      [`Home`, `About Page`, `contact`],
    ],
    [`empty routes`, [], []],
    [`HTML labels`, [[`/home`, `<strong>Home</strong>`]] satisfies NavRoute[], [`Home`]],
    [
      `special chars`,
      [`/path?query=test`, `/path#anchor`],
      [`path?query=test`, `path#anchor`],
    ],
  ])(`handles %s`, (_desc, routes, expected_content) => {
    mount_nav({ routes })
    const links = document.querySelectorAll(`a`)
    expect(links).toHaveLength(expected_content.length)
    expect(Array.from(links).map((link) => link.textContent?.trim())).toEqual(
      expected_content,
    )
  })

  // exact / prefix / root special-case, plus the hyphenated false-prefix trap
  test.each([
    [`/about`, `/about`, `page`],
    [`/about/team`, `/about`, `page`],
    [`/contact`, `/about`, null],
    [`/`, `/`, `page`],
    [`/home`, `/`, null],
    [`/some-page-v2`, `/some-page`, null], // must not match via startsWith alone
    [`/some-page`, `/some-page-v2`, null],
  ])(`aria-current: pathname=%s link=%s -> %s`, (pathname, link_href, expected) => {
    mount_nav({ routes: [link_href], page: { url: { pathname } } })
    expect(doc_query(`a[href="${link_href}"]`).getAttribute(`aria-current`)).toBe(
      expected,
    )
  })

  test(`click outside closes burger menu and dropdowns, inside click does not`, async () => {
    const add_listener = vi.spyOn(document, `addEventListener`)
    const press_listeners = () =>
      add_listener.mock.calls.filter(([type]) => type === `pointerdown`).length
    const { dropdown_menu, toggle } = mount_dropdown()
    const burger_button = doc_query(`.burger`)
    // nothing open means no listener: it does a layout read on every press on the page
    expect(press_listeners()).toBe(0)

    await click(burger_button)
    expect(press_listeners()).toBe(1)
    await click(toggle)
    expect(burger_button.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(is_visible(dropdown_menu)).toBe(true)

    // Click inside the menu should not close it
    await click(doc_query(`.menu`))
    expect(burger_button.getAttribute(`aria-expanded`)).toBe(`true`)

    // Click outside should close both
    await click_outside()
    expect(burger_button.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(is_visible(dropdown_menu)).toBe(false)

    // an open dropdown arms the listener on its own, with the burger menu shut
    const listeners_before = press_listeners()
    await click(toggle)
    expect(is_visible(dropdown_menu)).toBe(true)
    expect(press_listeners()).toBe(listeners_before + 1)
    await click_outside()
    expect(is_visible(dropdown_menu)).toBe(false)
  })

  test(`parent link and toggle button work independently`, async () => {
    const { dropdown, dropdown_menu, toggle } = mount_dropdown({
      routes: [[`/p`, [`/p`, `/p/c`]]],
    })
    const parent_link = dropdown.querySelector<HTMLElement>(`div:first-child > a`)

    await click(parent_link)
    expect(is_visible(dropdown_menu)).toBe(false)

    await click(toggle)
    expect(is_visible(dropdown_menu)).toBe(true)

    await click(toggle)
    expect(is_visible(dropdown_menu)).toBe(false)
  })

  test.each([
    [`/plot-color-bar`, `plot color bar`, undefined],
    [`/`, `Home`, undefined],
    [
      `/hook-up-to-api`,
      `Hook up to external API`,
      {
        '/hook-up-to-api': `Hook up to external API`,
      },
    ],
  ])(`format_label: %s -> "%s"`, (route, expected, route_labels) => {
    mount_nav({ routes: [route], route_labels })
    const link = doc_query(`a[href="${route}"]`)
    expect(link.textContent?.trim()).toBe(expected)
    // format_label deliberately sets text-transform, but only for derived labels
    expect(link.getAttribute(`style`)).toBe(
      route_labels ? `` : `text-transform: capitalize;`,
    )
  })

  test.each<[string, NavRoute[], string, string | null, string, string[]]>([
    // [description, routes, expected trigger tag, expected href, expected label, expected children]
    [
      `not a link when parent page does not exist`,
      [[`/how-to`, [`/how-to/guide-1`, `/how-to/guide-2`]]],
      `SPAN`,
      null,
      `how to`,
      [`/how-to/guide-1`, `/how-to/guide-2`],
    ],
    [
      `a link when parent page exists`,
      [[`/docs`, [`/docs`, `/docs/intro`, `/docs/api`]]],
      `A`,
      `/docs`,
      `docs`,
      [`/docs/intro`, `/docs/api`],
    ],
  ])(`dropdown trigger is %s`, (_desc, routes, tag, href, label, children) => {
    mount_nav({ routes })
    const dropdown = doc_query(`.dropdown`)
    const selector = tag === `A` ? `div:first-child > a` : `div:first-child > span`
    const trigger = dropdown.querySelector(selector)
    assert(trigger !== null, `No dropdown trigger found`)
    expect(trigger.tagName).toBe(tag)
    expect(trigger.getAttribute(`href`)).toBe(href)
    expect(trigger.textContent?.trim()).toBe(label)
    const menu_links = Array.from(
      doc_query(`.dropdown [data-submenu]`).querySelectorAll(`a`),
    ).map((link) => link.getAttribute(`href`))
    expect(menu_links).toEqual(children)
  })

  // top-level aria-current cases miss dropdown parent + submenu child wiring
  test(`aria-current marks dropdown parent and matching child`, () => {
    mount_nav({ routes: parent_other, page: { url: { pathname: `/parent/child` } } })
    const [{ dropdown, menu }] = query_all_dropdowns()
    expect(
      dropdown.querySelector(`div:first-child > a`)?.getAttribute(`aria-current`),
    ).toBe(`page`)
    expect(menu.querySelector(`a`)?.getAttribute(`aria-current`)).toBe(`page`)
  })

  // `data-href` is the route href, so two Navs rendering the same route used to match each
  // other's dropdowns through a document-wide query and hand focus to the wrong instance.
  test(`two Navs on one page keep dropdown focus inside the instance that owns it`, async () => {
    mount_nav({ routes: two_child_route })
    mount_nav({ routes: two_child_route })
    const [first_nav, second_nav] = Array.from(document.querySelectorAll(`nav`))
    const links_of = (nav: Element) =>
      Array.from(nav.querySelectorAll<HTMLAnchorElement>(`.dropdown [data-submenu] a`))
    const first_links = links_of(first_nav)
    const second_links = links_of(second_nav)
    const second_toggle = second_nav.querySelector<HTMLElement>(`[data-dropdown-toggle]`)
    assert(second_toggle)

    keydown(`Enter`, second_toggle)
    await next_task()
    // opening focuses the first submenu link of *this* nav, not the first one in the document
    expect(document.activeElement).toBe(second_links[0])
    expect(first_links).not.toContain(document.activeElement)

    // arrows step within this nav's submenu only
    keydown(`ArrowDown`, second_links[0])
    expect(document.activeElement).toBe(second_links[1])

    // and Escape hands focus back to this nav's toggle, not the first nav's
    keydown(`Escape`, second_links[1])
    await next_task()
    expect(document.activeElement).toBe(second_toggle)
  })

  test(`keyboard navigation: Enter/ArrowDown open, arrows navigate, Escape closes`, async () => {
    const link_props = { onkeydown: vi.fn() }
    const { dropdown_menu: menu, toggle: toggle_button } = mount_dropdown({
      routes: two_child_route,
      link_props,
    })

    // Enter/Space share a branch; ArrowDown opens when closed — both focus the first item
    for (const open_key of [`Enter`, `ArrowDown`]) {
      keydown(open_key, toggle_button)
      // deno-lint-ignore no-await-in-loop
      await next_task() // wait for DOM focus
      expect(is_visible(menu)).toBe(true)
      expect(document.activeElement).toBe(menu.querySelector(`a`))
      keydown(`Escape`)
    }

    // Arrow navigation: keys land on whichever element has focus, links included
    const [item1, item2] = Array.from(menu.querySelectorAll(`a`))
    keydown(`Enter`, toggle_button)
    await next_task()
    expect(document.activeElement).toBe(item1)
    keydown(`ArrowDown`, item1)
    expect(document.activeElement).toBe(item2)
    keydown(`ArrowDown`, item2)
    expect(document.activeElement).toBe(item1) // wraps
    keydown(`ArrowUp`, item1)
    expect(document.activeElement).toBe(item2)
    keydown(`Home`, item2)
    expect(document.activeElement).toBe(item1)

    // Escape from item returns focus to toggle button
    keydown(`Escape`, item1)
    await next_task()
    expect(is_visible(menu)).toBe(false)
    expect(document.activeElement).toBe(toggle_button)
    // consumer handler still sees every key that landed on a link
    expect(link_props.onkeydown).toHaveBeenCalledTimes(5)
  })

  test(`focus alone neither opens nor closes a dropdown`, async () => {
    const {
      dropdown,
      dropdown_menu: menu,
      toggle,
    } = mount_dropdown({
      routes: one_child_route,
    })

    focus_in(dropdown) // tabbing through the nav must not pop panels open
    await tick()
    expect(is_visible(menu)).toBe(false)

    await click(toggle)
    const external = document.createElement(`button`)
    document.body.append(external)
    focus_out(dropdown, external)
    await tick()
    // what a click opened, only a click (on the toggle or outside) or Escape closes
    expect(is_visible(menu)).toBe(true)
    external.remove()
  })

  test.each([
    [`/parent/child`, true],
    [`/parent`, true],
    [`/other`, false],
  ])(`dropdown active state: pathname=%s -> active=%s`, (pathname, is_active) => {
    mount_nav({ routes: parent_other, page: { url: { pathname } } })

    const [{ dropdown: dropdown1 }, { dropdown: dropdown2 }] = query_all_dropdowns()
    expect(dropdown1.classList.contains(`active`)).toBe(is_active)
    expect(dropdown2.classList.contains(`active`)).toBe(
      !is_active && pathname === `/other`,
    )
  })

  // Only the default anchor was wired to close_menus, so navigating from the burger menu
  // through a consumer's `link` snippet left the overlay on top of the new page.
  test(`a link snippet's anchor closes the burger menu`, async () => {
    mount(TestSnippetHarness, {
      target: document.body,
      props: {
        component: `nav`,
        routes: [`/`, `/about`],
        page: { url: { pathname: `/` } },
        breakpoint: 9999, // force the mobile layout
      },
    })
    const burger = doc_query<HTMLButtonElement>(`button.burger`)
    await click(burger)
    expect(burger.getAttribute(`aria-expanded`)).toBe(`true`)

    await click(doc_query(`[data-testid="nav-link"]`))
    expect(burger.getAttribute(`aria-expanded`)).toBe(`false`)
  })

  test(`item, link, and children snippets receive route and menu state`, async () => {
    const page = { url: { pathname: `/about` } }
    mount(TestSnippetHarness, {
      target: document.body,
      props: { component: `nav`, routes: [`/`, `/about`, `/contact`], page },
    })

    const links = [...document.querySelectorAll<HTMLElement>(`[data-testid="nav-link"]`)]
    expect(links).toHaveLength(3)
    expect(
      links.map((link) => [link.getAttribute(`href`), link.dataset.isActive]),
    ).toEqual([
      [`/`, `false`],
      [`/about`, `true`],
      [`/contact`, `false`],
    ])

    const items = [...document.querySelectorAll<HTMLElement>(`[data-testid="nav-item"]`)]
    expect(items).toHaveLength(3)
    expect(items[0].dataset.href).toBe(`/`)
    expect(items[0].dataset.active).toBe(`false`)
    expect(items[0].dataset.dropdown).toBe(`false`)
    expect(items[0].querySelector(`a`)?.getAttribute(`href`)).toBe(`/`)
    expect(items[1].dataset.href).toBe(`/about`)
    expect(items[1].dataset.active).toBe(`true`)
    expect(
      items[1].querySelector<HTMLElement>(`[data-testid="nav-link"]`)?.dataset.isActive,
    ).toBe(`true`)

    const children = doc_query(`[data-testid="nav-children"]`)
    expect(children.dataset.open).toBe(`false`)
    expect(children.dataset.panelId?.startsWith(`nav-menu-`)).toBe(true)
    expect(children.textContent?.trim()).toBe(`3 routes`)

    await click(doc_query(`.burger`))
    expect(children.dataset.open).toBe(`true`)
  })

  test.each<[string, ComponentProps<typeof Nav>[`labels`], string]>([
    [`the default toggle name`, undefined, `Toggle docs submenu`],
    [
      `a labels override`,
      { toggle_submenu: (route_label: string) => `${route_label} aufklappen` },
      `docs aufklappen`,
    ],
  ])(
    `dropdown accessibility uses native navigation links and labeled toggles, with %s`,
    (_case, labels, toggle_label) => {
      const { dropdown, dropdown_menu, toggle } = mount_dropdown({
        routes: [[`/docs`, [`/docs`, `/docs/intro`]]],
        labels,
      })
      const links = [...dropdown_menu.querySelectorAll(`a`)]
      // parent /docs is filtered out of the submenu
      expect(links.map((link) => link.getAttribute(`href`))).toEqual([`/docs/intro`])
      // native <a>/<nav> semantics, no explicit ARIA roles anywhere
      const roles = [dropdown, dropdown_menu, ...links].map((el) =>
        el.getAttribute(`role`),
      )
      expect(roles).toEqual([null, null, null])

      expect([
        toggle.tagName,
        toggle.getAttribute(`aria-label`),
        toggle.getAttribute(`aria-haspopup`),
      ]).toEqual([`BUTTON`, toggle_label, `true`])
    },
  )

  test(`renders object routes with href, label, class, and style`, () => {
    const routes: NavRoute[] = [
      { href: `/home`, label: `Home Page` },
      { href: `/about` },
      { href: `/styled`, class: `custom-nav-item`, style: `color: red` },
    ]
    mount_nav({ routes })
    const links = [...document.querySelectorAll(`a`)]
    expect(
      links.map((link) => [link.getAttribute(`href`), link.textContent?.trim()]),
    ).toEqual([
      [`/home`, `Home Page`],
      [`/about`, `about`],
      [`/styled`, `styled`],
    ])
    expect(links[2].classList.contains(`custom-nav-item`)).toBe(true)
    expect(links[2].getAttribute(`style`)).toContain(`color: red`)
  })

  test(`renders dropdown object route with trigger label, class, and children`, () => {
    const routes: NavRoute[] = [
      {
        href: `/docs`,
        label: `Documentation`,
        children: [`/docs/intro`, `/docs/api`],
        class: `docs-menu`,
      },
    ]
    mount_nav({ routes })
    const trigger = doc_query(`.dropdown span`)
    expect(trigger.textContent?.trim()).toBe(`Documentation`)
    expect(trigger.classList.contains(`docs-menu`)).toBe(true)
    const submenu_links = doc_query(`.dropdown`).querySelectorAll(`[data-submenu] a`)
    expect([...submenu_links].map((link) => link.getAttribute(`href`))).toEqual([
      `/docs/intro`,
      `/docs/api`,
    ])
  })

  describe(`disabled routes`, () => {
    test.each<[string, NavRoute, string]>([
      [`boolean true`, { href: `/page`, disabled: true }, `page`],
      [`string message`, { href: `/page`, disabled: `Not available` }, `page`],
      [
        `with custom label`,
        { href: `/admin`, label: `Admin Panel`, disabled: true },
        `Admin Panel`,
      ],
    ])(`disabled item with %s`, (_desc, route, expected_text) => {
      mount_nav({ routes: [route] })
      const disabled = doc_query(`.disabled`)
      expect(disabled.getAttribute(`aria-disabled`)).toBe(`true`)
      expect(disabled.textContent?.trim()).toBe(expected_text)
    })

    test(`disabled items apply custom class and style`, () => {
      const routes: NavRoute[] = [
        { href: `/test`, disabled: true, class: `my-disabled`, style: `opacity: 0.3` },
      ]
      mount_nav({ routes })
      const disabled = doc_query(`.disabled`)
      expect(disabled.classList.contains(`my-disabled`)).toBe(true)
      expect(disabled.getAttribute(`style`)).toContain(`opacity: 0.3`)
    })

    test(`clicking disabled item does not trigger onnavigate`, async () => {
      const on_navigate = vi.fn()
      const routes: NavRoute[] = [
        { href: `/home` },
        { href: `/disabled`, disabled: true },
        { href: `/disabled2`, disabled: `Coming soon` },
      ]
      mount_nav({ routes, onnavigate: on_navigate })
      await click(doc_query(`.disabled`))
      expect(on_navigate).not.toHaveBeenCalled()
      expect(document.querySelectorAll(`a`)).toHaveLength(1)
      expect(document.querySelectorAll(`.disabled`)).toHaveLength(2)
    })

    test(`disabled dropdown parent renders as span, not link`, () => {
      const routes: NavRoute[] = [
        { href: `/docs`, children: [`/docs`, `/docs/intro`], disabled: true },
      ]
      mount_nav({ routes })
      const dropdown = doc_query(`.dropdown`)
      // `:scope` so these match the dropdown's own row/submenu, not a nested wrapper
      const parent_span = dropdown.querySelector(
        `:scope > div:first-child > span.disabled`,
      )
      expect(parent_span?.getAttribute(`aria-disabled`)).toBe(`true`)
      expect(dropdown.querySelector(`:scope > div:first-child > a`)).toBeNull() // no parent link
      // dropdown children stay accessible
      expect(
        dropdown.querySelector(`:scope > div:last-child`)?.querySelectorAll(`a`),
      ).toHaveLength(1)
    })
  })

  describe(`separators`, () => {
    // standalone (`separator && !href`) and trailing (`href` + separator) are distinct branches
    test.each<[string, NavRoute[], { separators: number; links: number }]>([
      [
        `standalone separators`,
        [
          { href: `/home` },
          { separator: true },
          { href: `/about` },
          { separator: true },
          { href: `/contact` },
        ],
        { separators: 2, links: 3 },
      ],
      [
        `separator after items`,
        [
          { href: `/home`, separator: true },
          { href: `/about`, separator: true },
          { href: `/contact` },
        ],
        { separators: 2, links: 3 },
      ],
    ])(`%s`, (_desc, routes, expected) => {
      mount_nav({ routes })
      const separators = document.querySelectorAll(`.separator`)
      expect(separators).toHaveLength(expected.separators)
      separators.forEach((sep) => expect(sep.getAttribute(`role`)).toBe(`separator`))
      expect(document.querySelectorAll(`a`)).toHaveLength(expected.links)
    })

    test(`separator after dropdown`, () => {
      const routes: NavRoute[] = [
        { href: `/docs`, children: [`/docs/intro`], separator: true },
        { href: `/contact` },
      ]
      mount_nav({ routes })
      const separators = document.querySelectorAll(`.separator`)
      expect(separators).toHaveLength(1)
      // must sit between the dropdown and the item following it, not just exist
      expect(separators[0].previousElementSibling).toBe(doc_query(`.dropdown`))
      expect(separators[0].nextElementSibling?.querySelector(`a`)?.href).toContain(
        `/contact`,
      )
    })
  })

  test(`external links have target attrs and trigger onnavigate callback`, async () => {
    const on_navigate = vi.fn()
    const routes: NavRoute[] = [
      { href: `/internal` },
      { href: `https://github.com`, external: true },
      {
        href: `https://example.com`,
        external: true,
        class: `ext`,
        style: `color: blue`,
        label: `Link`,
      },
    ]
    mount_nav({ routes, onnavigate: on_navigate })
    const links = document.querySelectorAll(`a`)
    // internal link gets no target/rel, external ones do
    expect([0, 1, 2].map((idx) => links[idx].getAttribute(`target`))).toEqual([
      null,
      `_blank`,
      `_blank`,
    ])
    expect(links[0].getAttribute(`rel`)).toBeNull()
    expect(links[1].getAttribute(`rel`)).toBe(`noopener noreferrer`)
    // external link with custom props
    expect(links[2].textContent?.trim()).toBe(`Link`)
    expect(links[2].classList.contains(`ext`)).toBe(true)
    expect(links[2].getAttribute(`style`)).toContain(`color: blue`)
    await click(links[1])
    expect(on_navigate).toHaveBeenCalledWith(
      expect.objectContaining({ route: expect.objectContaining({ external: true }) }),
    )
  })

  test(`right-aligned items and dropdowns`, () => {
    const routes: NavRoute[] = [
      { href: `/home` },
      {
        href: `/settings`,
        align: `right`,
        class: `settings-link`,
        style: `font-weight: bold`,
      },
      { href: `/user`, children: [`/user/profile`], align: `right` },
    ]
    mount_nav({ routes })
    expect(document.querySelectorAll(`.align-right`)).toHaveLength(2)
    expect(doc_query(`.dropdown`).classList.contains(`align-right`)).toBe(true)
    const link = doc_query(`.align-right a`)
    expect(link.classList.contains(`settings-link`)).toBe(true)
    expect(link.getAttribute(`style`)).toContain(`font-weight: bold`)
  })

  describe(`callbacks`, () => {
    test(`onnavigate called with href, event, and route`, async () => {
      const on_navigate = vi.fn()
      const routes = [{ href: `/home`, icon: `gear`, count: 42 }]
      mount_nav({ routes, onnavigate: on_navigate })
      await click(doc_query(`a`))
      expect(on_navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          href: `/home`,
          event: expect.any(MouseEvent),
          route: expect.objectContaining({ href: `/home`, icon: `gear`, count: 42 }),
        }),
      )
    })

    test(`onnavigate returning false prevents default`, async () => {
      const on_navigate = vi.fn((): false => false)
      mount_nav({ routes: [`/home`], onnavigate: on_navigate })
      const event = new MouseEvent(`click`, { bubbles: true, cancelable: true })
      doc_query(`a`).dispatchEvent(event)
      await tick()
      expect(event.defaultPrevented).toBe(true)
    })

    test(`onnavigate fires for dropdown child links`, async () => {
      const on_navigate = vi.fn()
      mount_nav({
        routes: [{ href: `/docs`, children: [`/docs`, `/docs/intro`] }],
        onnavigate: on_navigate,
      })
      await click(doc_query(`a[href="/docs/intro"]`))
      expect(on_navigate).toHaveBeenCalledWith(
        expect.objectContaining({ href: `/docs/intro` }),
      )
    })

    test(`onopen and onclose callbacks on menu toggle`, async () => {
      const [on_open, on_close] = [vi.fn(), vi.fn()]
      set_window_width(500)

      mount_nav({
        routes: [`/home`],
        onopen: on_open,
        onclose: on_close,
        breakpoint: 767,
      })
      await tick()
      const burger = doc_query(`.burger`)

      await click(burger)
      await tick()
      expect(on_open).toHaveBeenCalledTimes(1)

      await click(burger)
      await tick()
      expect(on_close).toHaveBeenCalledTimes(1)
    })

    // No per-cause onclose test: one $effect watches is_open go true->false, covered above.
  })

  describe(`breakpoint prop`, () => {
    // `<= breakpoint` is the only rule; pin the boundary, the default, and the 0 escape
    test.each([
      [`at exact breakpoint`, 600, 600, true],
      [`above breakpoint`, 800, 600, false],
      [`default breakpoint 767`, 766, undefined, true],
      [`breakpoint 0 = always desktop`, 1, 0, false],
    ])(
      `%s: width=%d, breakpoint=%s -> mobile=%s`,
      async (_desc, width, breakpoint, expected_mobile) => {
        set_window_width(width)
        mount_nav({ routes: [`/home`], ...(breakpoint !== undefined && { breakpoint }) })
        await tick()
        expect(doc_query(`nav`).classList.contains(`mobile`)).toBe(expected_mobile)
      },
    )

    test(`re-evaluates mobile mode when the window resizes`, async () => {
      mount_nav({ routes: [`/home`] })
      await tick()
      set_window_width(500)
      globalThis.dispatchEvent(new Event(`resize`))
      await tick()
      expect(doc_query(`nav`).classList.contains(`mobile`)).toBe(true)
    })
  })

  test(`handles all route formats together with all features`, () => {
    const routes: NavRoute[] = [
      `/simple`,
      [`/tuple`, `Tuple Label`],
      { separator: true },
      [`/docs`, [`/docs`, `/docs/api`]],
      { href: `/object`, label: `Object Label` },
      { href: `/disabled`, disabled: `Login required` },
      { href: `/settings`, align: `right` },
      { href: `https://github.com`, external: true, align: `right` },
    ]
    mount_nav({ routes })
    const links = document.querySelectorAll(`a`)
    // route order preserved, dropdown parent link precedes its submenu link
    expect([...links].map((link) => link.getAttribute(`href`)).join(` `)).toBe(
      `/simple /tuple /docs /docs/api /object /settings https://github.com`,
    )
    expect(document.querySelectorAll(`.separator`)).toHaveLength(1)
    expect(document.querySelectorAll(`.disabled`)).toHaveLength(1)
    expect(document.querySelectorAll(`.align-right`)).toHaveLength(2)
    expect(document.querySelectorAll(`.dropdown`)).toHaveLength(1)
  })

  describe(`dropdowns open on click, never on hover`, () => {
    test(`click toggles the dropdown and aria-expanded`, async () => {
      const { dropdown_menu, toggle } = mount_dropdown()

      expect(is_visible(dropdown_menu)).toBe(false)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)

      await click(toggle)
      expect(is_visible(dropdown_menu)).toBe(true)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)

      await click(toggle)
      expect(is_visible(dropdown_menu)).toBe(false)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)
    })

    test(`hover neither opens nor closes a dropdown`, async () => {
      vi.useFakeTimers()
      const { dropdown, dropdown_menu, toggle } = mount_dropdown()

      // pointing at a nav entry used to pop its panel open over the page
      mouse_enter(dropdown)
      await vi.advanceTimersByTimeAsync(500)
      expect(is_visible(dropdown_menu)).toBe(false)

      await click(toggle)
      // ...and moving off used to close it, so a tap's synthetic mouseleave undid the tap
      mouse_leave(dropdown)
      await vi.advanceTimersByTimeAsync(500)
      expect(is_visible(dropdown_menu)).toBe(true)
      vi.useRealTimers()
    })

    test.each([
      [`click outside`, click_outside],
      [
        `child route click`,
        async (menu: HTMLElement) => {
          await click(menu.querySelector<HTMLElement>(`a`))
        },
      ],
      [`Escape key`, escape],
    ])(`an open dropdown closes on %s`, async (_trigger, close_action) => {
      const { dropdown_menu, toggle } = mount_dropdown()
      await click(toggle)
      expect(is_visible(dropdown_menu)).toBe(true)
      await close_action(dropdown_menu)
      expect(is_visible(dropdown_menu)).toBe(false)
    })

    // one dropdown at a time: opening the second has to close the first
    test(`opening a second dropdown closes the first`, async () => {
      mount_nav({ routes: two_dropdown_routes })
      const [{ dropdown: dropdown1, menu: menu1 }, { dropdown: dropdown2, menu: menu2 }] =
        query_all_dropdowns()

      await click(dropdown1.querySelector(`[data-dropdown-toggle]`))
      expect(is_visible(menu1)).toBe(true)

      await click(dropdown2.querySelector(`[data-dropdown-toggle]`))
      expect(is_visible(menu1)).toBe(false)
      expect(is_visible(menu2)).toBe(true)
    })

    // Enter/Space share one branch; ArrowDown opens when closed via another
    test.each([`Enter`, `ArrowDown`])(`keyboard %s opens the dropdown`, async (key) => {
      const { dropdown_menu, toggle } = mount_dropdown()

      keydown(key, toggle)
      await next_task()
      expect(is_visible(dropdown_menu)).toBe(true)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
    })

    test(`ArrowDown on the toggle of an open dropdown navigates into it`, async () => {
      const { dropdown_menu, toggle } = mount_dropdown(two_child_props)

      await click(toggle)
      expect(is_visible(dropdown_menu)).toBe(true)

      // ArrowDown navigates instead of closing; the focus move is in a setTimeout(.., 0)
      keydown(`ArrowDown`, toggle)
      await next_task()
      expect(is_visible(dropdown_menu)).toBe(true)
      expect(document.activeElement).toBe(dropdown_menu.querySelector(`a`))
    })

    test(`Escape on a submenu link closes it for good and restores focus`, async () => {
      const { dropdown_menu, toggle } = mount_dropdown(two_child_props)

      await click(toggle)
      const first_link = doc_query<HTMLAnchorElement>(`[data-submenu] a`)
      first_link.focus()
      keydown(`Escape`, first_link)
      await next_task()

      expect(document.activeElement).toBe(toggle)
      expect(is_visible(dropdown_menu)).toBe(false)
    })

    test(`Tab cycles within an open submenu instead of leaving it`, async () => {
      const { dropdown_menu } = mount_dropdown(two_child_props)

      await click(doc_query(`[data-dropdown-toggle]`))
      const links = [...dropdown_menu.querySelectorAll(`a`)]
      expect(links).toHaveLength(2)

      links[0].focus()
      keydown(`Tab`, links[0])
      expect(document.activeElement).toBe(links[1])
      keydown(`Tab`, links[1])
      expect(document.activeElement).toBe(links[0])
    })

    test(`an open dropdown stays open on focus out`, async () => {
      const { dropdown, dropdown_menu } = mount_dropdown({ routes: two_child_route })

      await click(doc_query(`[data-dropdown-toggle]`))
      expect(is_visible(dropdown_menu)).toBe(true)

      // focus moving inside or fully out: dropdowns close on click-outside/Escape only
      for (const related of [
        dropdown_menu.querySelector(`a`),
        document.createElement(`button`),
      ]) {
        focus_out(dropdown, related)
        // deno-lint-ignore no-await-in-loop
        await tick()
        expect(is_visible(dropdown_menu)).toBe(true)
      }
    })

    test(`open dropdown clears when burger menu closes`, async () => {
      set_window_width(500)
      const { dropdown_menu, toggle } = mount_dropdown({ breakpoint: 767 })
      await tick()
      const burger = doc_query(`.burger`)

      await click(burger)
      await click(toggle)
      expect(is_visible(dropdown_menu)).toBe(true)

      await escape()
      expect(burger.getAttribute(`aria-expanded`)).toBe(`false`)
      expect(is_visible(dropdown_menu)).toBe(false)
    })
  })

  // Regression tests: JSON.stringify crashes on BigInt, functions, circular refs
  describe(`non-serializable route properties`, () => {
    const circular_route: NavRoute = { href: `/circular` }
    circular_route.self = circular_route

    test.each<[string, NavRouteObject[]]>([
      [`BigInt`, [{ href: `/a`, custom_id: BigInt(123) }, { href: `/b` }]],
      [`function`, [{ href: `/a`, on_custom: () => {} }, { href: `/b` }]],
      [`circular reference`, [circular_route, { href: `/b` }]],
    ])(`handles routes with %s properties without crashing`, (_desc, routes) => {
      expect(() => mount_nav({ routes })).not.toThrow()
      // hrefs, not just a count: an exotic prop must not derail label/href parsing
      expect(
        [...document.querySelectorAll(`a`)].map((link) => link.getAttribute(`href`)),
      ).toEqual(routes.map((route) => route.href))
    })
  })

  describe(`tooltips`, () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())
    const open_tooltip = async (selector: string): Promise<void> => {
      await tick()
      doc_query(selector).dispatchEvent(
        new PointerEvent(`pointerover`, { bubbles: true, pointerType: `mouse` }),
      )
      await vi.advanceTimersByTimeAsync(0)
    }

    test.each([
      [
        `tooltips prop keyed by href`,
        [`/about`],
        { '/about': `About the site` },
        `a[href="/about"]`,
        `About the site`,
      ],
      [
        `route.tooltip takes precedence over tooltips prop`,
        [{ href: `/about`, tooltip: `Route tooltip` }],
        { '/about': `Map tooltip` },
        `a[href="/about"]`,
        `Route tooltip`,
      ],
      [
        `string disabled renders as tooltip and beats route.tooltip`,
        [{ href: `/soon`, tooltip: `ignored`, disabled: `Coming soon` }],
        undefined,
        `span.disabled`,
        `Coming soon`,
      ],
    ] as [string, NavRoute[], Record<string, string> | undefined, string, string][])(
      `%s`,
      async (_desc, routes, tooltips, selector, expected_content) => {
        mount_nav({ routes, tooltips, tooltip_options: { open_delay_ms: 0 } })
        await open_tooltip(selector)

        expect(
          document.querySelector(`.custom-tooltip .tooltip-content`)?.textContent,
        ).toBe(expected_content)
      },
    )

    test(`shared tooltip_options merge with per-route options taking precedence`, async () => {
      mount_nav({
        routes: [`/docs`],
        tooltips: { '/docs': { content: `Docs tooltip`, show_arrow: false } },
        tooltip_options: { open_delay_ms: 0, show_arrow: true, placement: `right` },
      })
      await open_tooltip(`a[href="/docs"]`)
      // placement from shared tooltip_options still applies
      expect(doc_query(`.custom-tooltip`).getAttribute(`data-placement`)).toBe(`right`)
      // per-route arrow option wins over the shared setting
      expect(document.querySelector(`.custom-tooltip-arrow`)).toBeNull()
    })
  })
})
