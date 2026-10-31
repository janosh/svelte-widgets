import ColumnPicker from '#lib/table/ColumnPicker.svelte'
import type { TableColumn } from '#lib/table/types.ts'
import { type ComponentProps, createRawSnippet, tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import { click, doc_query, fire_input, raw_snippet, render } from './index'

type Props = ComponentProps<typeof ColumnPicker>

describe(`ColumnPicker`, () => {
  const make_columns = (): TableColumn[] => [
    { id: `col1`, label: `Column 1`, visible: true, description: `First column` },
    { id: `col2`, label: `Column 2`, visible: false, description: `Second column` },
    { id: `col3`, label: `Column 3`, visible: true, description: `Third column` },
  ]
  const make_many_columns = (count: number): TableColumn[] =>
    Array.from({ length: count }, (_unused, idx) => ({
      id: `col_${idx + 1}`,
      label: `Column ${idx + 1}`,
      visible: true,
    }))

  const get_trigger = () => doc_query<HTMLButtonElement>(`.column-picker > button`)
  const checkbox_states = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"]`),
      (checkbox) => checkbox.checked,
    )
  const toggle_texts = () =>
    [...document.querySelectorAll(`.toggle-label`)].map((label) =>
      label.textContent?.trim(),
    )
  const search = (text: string) =>
    fire_input(
      doc_query<HTMLInputElement>(`input[aria-label="Filter columns"]`),
      text,
      `input`,
    )

  const mount_menu = (
    columns: TableColumn[] = make_columns(),
    props: Partial<Omit<Props, `columns`>> = {},
  ) => render(ColumnPicker, { columns, open: true, ...props })

  describe(`Basic rendering`, () => {
    test.each([true, undefined])(
      `renders default visibility and toggles a column after opening (visible=%s)`,
      async (visible) => {
        const columns = make_columns()
        columns[0].visible = visible
        columns[2].label = `E_hull`
        mount_menu(columns, {
          open: false,
          // markup in labels and descriptions renders through snippets
          toggle_label: createRawSnippet<[{ column: TableColumn; visible: boolean }]>(
            (get_args) => ({
              render: () =>
                `<span>${get_args().column.label.replace(`_`, `<sub>`)}</span>`,
            }),
          ),
          description: createRawSnippet<[{ column: TableColumn }]>((get_args) => ({
            render: () => `<b>${get_args().column.description}</b>`,
          })),
        })
        const trigger = get_trigger()
        expect(document.querySelector(`[role="group"]`)).toBeNull()
        await click(trigger)
        expect(trigger.getAttribute(`aria-expanded`)).toBe(`true`)
        expect(checkbox_states()).toEqual([true, false, true])
        expect(document.querySelector(`[role="group"]`)).not.toBeNull()
        expect(document.querySelector(`.column-menu.grouped`)).toBeNull()
        expect(document.querySelector(`sub`)).not.toBeNull()
        doc_query(`.toggle-label`).dispatchEvent(new MouseEvent(`mouseenter`))
        await vi.waitFor(() =>
          expect(document.querySelector(`.popover b`)?.textContent).toBe(`First column`),
        )
        await click(`.toggle-label`)
        expect(checkbox_states()).toEqual([false, false, true])
        // unbound: the toggle publishes copies and never writes the host's objects
        expect(columns[0]).toEqual({ ...make_columns()[0], visible })
      },
    )

    test(`renders a custom trigger with a translated aria-label`, async () => {
      mount_menu(make_columns(), {
        open: false,
        labels: { trigger: `Spalten` },
        trigger: createRawSnippet<[{ open: boolean; changed: boolean }]>((get_args) => ({
          render: () =>
            `<span class="custom">${get_args().open ? `open` : `closed`}</span>`,
        })),
      })
      const trigger = get_trigger()
      expect(trigger.getAttribute(`aria-label`)).toBe(`Spalten`)
      expect(trigger.textContent?.trim()).toBe(`closed`)
      await click(trigger)
      expect(trigger.getAttribute(`aria-expanded`)).toBe(`true`)
    })

    test(`forwards class, style and attributes to the root`, () => {
      mount_menu(make_columns(), { class: `extra`, style: `--column-picker-radius: 0` })
      const root = doc_query(`.column-picker`)
      expect(root.classList.contains(`extra`)).toBe(true)
      expect(root.style.getPropertyValue(`--column-picker-radius`)).toBe(`0`)
    })

    // The list is a native auto popover anchored to the trigger: the top layer escapes table
    // overflow, and the browser owns light dismiss and Escape (anchored_popover)
    test(`opens an anchored popover that inside presses keep and dismissal closes`, async () => {
      mount_menu(make_columns(), {
        open: false,
        header: raw_snippet(
          `<label><input type="checkbox" aria-label="Extra setting" />Extra setting</label>`,
        ),
      })
      await tick() // let bind:this land before the trigger's handler reads it
      const trigger = get_trigger()
      const menu = () => document.querySelector<HTMLElement>(`.column-menu`)
      await click(trigger)
      expect(menu()?.getAttribute(`popover`)).toBe(`auto`)
      expect(trigger.popoverTargetElement).toBe(menu())

      const extra_setting = doc_query<HTMLInputElement>(`[aria-label="Extra setting"]`)
      await click(extra_setting)
      expect(extra_setting.checked).toBe(true)
      expect(menu()).not.toBeNull()

      await click(trigger) // the trigger toggles it shut
      expect(menu()).toBeNull()
      expect(trigger.getAttribute(`aria-expanded`)).toBe(`false`)

      await click(trigger)
      menu()?.dispatchEvent(
        Object.assign(new Event(`beforetoggle`), { newState: `closed` }),
      )
      await tick()
      expect(menu()).toBeNull()
    })

    test(`searches large menus without changing which column a toggle controls`, async () => {
      const columns = make_many_columns(21)
      columns[0].label = `Formation energy`
      // search_text widens what a query matches, e.g. symbols or rendered markup
      mount_menu(columns, {
        search_text: (col: TableColumn) =>
          `${col.label} ${col.id === `col_1` ? `ΔHf` : ``}`,
      })

      await search(`δhf`)
      expect(toggle_texts()).toEqual([`Formation energy`])
      await search(`column 21`)
      expect(toggle_texts()).toEqual([`Column 21`])
      await click(`.toggle-label`)
      expect(checkbox_states().at(-1)).toBe(false)

      await search(`missing`)
      expect(document.querySelector(`.no-matches`)?.textContent).toBe(
        `No matching columns`,
      )
    })
  })

  describe(`Grouped sections`, () => {
    test.each([`__proto__`, `constructor`])(
      `accepts %s as a column ID and group`,
      async (identifier) => {
        mount_menu([
          { id: identifier, label: `Metric`, group: identifier, visible: false },
        ])
        const checkbox = doc_query<HTMLInputElement>(`input[type="checkbox"]`)
        expect(checkbox.checked).toBe(false)
        await click(checkbox)
        expect(checkbox.checked).toBe(true)
        await click(`.reset-btn`)
        expect(checkbox.checked).toBe(false)
      },
    )

    const grouped_cols: TableColumn[] = [
      { id: `name (Personal)`, label: `Name`, group: `Personal` },
      { id: `age (Personal)`, label: `Age`, group: `Personal` },
      { id: `email (Contact)`, label: `Email`, group: `Contact` },
      { id: `phone (Contact)`, label: `Phone`, group: `Contact` },
      { id: `notes`, label: `Notes` }, // ungrouped
    ]

    test.each([
      { desc: `ungrouped last`, columns: grouped_cols, headers: [`Personal`, `Contact`] },
      {
        // an ungrouped column between groups doesn't split them: groups keep first-seen
        // order and every ungrouped column lands in the trailing headerless section
        desc: `ungrouped interleaved`,
        columns: [2, 4, 0, 3, 1].map((idx) => grouped_cols[idx]),
        headers: [`Contact`, `Personal`],
      },
    ])(`groups columns into sections ($desc)`, ({ columns, headers }) => {
      mount_menu(columns)
      expect(document.querySelector(`.column-menu.grouped`)).not.toBeNull()
      // two groups of two toggles, then the headerless ungrouped section
      const sections = [...document.querySelectorAll(`.section`)]
      expect(sections.map((section) => section.querySelectorAll(`input`).length)).toEqual(
        [2, 2, 1],
      )
      expect(
        sections.map((section) =>
          section.querySelector(`.section-header`)?.textContent?.replace(`▼`, ``).trim(),
        ),
      ).toEqual([...headers, undefined])
    })

    test(`searching preserves group order and resets only matching columns`, async () => {
      const columns = [
        { id: `hidden`, label: `Hidden`, group: `First` },
        { id: `loose`, label: `Match loose` },
        { id: `second`, label: `Match second`, group: `Second` },
        { id: `first`, label: `Match first`, group: `First` },
        ...make_many_columns(17),
      ]
      const on_toggle = vi.fn()
      mount_menu(columns, { on_toggle })
      await click(`.toggle-label`)
      await search(`match`)
      expect(toggle_texts()).toEqual([`Match first`, `Match second`, `Match loose`])
      await click(`.toggle-label`)
      await click(`button[aria-label="Reset First to defaults"]`)
      expect(on_toggle.mock.calls.map(([col, visible]) => [col.id, visible])).toEqual([
        [`hidden`, false],
        [`first`, false],
        [`first`, true],
      ])
    })

    const two_groups: TableColumn[] = [
      { id: `a (G1)`, label: `A`, group: `G1` },
      { id: `b (G1)`, label: `B`, group: `G1` },
      { id: `c (G2)`, label: `C`, group: `G2` },
    ]

    test.each([false, true])(`toggles a section from collapsed=%s`, async (collapsed) => {
      const state = $state({ collapsed_groups: collapsed ? [`G1`] : [] })
      render(ColumnPicker, {
        columns: two_groups,
        open: true,
        slide_ms: 0, // the mocked Element.animate never finishes a real outro
        get collapsed_groups() {
          return state.collapsed_groups
        },
        set collapsed_groups(groups: string[]) {
          state.collapsed_groups = groups
        },
      })
      const headers = document.querySelectorAll<HTMLElement>(`.section-header`)
      expect(headers[1].getAttribute(`aria-expanded`)).toBe(`true`)
      for (const expected of [!collapsed, collapsed]) {
        expect(headers[0].getAttribute(`aria-expanded`)).toBe(String(expected))
        expect(headers[0].textContent).toContain(expected ? `▼` : `▶`)
        expect(checkbox_states()).toHaveLength(expected ? 3 : 1)
        await click(headers[0])
      }
      expect(state.collapsed_groups).toEqual(collapsed ? [`G1`] : []) // bound both ways
    })
  })

  describe(`column layout`, () => {
    test.each([
      [1, 1],
      [2, 2],
      [20, 2],
      [21, 3],
      [31, 3], // capped at three columns
    ])(`lays out %i items in %i columns`, (count, expected) => {
      mount_menu(make_many_columns(count))
      expect(checkbox_states()).toHaveLength(count) // one toggle per column
      expect(doc_query(`.column-items`).style.gridTemplateColumns).toBe(
        `repeat(${expected}, max-content)`,
      )
      expect(document.querySelector(`input[aria-label="Filter columns"]`) !== null).toBe(
        count > 20,
      )
    })

    test.each([
      [{ filter_threshold: 0 }, 1, true, `repeat(1, max-content)`],
      [{ max_grid_columns: 5, max_grid_rows: 4 }, 18, false, `repeat(5, max-content)`],
    ])(`honours layout props %o`, (props, count, has_search, template) => {
      mount_menu(make_many_columns(count), props)
      expect(document.querySelector(`.column-search`) !== null).toBe(has_search)
      expect(doc_query(`.column-items`).style.gridTemplateColumns).toBe(template)
    })

    test(`sizes grouped sections independently`, () => {
      const grouped = (
        [
          [`Small`, 8],
          [`Large`, 21],
        ] as const
      ).flatMap(([group, count]) =>
        make_many_columns(count).map((col) => ({
          ...col,
          id: `${group}_${col.id}`,
          group,
        })),
      )
      mount_menu(grouped)
      const section_items =
        document.querySelectorAll<HTMLElement>(`.section .column-items`)
      expect([...section_items].map((items) => items.style.gridTemplateColumns)).toEqual([
        `repeat(2, max-content)`,
        `repeat(3, max-content)`,
      ])
    })
  })

  test.each([undefined, true])(
    `disabled items stay checked with visible=%s`,
    async (visible) => {
      const columns: TableColumn[] = [
        { id: `enabled`, label: `Enabled` },
        { id: `disabled`, label: `Disabled`, disabled: true, visible },
      ]
      mount_menu(columns)

      const checkboxes =
        document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"]`)
      const labels = [...document.querySelectorAll(`.toggle-label`)]

      expect([...checkboxes].map((box) => box.disabled)).toEqual([false, true])
      expect(labels.map((node) => node.classList.contains(`disabled`))).toEqual([
        false,
        true,
      ])
      expect(checkboxes[1].checked).toBe(true)
      await click(checkboxes[1])
      expect(checkboxes[1].checked).toBe(true)
      expect(columns[1].visible).toBe(visible)
    },
  )

  describe(`Reset functionality`, () => {
    const mount_bound_menu = (initial: TableColumn[] = make_columns().slice(0, 2)) => {
      let columns = $state.raw(initial)
      const props = {
        open: true,
        get columns() {
          return columns
        },
        set columns(value: TableColumn[]) {
          columns = value
        },
      }
      render(ColumnPicker, props)
      return props
    }
    const global_reset = () =>
      document.querySelector<HTMLElement>(`.column-picker > .reset-btn`)

    test.each<[string, TableColumn[], number[], boolean[], boolean]>([
      [`flat menu`, make_columns(), [0], [false, false, true], false],
      ...[false, true].map<[string, TableColumn[], number[], boolean[], boolean]>(
        (section) => [
          section ? `one group` : `grouped menu`,
          [`name`, `age`, `email`, `phone`].map((key, idx) => ({
            id: key,
            label: key,
            group: idx < 2 ? `Personal` : `Contact`,
          })),
          [0],
          [false, true, true, true],
          section,
        ],
      ),
      [
        `duplicate labels`,
        [
          { id: `first`, label: `Value`, group: `A`, visible: true },
          { id: `second`, label: `Value`, group: `B`, visible: false },
        ],
        [0, 1],
        [false, true],
        false,
      ],
    ])(
      `reset restores only changed columns and reports them: %s`,
      async (_name, columns, toggle, changed, section) => {
        const initial = columns.map((column) => column.visible !== false)
        const on_toggle = vi.fn()
        const calls = () =>
          on_toggle.mock.calls.map(([column, visible]) => [column.id, visible])
        mount_menu(columns, { on_toggle })
        const selector = section
          ? `.section-header-row .reset-btn`
          : `.column-picker > .reset-btn`
        expect(document.querySelector(selector)).toBeNull()
        const labels = document.querySelectorAll<HTMLElement>(`.toggle-label`)
        for (const idx of toggle) labels[idx].click()
        await tick()
        expect(checkbox_states()).toEqual(changed)
        expect(calls()).toEqual(toggle.map((idx) => [columns[idx].id, changed[idx]]))
        on_toggle.mockClear()
        await click(selector)
        expect(checkbox_states()).toEqual(initial)
        expect(calls()).toEqual(toggle.map((idx) => [columns[idx].id, initial[idx]]))
        expect(document.querySelector(selector)).toBeNull()
      },
    )

    // A host reordering its columns must not read as a new column set, which would
    // resnapshot defaults and strand the shown column with no way back to hidden.
    test(`keeps the reset baseline when only column order changes`, async () => {
      const state = mount_bound_menu()
      const col2_checked = () =>
        [...document.querySelectorAll<HTMLLabelElement>(`.toggle-label`)]
          .find((label) => label.textContent?.includes(`Column 2`))
          ?.querySelector(`input`)?.checked

      await click(document.querySelectorAll<HTMLElement>(`.toggle-label`)[1]) // show col2
      expect(col2_checked()).toBe(true)
      expect(global_reset()).not.toBeNull()

      state.columns = state.columns.toReversed()
      await tick()
      expect(global_reset(), `a reorder must not become the new baseline`).not.toBeNull()

      await click(global_reset())
      expect(col2_checked()).toBe(false)
    })

    test(`resnapshots defaults when same IDs receive new source visibility`, async () => {
      const state = mount_bound_menu()
      // column replacement updates the bound prop first, then the picker snapshots defaults
      const settle = async () => {
        await tick()
        await tick()
      }

      expect(checkbox_states()).toEqual([true, false])
      expect(global_reset()).toBeNull()

      state.columns = state.columns.map((col, idx) => ({ ...col, visible: idx === 1 }))
      await settle()
      expect(checkbox_states()).toEqual([false, true])
      expect(global_reset()).toBeNull()

      await click(`.toggle-label`)
      expect(checkbox_states()[0]).toBe(true)
      await click(global_reset())
      expect(checkbox_states()).toEqual([false, true])

      state.columns = state.columns.map((col) => ({ ...col, visible: true }))
      await settle()
      expect(checkbox_states()).toEqual([true, true])
      expect(global_reset()).toBeNull()
    })

    // hosts keeping visibility elsewhere declare the baseline apart from the current state
    test(`resets to default_visible when it differs from visible`, async () => {
      const state = mount_bound_menu([
        { id: `shown`, label: `Shown`, visible: true, default_visible: false },
      ])
      expect(global_reset()).not.toBeNull()
      await click(global_reset())
      expect(state.columns[0].visible).toBe(false)
      expect(global_reset()).toBeNull()
    })

    test(`section reset button tracks changed sections and restores only its own`, async () => {
      mount_menu([
        { id: `a (G1)`, label: `A`, group: `G1`, visible: true },
        { id: `b (G2)`, label: `B`, group: `G2`, visible: true },
      ])
      const section_btns = () =>
        document.querySelectorAll<HTMLElement>(`.section-header-row .reset-btn`)
      const labels = () => document.querySelectorAll<HTMLElement>(`.toggle-label`)
      expect(section_btns()).toHaveLength(0)

      await click(labels()[0]) // only G1 differs from defaults now
      expect(section_btns()).toHaveLength(1)

      await click(labels()[1])
      expect(section_btns()).toHaveLength(2)
      expect(checkbox_states()).toEqual([false, false])

      await click(section_btns()[0]) // G1's button
      expect(checkbox_states()).toEqual([true, false]) // G2 left untouched
    })
  })
})
