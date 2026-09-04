import { ActionMenu } from '$lib'
import type { CmdAction } from '$lib/types'
import type { CmdSection } from '$lib/utils'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest'
import { doc_query, escape_key, mock_rect, stub_prop } from './index'
import TestActionMenu from './TestActionMenu.svelte'

describe(`ActionMenu`, () => {
  type ActionMenuProps = ComponentProps<typeof ActionMenu>
  type ContextProps = Extract<ActionMenuProps, { trigger?: string }>
  type MenuProps = Partial<Omit<ContextProps, `actions`>>
  type MenuEntries = ActionMenuProps[`actions`]
  const make_actions = (): CmdAction[] => [
    { label: `Copy`, action: vi.fn(), shortcut: `mod+c` },
    { label: `Delete`, action: vi.fn(), disabled: true },
  ]
  // svelte:body listeners outlive innerHTML = '', so unmount or old menus keep answering
  const mounted: Record<string, unknown>[] = []
  afterEach(() => mounted.splice(0).forEach((app) => void unmount(app)))
  // returns the reactive props, so a test can drive `at` the way a consumer would
  const mount_menu = (actions: MenuEntries, extra: MenuProps = {}) => {
    const props: MenuProps & { actions: MenuEntries } = $state({ actions, ...extra })
    mounted.push(mount(ActionMenu, { target: document.body, props }))
    return props
  }
  const right_click = (target: EventTarget, clientX = 120, clientY = 240) => {
    const event = new MouseEvent(`contextmenu`, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    })
    target.dispatchEvent(event)
    return event
  }
  const flush_context_open = async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    await tick()
  }
  // opens a menu by right-clicking the page, returning the contextmenu event
  const open_menu = async (
    actions: MenuEntries = make_actions(),
    extra: MenuProps = {},
  ) => {
    mount_menu(actions, extra)
    const event = right_click(document.body)
    await flush_context_open()
    return event
  }
  const region = createRawSnippet(() => ({
    render: () => `<div data-testid="region">region</div>`,
  }))
  const menu = () => document.querySelector(`menu[role="menu"]`)
  // `role^=` catches both the plain menuitem and the menuitemradio a section renders
  const items = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(`[role^=menuitem]`))
  const press = (key: string) =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true }),
    )

  test(`a right-click opens the menu at the pointer, replacing the native one`, async () => {
    const ontoggle = vi.fn()
    mount_menu(make_actions(), { class: `consumer-class`, id: `consumer-menu`, ontoggle })
    expect(menu()).toBeNull()

    const event = right_click(document.body)
    await flush_context_open()

    expect(event.defaultPrevented).toBe(true)
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      expect.stringMatching(/^Copy/u),
      `Delete`,
    ])
    // float anchored the menu on the pointer rather than on any element
    const surface = doc_query(`menu[role="menu"]`)
    expect(surface.getAttribute(`popover`)).toBe(`auto`)
    const { position, left, top } = surface.style
    expect([position, left, top]).toEqual([`fixed`, `120px`, `240px`])
    expect([surface.id, surface.getAttribute(`aria-label`), surface.tabIndex]).toEqual([
      `consumer-menu`,
      `Actions`,
      -1,
    ])
    // .action-menu comes after {...rest}, so a consumer class adds instead of replacing
    expect(surface.classList.contains(`action-menu`)).toBe(true)
    expect(surface.classList.contains(`consumer-class`)).toBe(true)
    expect(ontoggle).toHaveBeenCalledWith(expect.objectContaining({ newState: `open` }))
    surface.hidePopover()
    await tick()
    expect(menu()).toBeNull()
    expect(ontoggle).toHaveBeenCalledWith(expect.objectContaining({ newState: `closed` }))
  })

  test(`preserves a consumer-provided menu tabindex`, async () => {
    await open_menu(make_actions(), { tabindex: 0 })
    expect(doc_query<HTMLMenuElement>(`menu[role="menu"]`).tabIndex).toBe(0)
  })

  // with a region, svelte:body's handler is dropped: the page keeps its native menu
  test(`a children region scopes the right-click to itself`, async () => {
    mount_menu(make_actions(), { children: region })

    const outside = right_click(document.body)
    await tick()
    expect(menu()).toBeNull()
    expect(outside.defaultPrevented).toBe(false)

    right_click(doc_query(`[data-testid="region"]`))
    await flush_context_open()
    expect(menu()).not.toBeNull()
  })

  // for consumers that must record which target was right-clicked and drive `at` themselves
  test.each([
    [`no region`, {}, () => document.body],
    [`a region`, { children: region }, () => doc_query(`[data-testid="region"]`)],
  ] as const)(`trigger="none" installs no handler (%s)`, async (_desc, extra, target) => {
    const props = mount_menu(make_actions(), { ...extra, trigger: `none` })

    const event = right_click(target())
    await tick()
    expect(menu()).toBeNull()
    expect(event.defaultPrevented).toBe(false) // the browser's own menu survives

    props.at = { x: 30, y: 60 } // `at` alone still opens it
    await tick()
    const { left, top } = doc_query(`menu[role="menu"]`).style
    expect([left, top]).toEqual([`30px`, `60px`])
  })

  test.each([
    [`Macintosh; Intel Mac OS X 10_15`, [`⌘`, `C`]],
    [`X11; Linux x86_64`, [`Ctrl`, `C`]],
  ])(`renders mod as the platform's key (%s)`, async (user_agent, expected) => {
    onTestFinished(stub_prop(globalThis.navigator, `userAgent`, user_agent))
    await open_menu()

    expect([...items()[0].querySelectorAll(`kbd`)].map((key) => key.textContent)).toEqual(
      expected,
    )
  })

  test(`a trigger snippet toggles an anchored dropdown and restores focus`, async () => {
    const props = $state({
      actions: make_actions(),
      open: false,
      match_width: true,
    })
    mounted.push(mount(TestActionMenu, { target: document.body, props }))
    const anchor = doc_query(`[data-testid="action-menu-anchor"]`)
    const trigger = doc_query<HTMLButtonElement>(`[data-testid="action-menu-trigger"]`)
    mock_rect(anchor, { left: 40, top: 60, width: 80, height: 20 })

    expect(trigger.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(trigger.getAttribute(`aria-controls`)).toBeNull()
    trigger.dispatchEvent(outside_press())
    trigger.click()
    await tick()

    const surface = doc_query<HTMLMenuElement>(`menu[role="menu"]`)
    expect(props.open).toBe(true)
    expect(trigger.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(trigger.getAttribute(`aria-controls`)).toBe(surface.id)
    expect([
      surface.style.left,
      surface.style.top,
      surface.style.width,
      surface.style.minWidth,
      surface.style.boxSizing,
    ]).toEqual([`40px`, `84px`, `80px`, `80px`, `border-box`])
    expect(document.activeElement).toBe(items()[0])

    items()[0].click()
    await tick()
    expect(props.open).toBe(false)
    expect(menu()).toBeNull()
    expect(trigger.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(document.activeElement).toBe(trigger)
  })

  // clicking menu chrome takes focus out of the list, where every key used to enter at
  // the first item regardless of which end it pointed at
  test.each([
    [`End`, 2],
    [`ArrowUp`, 2],
    [`Home`, 0],
    [`ArrowDown`, 0],
  ] as const)(
    `%s enters the list at the right end when focus sits outside it`,
    async (key, expected_idx) => {
      await open_menu(
        [`One`, `Two`, `Three`].map((label) => ({ label, action: vi.fn() })),
      )
      const menu_el = doc_query(`menu[role="menu"]`)
      ;(document.activeElement as HTMLElement | null)?.blur()

      menu_el.dispatchEvent(
        new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true }),
      )
      await tick()

      expect(document.activeElement).toBe(items()[expected_idx])
    },
  )

  test(`choosing an action runs it and closes, disabled ones do neither`, async () => {
    const actions = make_actions()
    const on_select = vi.fn()
    await open_menu(actions, { on_select })

    items()[1].click() // disabled
    await tick()
    expect(actions[1].action).not.toHaveBeenCalled()
    expect(on_select).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()

    items()[0].click()
    await tick()
    expect(actions[0].action).toHaveBeenCalledWith(`Copy`)
    expect(on_select).toHaveBeenCalledWith(actions[0])
    expect(menu()).toBeNull()
  })

  // custom dismissal can opt into press timing or leave Escape to the page; native
  // light-dismiss is covered in Playwright rather than emulated in happy-dom
  const outside_press = () => new PointerEvent(`pointerdown`, { bubbles: true })
  const outside_click = () => new MouseEvent(`click`, { bubbles: true })
  const release: MenuProps = { dismiss: { dismiss_on: `release`, escape: false } }
  test.each([
    [`escape: false leaves Escape to the page`, release, escape_key, false],
    [`dismiss_on: release ignores the press`, release, outside_press, false],
    [`dismiss_on: release waits for the click`, release, outside_click, true],
  ] as const)(`%s`, async (_desc, extra, make_event, closes) => {
    await open_menu(make_actions(), extra)
    expect(menu()).not.toBeNull()

    document.body.dispatchEvent(make_event())
    await tick()
    expect(menu() === null).toBe(closes)
  })

  test(`dismiss preserves consumer-provided inside regions`, async () => {
    const inside = document.createElement(`button`)
    document.body.append(inside)
    await open_menu(make_actions(), { dismiss: { inside: [inside] } })
    expect(doc_query(`menu`).getAttribute(`popover`)).toBe(`manual`)

    inside.dispatchEvent(outside_press())
    await tick()
    expect(menu()).not.toBeNull()
  })

  test(`stays shut when disabled or when there is nothing to show`, async () => {
    const event = await open_menu(make_actions(), { disabled: true })
    expect(menu()).toBeNull()
    expect(event.defaultPrevented).toBe(false) // the browser menu still opens

    await open_menu([])
    expect(menu()).toBeNull()

    await open_menu([{ title: `Empty`, actions: [] }]) // a section with nothing in it
    expect(menu()).toBeNull()
  })

  describe(`sections`, () => {
    const make_sections = (): CmdSection[] => [
      {
        title: `Bond order`,
        selected: `single`,
        actions: [
          { id: `single`, label: `Single`, action: vi.fn() },
          { id: `double`, label: `Double`, action: vi.fn() },
        ],
      },
      // no `selected`: a plain heading, whose items stay ordinary menu items
      { title: `Other`, actions: [{ label: `Reset`, action: vi.fn() }] },
    ]

    // unique ids stay stable across reorder; duplicates append position to avoid
    // each_key_duplicate
    test(`ids, labels, and duplicates stay distinct keys`, async () => {
      await open_menu([
        { id: 1, label: `Numeric id`, action: vi.fn() },
        { id: 1, label: `Duplicate numeric id`, action: vi.fn() },
        { id: `1`, label: `String id`, action: vi.fn() },
        { label: `1`, action: vi.fn() },
        { label: `1`, action: vi.fn() },
        {
          title: `1`,
          actions: [
            { label: `In section`, action: vi.fn() },
            { label: `In section`, action: vi.fn() },
          ],
        },
      ])

      expect(items().map((btn) => btn.textContent?.trim())).toEqual([
        `Numeric id`,
        `Duplicate numeric id`,
        `String id`,
        `1`,
        `1`,
        `In section`,
        `In section`,
      ])
    })

    test(`reordering unique-id actions keeps the same button nodes`, async () => {
      const props = mount_menu([
        { id: `a`, label: `First`, action: vi.fn() },
        { id: `b`, label: `Second`, action: vi.fn() },
      ])
      right_click(document.body)
      await flush_context_open()
      const [first, second] = items()
      props.actions = [props.actions[1], props.actions[0]]
      await tick()
      expect(items()).toEqual([second, first])
    })

    // a section title is a heading, not an identity: keyed on title alone these collided
    // and each_key_duplicate took down the whole menu
    test(`two sections may share a title`, async () => {
      await open_menu([
        { title: `Tools`, actions: [{ label: `First`, action: vi.fn() }] },
        { title: `Tools`, actions: [{ label: `Second`, action: vi.fn() }] },
      ])

      expect(
        [...document.querySelectorAll(`li[role="group"]`)].map((group) =>
          group.getAttribute(`aria-label`),
        ),
      ).toEqual([`Tools`, `Tools`])
      expect(items().map((btn) => btn.textContent?.trim())).toEqual([`First`, `Second`])
    })

    test(`render as labeled groups of radios, flat actions keep menuitem`, async () => {
      // `Other` is both a flat action and a section title; the empty section drops out
      await open_menu([
        { label: `Other`, action: vi.fn() },
        ...make_sections(),
        { title: `Empty`, actions: [] },
      ])

      const groups = Array.from(document.querySelectorAll(`li[role="group"]`))
      expect(groups.map((group) => group.getAttribute(`aria-label`))).toEqual([
        `Bond order`,
        `Other`,
      ])
      // the visible title duplicates aria-label, so AT must not read it twice
      expect(
        groups.map((group) => group.querySelector(`.section-title`)?.textContent),
      ).toEqual([`Bond order`, `Other`])
      expect(
        groups.map((group) =>
          group.querySelector(`.section-title`)?.getAttribute(`aria-hidden`),
        ),
      ).toEqual([`true`, `true`])

      expect(
        items().map((btn) => [
          btn.textContent?.trim(),
          btn.getAttribute(`role`),
          btn.getAttribute(`aria-checked`),
        ]),
      ).toEqual([
        [`Other`, `menuitem`, null],
        [`Single`, `menuitemradio`, `true`],
        [`Double`, `menuitemradio`, `false`],
        [`Reset`, `menuitem`, null], // a section without `selected` is not a radio group
      ])
      // members stay direct children of the menu; the empty section adds no <li>
      expect(document.querySelectorAll(`menu[role="menu"] > li`)).toHaveLength(3)
    })

    // open_at refuses a menu with nothing to show; only a consumer's `at` reveals it
    test(`a menu of nothing but empty sections keeps them`, async () => {
      const props = mount_menu([{ title: `Empty`, actions: [] }], { trigger: `none` })
      props.at = { x: 10, y: 20 }
      await tick()
      expect(doc_query(`li[role="group"]`).getAttribute(`aria-label`)).toBe(`Empty`)
      expect(items()).toHaveLength(0)
    })

    test(`arrow keys cross section boundaries, skipping disabled items`, async () => {
      const [bond_order, other] = make_sections()
      bond_order.actions[1].disabled = true
      await open_menu([{ label: `Copy`, action: vi.fn() }, bond_order, other])
      const [copy, single, , reset] = items()
      expect(document.activeElement).toBe(copy)

      press(`ArrowDown`)
      expect(document.activeElement).toBe(single) // flat item into a section
      press(`ArrowDown`)
      expect(document.activeElement).toBe(reset) // disabled `Double` skipped, next section
      press(`ArrowDown`)
      expect(document.activeElement).toBe(copy) // wraps out of the last section
      press(`ArrowUp`)
      expect(document.activeElement).toBe(reset)
      press(`Home`)
      expect(document.activeElement).toBe(copy)
      press(`End`)
      expect(document.activeElement).toBe(reset)
    })

    test(`choosing a section item reports the section it came from`, async () => {
      const sections = make_sections()
      const on_select = vi.fn()
      await open_menu(sections, { on_select })

      items()[1].click()
      await tick()
      expect(sections[0].actions[1].action).toHaveBeenCalledWith(`Double`)
      expect(on_select).toHaveBeenCalledWith(sections[0].actions[1], sections[0])
      expect(menu()).toBeNull()
    })

    // the snippet owns the whole button body, flat entries and section members alike
    test(`the item snippet replaces the default markup, section and checked included`, async () => {
      const item = createRawSnippet<
        [{ action: CmdAction; section?: CmdSection; checked?: boolean }]
      >((get_params) => ({
        render: () => {
          const { action, section, checked } = get_params()
          return `<span>${section?.title ?? `flat`}/${action.label}/${checked}</span>`
        },
      }))
      await open_menu([...make_actions(), ...make_sections()], { item })

      expect(items().map((btn) => btn.textContent?.trim())).toEqual([
        `flat/Copy/undefined`,
        `flat/Delete/undefined`,
        `Bond order/Single/true`,
        `Bond order/Double/false`,
        `Other/Reset/undefined`,
      ])
      expect(document.querySelector(`kbd`)).toBeNull() // default shortcut markup is gone
    })

    // CmdAction allows extra keys, so `actions`/`title` must not make one read as a section
    test(`a flat action with section-shaped extras stays flat`, async () => {
      await open_menu([
        { label: `Copy`, action: vi.fn(), actions: [`audit`], title: `tooltip` },
      ])
      const [copy] = items()
      expect(copy.getAttribute(`role`)).toBe(`menuitem`)
      expect(copy.getAttribute(`title`)).toBeNull() // `title` is not `description`
      expect(document.querySelector(`li[role="group"]`)).toBeNull()
    })
  })
})
