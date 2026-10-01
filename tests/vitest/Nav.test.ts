import { Nav } from '$lib'
import type { NavRoute, NavLink } from '$lib/types'
import { type ComponentProps, createRawSnippet, tick } from 'svelte'
import { fromStore, writable } from 'svelte/store'
import { assert, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { click, doc_query, next_task, press_key, render, stub_props } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

describe(`Nav`, () => {
  const default_routes = [
    { href: `/`, label: `Home` },
    { href: `/about`, label: `about` },
    { href: `/contact`, label: `contact` },
  ]
  const single_dropdown_route: NavRoute[] = [
    {
      href: `/parent`,
      label: `parent`,
      children: [{ href: `/parent/child`, label: `child` }],
    },
  ]
  const two_dropdown_routes: NavRoute[] = [
    {
      href: `/first`,
      label: `first`,
      children: [{ href: `/first/child`, label: `child` }],
    },
    {
      href: `/first`, // two groups may link to the same destination
      label: `second`,
      children: [{ href: `/second/child`, label: `child` }],
    },
  ]
  const parent_other: NavRoute[] = [
    ...single_dropdown_route,
    { href: `/other`, label: `other`, children: [] },
  ]
  // two submenu links, so Tab/ArrowDown have somewhere to move
  const two_child_route: NavRoute[] = [
    {
      href: `/p`,
      label: `p`,
      children: [
        { href: `/p/child1`, label: `child1` },
        { href: `/p/child2`, label: `child2` },
      ],
    },
  ]
  const mount_nav = (props: ComponentProps<typeof Nav>) => render(Nav, props)
  const hrefs = (root: ParentNode = document) =>
    [...root.querySelectorAll(`a`)].map((link) => link.getAttribute(`href`))
  const pointer_event = (element: Element, type: string, pointer_type = `mouse`) =>
    element.dispatchEvent(new PointerEvent(type, { pointerType: pointer_type }))
  const open_dropdown = async (dropdown: Element, interaction: string) => {
    if (interaction === `click`)
      await click(dropdown.querySelector(`[data-dropdown-toggle]`))
    else {
      pointer_event(dropdown, `pointerenter`)
      await tick()
    }
  }
  // the attachment dismisses on the press, not the click
  const click_outside = async () => {
    const outside = document.createElement(`div`)
    document.body.append(outside)
    outside.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
    await tick()
    outside.remove()
  }
  // undone when the test finishes
  const set_window_width = (width: number) =>
    stub_props(globalThis, { innerWidth: width })
  const is_visible = (element: Element) => element.classList.contains(`visible`)
  const mount_dropdown = (props: Partial<ComponentProps<typeof Nav>> = {}) => {
    mount_nav({ routes: single_dropdown_route, ...props })
    return {
      dropdown: doc_query(`.dropdown`),
      submenu: doc_query(`.dropdown [data-submenu]`),
      toggle: doc_query(`.dropdown [data-dropdown-toggle]`),
    }
  }
  const query_all_dropdowns = () =>
    [...document.querySelectorAll(`.dropdown`)].map((dropdown) => {
      const submenu = dropdown.querySelector<HTMLElement>(`[data-submenu]`)
      assert(submenu !== null, `No dropdown menu found`)
      return { dropdown, submenu }
    })
  test(`burger menu is accessible, closes on Escape or link click, fires on_open/on_close`, async () => {
    const [on_open, on_close] = [vi.fn(), vi.fn()]
    const link_props = { onclick: vi.fn() }
    // stopPropagation keeps Escape from reaching <svelte:window>, so the menu can only
    // still close if menu_props.onkeydown is chained on the .menu element itself
    const menu_props = {
      onkeydown: vi.fn((event: KeyboardEvent) => event.stopPropagation()),
    }
    mount_nav({ routes: default_routes, link_props, menu_props, on_open, on_close })
    const [button, menu] = [doc_query(`.burger`), doc_query(`.menu`)]
    const state = () => [
      button.getAttribute(`aria-expanded`),
      menu.classList.contains(`open`),
    ]
    expect([
      button.tagName,
      button.getAttribute(`aria-label`),
      button.querySelectorAll(`span`).length,
      menu.getAttribute(`role`),
      menu.getAttribute(`tabindex`),
    ]).toEqual([`BUTTON`, `Toggle navigation menu`, 3, null, null])
    expect(menu.id).toBe(button.getAttribute(`aria-controls`))
    expect(menu.id).toMatch(/^nav-menu-/u)
    expect(state()).toEqual([`false`, false])
    await click(button)
    expect(state()).toEqual([`true`, true])
    press_key(menu, `Escape`)
    await tick()
    expect(state()).toEqual([`false`, false])
    expect(menu_props.onkeydown).toHaveBeenCalledOnce()
    await click(button)
    await click(doc_query(`a`))
    expect(state()).toEqual([`false`, false])
    expect(link_props.onclick).toHaveBeenCalledOnce()
    // one call per open/close transition and none on mount
    expect([on_open.mock.calls.length, on_close.mock.calls.length]).toEqual([2, 2])
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
      pathname: `/`,
      menu_props,
      link_props,
      burger_props,
    })
    const [menu, burger] = [doc_query(`.menu`), doc_query(`.burger`)]
    expect(doc_query(`nav`).classList).toContain(`custom-class`)
    expect(menu.getAttribute(`style`)).toBe(`background: red;`)
    // consumer class merges with the component's own rather than replacing it
    expect([...menu.classList]).toEqual(expect.arrayContaining([`menu`, `custom-menu`]))
    expect(menu.id).toMatch(/^nav-menu-/u)
    expect(burger.classList).toContain(`custom-burger`)
    expect(burger.getAttribute(`style`)).toBe(`opacity: 0.5;`)
    expect([
      burger.getAttribute(`type`),
      burger.getAttribute(`aria-label`),
      burger.getAttribute(`aria-expanded`),
      burger.getAttribute(`aria-controls`),
    ]).toEqual([`button`, `Open site menu`, `false`, menu.id])
    const links = [...document.querySelectorAll(`.menu a`)]
    // aria-current still tracks the active route instead of marking every link
    expect(
      links.map((link) => [link.getAttribute(`href`), link.getAttribute(`aria-current`)]),
    ).toEqual([
      [`/`, `page`],
      [`/about`, null],
      [`/contact`, null],
    ])
    links.forEach((link) => expect(link.classList).toContain(`custom-link`))
    await click(burger)
    expect(burger.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(onclick).toHaveBeenCalledOnce()
  })
  test.each([
    [
      `explicit labels`,
      [
        { href: `/`, label: `Home` },
        { href: `/about`, label: `About Us` },
        { href: `/contact`, label: `Get In Touch` },
      ] satisfies NavRoute[],
      [`Home`, `About Us`, `Get In Touch`],
    ],
    [`empty routes`, [], []],
    [
      `HTML labels`,
      [{ href: `/home`, label: `<strong>Home</strong>` }] satisfies NavRoute[],
      [`<strong>Home</strong>`],
    ],
    [
      `special chars`,
      [
        { href: `/path?query=test`, label: `path?query=test` },
        { href: `/path#anchor`, label: `path#anchor` },
      ],
      [`path?query=test`, `path#anchor`],
    ],
  ])(`handles %s`, (_desc, routes, expected_content) => {
    mount_nav({ routes })
    expect(
      [...document.querySelectorAll(`a`)].map((link) => link.textContent?.trim()),
    ).toEqual(expected_content)
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
    mount_nav({ routes: [{ href: link_href, label: link_href }], pathname })
    expect(doc_query(`a[href="${link_href}"]`).getAttribute(`aria-current`)).toBe(
      expected,
    )
  })
  test(`click outside closes burger menu and dropdowns, inside click does not`, async () => {
    const { submenu, toggle } = mount_dropdown()
    // spied after mount, so the tooltip layer's own document listener is not counted
    const add_listener = vi.spyOn(document, `addEventListener`)
    const press_listeners = () =>
      add_listener.mock.calls.filter(([type]) => type === `pointerdown`).length
    const burger_button = doc_query(`.burger`)
    // nothing open means no listener: it does a layout read on every press on the page
    expect(press_listeners()).toBe(0)
    await click(burger_button)
    expect(press_listeners()).toBe(1)
    await click(toggle)
    expect(burger_button.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(is_visible(submenu)).toBe(true)
    await click(`.menu`)
    expect(burger_button.getAttribute(`aria-expanded`)).toBe(`true`)
    await click_outside()
    expect(burger_button.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(is_visible(submenu)).toBe(false)
    // an open dropdown arms the listener on its own, with the burger menu shut
    const listeners_before = press_listeners()
    await click(toggle)
    expect(is_visible(submenu)).toBe(true)
    expect(press_listeners()).toBe(listeners_before + 1)
    await click_outside()
    expect(is_visible(submenu)).toBe(false)
  })
  test(`parent link and toggle button work independently`, async () => {
    const { dropdown, submenu, toggle } = mount_dropdown()
    await click(dropdown.querySelector(`div:first-child > a`))
    expect(is_visible(submenu)).toBe(false)
    await click(toggle)
    expect(is_visible(submenu)).toBe(true)
    await click(toggle)
    expect(is_visible(submenu)).toBe(false)
  })
  test.each([
    `/old-string`,
    [[`/old-tuple`, `Label`]], // wrapped, else each spreads the tuple into two args
    { href: `/missing-label` },
    { label: `bad children`, children: [{ href: `/missing-label` }] },
  ])(`rejects invalid route objects %j`, (route) => {
    expect(() => mount_nav({ routes: [route as unknown as NavRoute] })).toThrow(
      /Nav route 0/u,
    )
  })
  test.each([
    [`not a link when parent page does not exist`, undefined, false, `SPAN`],
    [`a link when parent page exists`, `/docs`, false, `A`],
    [`a disabled span even when parent page exists`, `/docs`, true, `SPAN`],
  ])(`dropdown trigger is %s`, (_desc, href, disabled, tag) => {
    const children = [`/docs/intro`, `/docs/api`]
    mount_nav({
      routes: [
        {
          ...(href && { href }),
          disabled,
          label: `docs`,
          class: `trigger-class`,
          children: children.map((child) => ({ href: child, label: child })),
        },
      ],
    })
    const trigger = doc_query(`.dropdown > div:first-child > :first-child`)
    expect([
      trigger.tagName,
      trigger.getAttribute(`href`),
      trigger.getAttribute(`aria-disabled`),
      trigger.textContent?.trim(),
    ]).toEqual([tag, tag === `A` ? href : null, disabled ? `true` : null, `docs`])
    expect(trigger.classList).toContain(`trigger-class`)
    // dropdown children stay reachable even under a disabled parent
    expect(hrefs(doc_query(`.dropdown [data-submenu]`))).toEqual(children)
  })
  test.each([
    [`/parent/child`, [true, false], [`page`, `page`]],
    [`/parent`, [true, false], [`page`, null]],
    [`/other`, [false, true], [null, null]],
  ])(
    `dropdown active state and aria-current: pathname=%s`,
    (pathname, active, parent_and_child_current) => {
      mount_nav({ routes: parent_other, pathname })
      const [{ dropdown, submenu }] = query_all_dropdowns()
      expect(
        query_all_dropdowns().map((entry) => entry.dropdown.classList.contains(`active`)),
      ).toEqual(active)
      expect(
        [dropdown.querySelector(`div:first-child > a`), submenu.querySelector(`a`)].map(
          (link) => link?.getAttribute(`aria-current`),
        ),
      ).toEqual(parent_and_child_current)
    },
  )
  // `data-href` is the route href, so two Navs rendering the same route used to match each
  // other's dropdowns through a document-wide query and hand focus to the wrong instance.
  test(`two Navs on one page keep dropdown focus inside the instance that owns it`, async () => {
    mount_nav({ routes: two_child_route })
    mount_nav({ routes: two_child_route })
    const [first_links, second_links] = [...document.querySelectorAll(`nav`)].map(
      (nav) => [...nav.querySelectorAll<HTMLAnchorElement>(`.dropdown [data-submenu] a`)],
    )
    const second_toggle =
      document.querySelectorAll<HTMLElement>(`[data-dropdown-toggle]`)[1]
    press_key(second_toggle, `Enter`)
    await next_task()
    // opening focuses the first submenu link of *this* nav, not the first one in the document
    expect(document.activeElement).toBe(second_links[0])
    expect(first_links).not.toContain(document.activeElement)
    // arrows step within this nav's submenu only
    press_key(second_links[0], `ArrowDown`)
    expect(document.activeElement).toBe(second_links[1])
    // and Escape hands focus back to this nav's toggle, not the first nav's
    press_key(second_links[1], `Escape`)
    await next_task()
    expect(document.activeElement).toBe(second_toggle)
  })
  test(`keyboard navigation: Enter/ArrowDown open, arrows navigate, Escape closes`, async () => {
    const link_props = { onkeydown: vi.fn() }
    const { dropdown, submenu, toggle } = mount_dropdown({
      routes: two_child_route,
      link_props,
    })
    // Enter/Space share a branch; ArrowDown opens when closed — both focus the first item
    for (const open_key of [`Enter`, `ArrowDown`]) {
      press_key(toggle, open_key)
      await next_task() // wait for DOM focus
      expect(is_visible(submenu)).toBe(true)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
      expect(document.activeElement).toBe(submenu.querySelector(`a`))
      // Moving the mouse across a keyboard-opened pane must not dismiss it or move focus.
      pointer_event(dropdown, `pointerenter`)
      pointer_event(dropdown, `pointerleave`)
      await tick()
      expect(is_visible(submenu)).toBe(true)
      expect(document.activeElement).toBe(submenu.querySelector(`a`))
      press_key(globalThis, `Escape`)
    }
    // Arrow navigation: keys land on whichever element has focus, links included
    const [item1, item2] = Array.from(submenu.querySelectorAll(`a`))
    press_key(toggle, `Enter`)
    await next_task()
    expect(document.activeElement).toBe(item1)
    press_key(item1, `ArrowDown`)
    expect(document.activeElement).toBe(item2)
    press_key(item2, `ArrowDown`)
    expect(document.activeElement).toBe(item1) // wraps
    press_key(item1, `ArrowUp`)
    expect(document.activeElement).toBe(item2)
    press_key(item2, `Home`)
    expect(document.activeElement).toBe(item1)
    // Escape from item returns focus to toggle button
    press_key(item1, `Escape`)
    await next_task()
    expect(is_visible(submenu)).toBe(false)
    expect(document.activeElement).toBe(toggle)
    // consumer handler still sees every key that landed on a link
    expect(link_props.onkeydown).toHaveBeenCalledTimes(5)
    // Closing before the scheduled focus runs must not focus a now-hidden child.
    press_key(toggle, `Enter`)
    press_key(toggle, `Escape`)
    await next_task()
    expect(is_visible(submenu)).toBe(false)
    expect(document.activeElement).toBe(toggle)
  })
  test(`focus alone neither opens nor closes a dropdown`, async () => {
    const { dropdown, submenu, toggle } = mount_dropdown()
    // tabbing through the nav must not pop panels open
    dropdown.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    await tick()
    expect(is_visible(submenu)).toBe(false)
    await click(toggle)
    const external = document.createElement(`button`)
    document.body.append(external)
    // Focus moving within the submenu or onto the page must leave it open.
    for (const relatedTarget of [submenu.querySelector(`a`), external]) {
      dropdown.dispatchEvent(new FocusEvent(`focusout`, { bubbles: true, relatedTarget }))
      await tick()
      expect(is_visible(submenu)).toBe(true)
    }
    external.remove()
  })
  test.each([false, true])(
    `custom item content retains link attributes and navigation cancellation=%s`,
    async (cancelled) => {
      const on_navigate = vi.fn(() => (cancelled ? false : undefined))
      mount_nav({
        routes: default_routes,
        item: createRawSnippet(() => ({ render: () => `<code>Custom</code>` })),
        open: true,
        on_navigate,
        link_props: { target: `_blank` },
      })
      expect(
        [...document.querySelectorAll(`a`)].map((link) => [
          link.getAttribute(`href`),
          link.target,
        ]),
      ).toEqual(default_routes.map(({ href }) => [href, `_blank`]))
      const event = new MouseEvent(`click`, { bubbles: true, cancelable: true })
      doc_query(`a code`).dispatchEvent(event)
      await tick()
      expect(on_navigate).toHaveBeenCalledExactlyOnceWith({
        href: `/`,
        event,
        route: default_routes[0],
      })
      // returning false cancels the navigation and keeps the menu open
      expect(event.defaultPrevented).toBe(cancelled)
      expect(doc_query(`.burger`).getAttribute(`aria-expanded`)).toBe(String(cancelled))
    },
  )

  test(`item and children snippets receive route and menu state`, async () => {
    render(TestSnippetHarness, {
      component: `nav`,
      routes: [
        default_routes[0],
        { label: `More`, children: [default_routes[1]] },
        default_routes[2],
      ],
      pathname: `/about`,
    })
    const items = [...document.querySelectorAll<HTMLElement>(`[data-testid="nav-item"]`)]
    expect(
      items.map((item) => [
        item.dataset.href,
        item.dataset.active,
        item.closest(`a`)?.getAttribute(`href`),
      ]),
    ).toEqual([
      [`/`, `false`, `/`],
      [undefined, `true`, undefined],
      [`/about`, `true`, `/about`],
      [`/contact`, `false`, `/contact`],
    ])
    const children = doc_query(`[data-testid="nav-children"]`)
    const burger = doc_query(`.burger`)
    expect([children.dataset.panelId, children.textContent?.trim()]).toEqual([
      burger.getAttribute(`aria-controls`),
      `3 routes`,
    ])
    const open_state = () => [children.dataset.open, burger.getAttribute(`aria-expanded`)]
    expect(open_state()).toEqual([`false`, `false`])
    await click(burger)
    expect(open_state()).toEqual([`true`, `true`])
    // the bound `open` flows both ways between the parent and the burger
    await click(`[data-testid="nav-external-toggle"]`)
    expect(open_state()).toEqual([`false`, `false`])
    await click(`[data-testid="nav-external-toggle"]`)
    expect(open_state()).toEqual([`true`, `true`])
  })
  test.each<[string, ComponentProps<typeof Nav>[`labels`], string]>([
    [`the default toggle name`, undefined, `Toggle parent submenu`],
    [
      `a labels override`,
      { toggle_submenu: (route_label: string) => `${route_label} aufklappen` },
      `parent aufklappen`,
    ],
  ])(
    `dropdown accessibility uses native navigation links and labeled toggles, with %s`,
    (_case, labels, toggle_label) => {
      const { dropdown, submenu, toggle } = mount_dropdown({ labels })
      // native <a>/<nav> semantics, no explicit ARIA roles anywhere
      const link = doc_query(`[data-submenu] a[href="/parent/child"]`)
      expect([dropdown, submenu, link].map((el) => el.getAttribute(`role`))).toEqual([
        null,
        null,
        null,
      ])
      expect([
        toggle.tagName,
        toggle.getAttribute(`aria-label`),
        toggle.getAttribute(`aria-haspopup`),
      ]).toEqual([`BUTTON`, toggle_label, `true`])
    },
  )
  test(`disabled items render as styled spans that never navigate`, async () => {
    const on_navigate = vi.fn()
    const routes: NavRoute[] = [
      { href: `/home`, label: `home` },
      {
        href: `/test`,
        disabled: true,
        class: `my-disabled`,
        style: `opacity: 0.3`,
        label: `Admin Panel`,
      },
      { href: `/soon`, disabled: true, tooltip: `Coming soon`, label: `soon` },
    ]
    mount_nav({ routes, on_navigate })
    const disabled = [...document.querySelectorAll(`.disabled`)]
    expect(disabled.map((item) => item.textContent?.trim())).toEqual([
      `Admin Panel`,
      `soon`,
    ])
    for (const item of disabled) expect(item.getAttribute(`aria-disabled`)).toBe(`true`)
    expect(disabled[0].classList).toContain(`my-disabled`)
    expect(disabled[0].getAttribute(`style`)).toContain(`opacity: 0.3`)
    await click(disabled[0])
    expect(on_navigate).not.toHaveBeenCalled()
    expect(hrefs()).toEqual([`/home`])
  })
  test(`separators keep their place between routes, including after a dropdown`, () => {
    mount_nav({
      routes: [
        default_routes[0],
        { separator: true },
        ...single_dropdown_route,
        { separator: true },
        default_routes[2],
      ],
    })
    // each menu entry is a separator (by role) or a route (by its first link)
    expect(
      [...doc_query(`.menu`).children].map(
        (el) => el.getAttribute(`role`) ?? el.querySelector(`a`)?.getAttribute(`href`),
      ),
    ).toEqual([`/`, `separator`, `/parent`, `separator`, `/contact`])
  })
  test(`on_navigate fires for dropdown child links with their own link attributes`, async () => {
    const on_navigate = vi.fn()
    const child_route = {
      href: `/docs/intro`,
      label: `intro`,
      target: `_blank`,
      rel: `noreferrer`,
      title: `Read docs`,
    }
    mount_nav({
      routes: [{ href: `/docs`, children: [child_route], label: `docs` }],
      on_navigate,
      link_props: { target: `_self`, title: `Shared title` },
    })
    const child = doc_query<HTMLAnchorElement>(`a[href="/docs/intro"]`)
    expect([child.target, child.rel, child.title]).toEqual([
      `_blank`,
      `noreferrer`,
      `Read docs`,
    ])
    await click(child)
    // the route arrives whole, extra fields included
    expect(on_navigate).toHaveBeenCalledExactlyOnceWith({
      href: `/docs/intro`,
      event: expect.any(MouseEvent),
      route: child_route,
    })
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
      (_desc, width, breakpoint, expected_mobile) => {
        set_window_width(width)
        mount_nav({
          routes: [{ href: `/home`, label: `home` }],
          ...(breakpoint !== undefined && { breakpoint }),
        })
        expect(doc_query(`nav`).classList.contains(`mobile`)).toBe(expected_mobile)
      },
    )
    test(`re-evaluates mobile mode when the window resizes`, async () => {
      mount_nav({ routes: [{ href: `/home`, label: `home` }] })
      set_window_width(500)
      globalThis.dispatchEvent(new Event(`resize`))
      await tick()
      expect(doc_query(`nav`).classList.contains(`mobile`)).toBe(true)
    })
  })
  test(`handles all route formats together with all features`, () => {
    const routes: NavRoute[] = [
      { href: `/simple`, label: `simple` },
      { href: `/styled`, label: `styled`, class: `custom-nav-item`, style: `color: red` },
      { separator: true },
      {
        href: `/docs`,
        label: `docs`,
        align: `right`,
        children: [{ href: `/docs/api`, label: `api` }],
      },
      { href: `/disabled`, disabled: true, tooltip: `Login required`, label: `disabled` },
      { href: `/settings`, align: `right`, label: `settings` },
      {
        href: `https://github.com`,
        target: `_blank`,
        rel: `noopener noreferrer`,
        label: `GitHub`,
      },
    ]
    mount_nav({ routes })
    const links = [...document.querySelectorAll(`a`)]
    // route order preserved, dropdown parent link precedes its submenu link, and only
    // external routes get target/rel
    expect(
      links.map((link) => [
        link.getAttribute(`href`),
        link.textContent?.trim(),
        link.getAttribute(`target`),
        link.getAttribute(`rel`),
      ]),
    ).toEqual([
      [`/simple`, `simple`, null, null],
      [`/styled`, `styled`, null, null],
      [`/docs`, `docs`, null, null],
      [`/docs/api`, `api`, null, null],
      [`/settings`, `settings`, null, null],
      [`https://github.com`, `GitHub`, `_blank`, `noopener noreferrer`],
    ])
    expect(links[1].classList).toContain(`custom-nav-item`)
    expect(links[1].getAttribute(`style`)).toContain(`color: red`)
    expect(document.querySelectorAll(`.separator`)).toHaveLength(1)
    expect(document.querySelectorAll(`.disabled`)).toHaveLength(1)
    expect(document.querySelectorAll(`.align-right`)).toHaveLength(2)
    expect(doc_query(`.dropdown`).classList).toContain(`align-right`)
  })
  describe(`dropdown pointer and keyboard interactions`, () => {
    test.each([
      [10, 10, 1024, false],
      [11, 10, 1024, true],
      [12, 10, 1024, true],
      [11, 10, 500, false],
      [3, 2, 1024, true],
    ])(
      `%d children, threshold %d, width %d: two columns=%s`,
      (count, threshold, width, two_columns) => {
        set_window_width(width)
        const children = Array.from({ length: count }, (_, idx) => ({
          href: `/docs/page-${idx}`,
          label: `Page ${idx}`,
        }))
        const { submenu } = mount_dropdown({
          routes: [{ href: `/docs`, label: `docs`, children }],
          dropdown_column_threshold: threshold,
        })
        expect(submenu.classList.contains(`two-columns`)).toBe(two_columns)
        expect(submenu.style.getPropertyValue(`--submenu-rows`)).toBe(
          String(Math.ceil(count / 2)),
        )
        expect(hrefs(submenu)).toEqual(children.map(({ href }) => href))
      },
    )
    test.each([
      [1024, `mouse`, true],
      [500, `mouse`, false],
      [1024, `touch`, false],
      [500, `touch`, false],
    ])(`hover at width %d with %s opens=%s`, async (width, pointer_type, opens) => {
      set_window_width(width)
      const { dropdown, submenu, toggle } = mount_dropdown()
      const initial_focus = document.activeElement
      pointer_event(dropdown, `pointerenter`, pointer_type)
      await tick()
      expect(is_visible(submenu)).toBe(opens)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(String(opens))
      expect(document.activeElement).toBe(initial_focus)
      pointer_event(dropdown, `pointerleave`, pointer_type)
      await tick()
      expect(is_visible(submenu)).toBe(false)
      expect(document.activeElement).toBe(initial_focus)
      await click(toggle)
      pointer_event(dropdown, `pointerenter`, pointer_type)
      pointer_event(dropdown, `pointerleave`, pointer_type)
      await tick()
      expect(is_visible(submenu)).toBe(true)
    })
    // closing on an outside press is covered by the click-outside test above
    test.each([
      [`child route click`, (menu: HTMLElement) => click(menu.querySelector(`a`))],
      [`Escape key`, () => press_key(globalThis, `Escape`)],
    ])(`an open dropdown closes on %s`, async (_trigger, close_action) => {
      const { submenu, toggle } = mount_dropdown()
      await click(toggle)
      expect(is_visible(submenu)).toBe(true)
      await close_action(submenu)
      await tick()
      expect(is_visible(submenu)).toBe(false)
    })
    // one dropdown at a time: opening the second has to close the first
    test.each([`click`, `hover`])(
      `opening a second dropdown by %s closes the first`,
      async (interaction) => {
        const state = fromStore(writable(two_dropdown_routes))
        mount_nav({
          get routes() {
            return state.current
          },
        })
        const [
          { dropdown: dropdown1, submenu: menu1 },
          { dropdown: dropdown2, submenu: menu2 },
        ] = query_all_dropdowns()
        await open_dropdown(dropdown1, interaction)
        expect(is_visible(menu1)).toBe(true)
        await open_dropdown(dropdown2, interaction)
        expect(is_visible(menu1)).toBe(false)
        expect(is_visible(menu2)).toBe(true)
        state.current = two_dropdown_routes.toReversed()
        await tick()
        expect(query_all_dropdowns()[0].submenu).toBe(menu2)
        expect(is_visible(menu1)).toBe(false)
        expect(is_visible(menu2)).toBe(true)
        state.current = [two_dropdown_routes[0]]
        await tick()
        expect(query_all_dropdowns()).toHaveLength(1)
        expect(is_visible(menu1)).toBe(false)
      },
    )
    // ArrowDown on the toggle and Tab on a link each clear the hover flag on their own, so
    // the pointer leaving no longer dismisses the pane
    test.each([
      [`click`, `ArrowDown`],
      [`hover`, `ArrowDown`],
      [`click`, `Tab`],
      [`hover`, `Tab`],
    ])(
      `a submenu opened by %s stays under keyboard control after %s`,
      async (interaction, key) => {
        const { dropdown, submenu, toggle } = mount_dropdown({
          routes: two_child_route,
        })
        await open_dropdown(dropdown, interaction)
        expect(is_visible(submenu)).toBe(true)
        const [first_link, second_link] = submenu.querySelectorAll(`a`)
        if (key === `ArrowDown`) press_key(toggle, key)
        else {
          first_link.focus()
          press_key(first_link, key)
          expect(document.activeElement).toBe(second_link)
          press_key(second_link, key) // wraps
        }
        expect(document.activeElement).toBe(first_link)
        pointer_event(dropdown, `pointerleave`)
        await tick()
        expect(is_visible(submenu)).toBe(true)
        expect(document.activeElement).toBe(first_link)
      },
    )
    // the burger toggle only flips `open`, so this pins the effect that clears the dropdown
    test(`closing the burger menu also closes its open dropdown`, async () => {
      const { submenu, toggle } = mount_dropdown()
      await click(`.burger`)
      await click(toggle)
      expect(is_visible(submenu)).toBe(true)
      await click(`.burger`)
      expect(doc_query(`.burger`).getAttribute(`aria-expanded`)).toBe(`false`)
      expect(is_visible(submenu)).toBe(false)
    })
  })
  // Regression tests: JSON.stringify crashes on BigInt, functions, circular refs
  describe(`non-serializable route properties`, () => {
    const circular_route: NavRoute = { href: `/circular`, label: `circular` }
    circular_route.self = circular_route
    test.each<[string, NavLink]>([
      [`BigInt`, { href: `/a`, custom_id: BigInt(123), label: `a` }],
      [`function`, { href: `/a`, on_custom: () => {}, label: `a` }],
      [`circular reference`, circular_route],
    ])(`handles routes with %s properties without crashing`, (_desc, exotic_route) => {
      const routes = [exotic_route, { href: `/b`, label: `b` }]
      expect(() => mount_nav({ routes })).not.toThrow()
      // hrefs, not just a count: an exotic prop must not derail label/href parsing
      expect(hrefs()).toEqual(routes.map((route) => route.href))
    })
  })
  describe(`tooltips`, () => {
    beforeEach(() => vi.useFakeTimers())
    const open_tooltip = async (selector: string): Promise<void> => {
      await tick()
      doc_query(selector).dispatchEvent(
        new PointerEvent(`pointerover`, { bubbles: true, pointerType: `mouse` }),
      )
      await vi.advanceTimersByTimeAsync(0)
    }
    test.each([false, true])(
      `a submenu link owns its tooltip with disabled=%s`,
      async (disabled) => {
        mount_nav({
          routes: [
            {
              label: `Docs`,
              children: [
                {
                  href: `/docs/intro`,
                  label: `Introduction`,
                  disabled,
                  tooltip: `Read the introduction`,
                },
              ],
            },
          ],
          tooltip_options: { open_delay_ms: 0 },
        })
        await click(`[data-dropdown-toggle]`)
        await open_tooltip(disabled ? `span.disabled` : `a[href="/docs/intro"]`)
        expect(doc_query(`.custom-tooltip .tooltip-content`).textContent).toBe(
          `Read the introduction`,
        )
      },
    )
    test(`shared tooltip_options merge with per-route options taking precedence`, async () => {
      mount_nav({
        routes: [
          {
            href: `/docs`,
            label: `docs`,
            tooltip: { content: `Docs tooltip`, show_arrow: false },
          },
        ],
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
