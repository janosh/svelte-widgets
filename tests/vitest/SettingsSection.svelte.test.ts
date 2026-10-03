import { SettingsSection } from '#lib'
import { createRawSnippet, tick, type ComponentProps } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'
import { click, doc_query, render } from './index'
import SettingsSectionRerenderHarness from './SettingsSectionRerenderHarness.svelte'

const snippet = (content: string) => createRawSnippet(() => ({ render: () => content }))
type SettingValues = Record<string, unknown>
const mount_section = (props: ComponentProps<typeof SettingsSection>) =>
  render(SettingsSection, props)

// A section whose caller writes reference values back, the way a real settings pane does
const mount_tracked_section = (
  initial: SettingValues,
  children: string,
  reset_values?: SettingValues,
) => {
  let current_values = $state<SettingValues>({ ...initial })
  const defaults = reset_values ?? initial
  const reset_calls: string[] = []
  mount_section({
    title: `Atoms`,
    get changed_keys() {
      return Object.keys({ ...defaults, ...current_values }).filter(
        (key) =>
          Object.hasOwn(defaults, key) !== Object.hasOwn(current_values, key) ||
          defaults[key] !== current_values[key],
      )
    },
    children: snippet(children),
    on_reset_key: (key: string) => {
      reset_calls.push(key)
      const next_values = { ...current_values }
      if (Object.hasOwn(defaults, key)) next_values[key] = defaults[key]
      else Reflect.deleteProperty(next_values, key)
      current_values = next_values
    },
  })
  return {
    reset_calls,
    get values() {
      return current_values
    },
    set values(next: SettingValues) {
      current_values = next
    },
  }
}

describe(`SettingsSection`, () => {
  test(`renders content with unique aria-labelledby targets`, () => {
    for (const title of [`A`, `B`]) {
      mount_section({ title, children: snippet(`<i>${title} content</i>`) })
    }
    const headings = [...document.querySelectorAll(`h4`)]
    const sections = [...document.querySelectorAll(`section`)]
    const texts = (nodes: Element[]) => nodes.map((node) => node.textContent?.trim())
    expect([texts(headings), texts(sections)]).toEqual([
      [`A`, `B`],
      [`A content`, `B content`],
    ])
    const ids = headings.map(({ id }) => id)
    expect(ids[0]).toMatch(/^settings-section-title-/u)
    expect(ids[0]).not.toBe(ids[1])
    expect(sections.map((node) => node.getAttribute(`aria-labelledby`))).toEqual(ids)
  })

  test(`hides reset controls when no reset callback is available`, () => {
    mount_section({
      title: `A`,
      changed_keys: [`radius`],
      children: snippet(
        `<label data-key="radius" data-description="Size"><input></label>`,
      ),
    })
    expect(document.querySelector(`.setting-reset-button`)).toBeNull()
    expect(doc_query(`[data-key="radius"]`).classList).not.toContain(`setting-resettable`)
  })

  test(`uses caller-supplied changed keys and gives section reset precedence`, async () => {
    let changed_keys = $state<string[]>([])
    const calls: string[] = []
    mount_section({
      title: `Values`,
      get changed_keys() {
        return changed_keys
      },
      on_reset: () => {
        calls.push(`section`)
        changed_keys = []
      },
      on_reset_key: (key: string) => calls.push(key),
      children: snippet(`<label data-key="nested"><input></label>`),
    })
    expect(document.querySelector(`.reset-button`)).toBeNull()
    changed_keys = [`nested`]
    await tick()
    expect(document.querySelector(`.setting-reset-button`)).not.toBeNull()
    await click(`.settings-section-heading .reset-button`)
    expect(calls).toEqual([`section`])
    expect(document.querySelector(`.reset-button`)).toBeNull()
  })

  test(`section reset without on_reset restores changed keys, deletes added ones, keeps focus`, async () => {
    const tracked = mount_tracked_section(
      { radius: 3, temporary: true },
      `<div>
        <label data-key="radius"><span>Radius</span><input></label>
        <label data-key="temporary"><span>Temporary</span><input></label>
      </div>`,
      { radius: 1 },
    )
    await tick()

    expect(document.querySelectorAll(`.setting-reset-button`)).toHaveLength(2)
    doc_query<HTMLButtonElement>(`.settings-section-heading .reset-button`).focus()
    await click(`.settings-section-heading .reset-button`)

    expect(tracked.values).toStrictEqual({ radius: 1 })
    expect(tracked.reset_calls).toEqual([`radius`, `temporary`])
    expect(document.querySelector(`.reset-button`)).toBeNull()
    // the focused section button unmounted, so focus lands on the first control
    expect(document.activeElement).toBe(doc_query(`[data-key="radius"] input`))
  })

  test.each<[string, string, SettingValues, SettingValues]>([
    [`existing key`, `Radius`, { radius: 1, palette: `warm` }, { radius: 2 }],
    [`new key`, `Temporary`, { radius: 1 }, { temporary: undefined }],
    [
      `underscored key`,
      `Same size`,
      { same_size_atoms: false },
      { same_size_atoms: true },
    ],
  ])(`resets %s to its mounted state`, async (_, label, initial, change) => {
    const [key] = Object.keys(change)
    const tracked = mount_tracked_section(
      initial,
      `<div>
        <label data-key="radius"><span>Radius</span><input></label>
        <label data-key="palette"><span>Palette</span><select></select></label>
        <label data-key="temporary"><span>Temporary</span><input></label>
        <label data-key="same_size_atoms"><span>Same size</span><input type="checkbox"></label>
      </div>`,
    )

    tracked.values = { ...tracked.values, ...change }
    await tick()
    expect(document.querySelectorAll(`.setting-reset-button`)).toHaveLength(1)
    const button = doc_query(`[data-key="${key}"] .setting-reset-button`)
    expect([
      button.getAttribute(`aria-label`),
      button.querySelector(`svg`)?.getAttribute(`viewBox`),
    ]).toEqual([`Reset ${label} to default`, `0 0 32 32`])
    await click(button)

    expect(tracked.reset_calls).toEqual([key])
    // strict, so a new key left behind as `undefined` instead of deleted fails
    expect(tracked.values).toStrictEqual(initial)
    expect(document.querySelector(`.setting-reset-button`)).toBeNull()
    expect(document.querySelector(`.reset-button`)).toBeNull()
  })

  // Row text skips controls (incl. option/textarea text) and descriptions; data-label wins.
  test.each([
    [
      `Atom radius scale`,
      `<label data-key="k">  Atom\n <b>radius</b>\t scale <input><input></label>`,
    ],
    [
      `Palette`,
      `<label data-key="k"><span>Palette</span><select><option>Jmol</option></select></label>`,
    ],
    [`Notes tail`, `<label data-key="k">Notes<textarea>draft</textarea> tail</label>`],
    [
      `Bonds mode`,
      `<div data-key="k"><span>Bonds <button>?</button></span><button>Go</button> mode</div>`,
    ],
    [
      `Info tip`,
      `<label data-key="k">Info <span class="tooltip">tip</span><!-- x --><input></label>`,
    ],
    [
      `Custom name`,
      `<label data-key="k" data-label=" Custom\n name "><span>Ignored</span><input></label>`,
    ],
  ])(`derives row label %j`, async (label, html) => {
    mount_section({
      title: `Atoms`,
      changed_keys: [`k`],
      on_reset_key: () => undefined,
      descriptions_open: true,
      children: snippet(
        html.replace(`data-key="k"`, `data-key="k" data-description="Desc"`),
      ),
    })
    await tick()
    expect(doc_query(`.settings-row-description`).textContent).toBe(`Desc`)
    expect(doc_query(`.setting-reset-button`).getAttribute(`aria-label`)).toBe(
      `Reset ${label} to default`,
    )
    const input = document.querySelector(`label[data-key] input`)
    if (input) expect(input.getAttribute(`aria-label`)).toBe(label)
  })

  test(`reveals row descriptions with an accessible section toggle`, async () => {
    mount_section({
      title: `Pointer sensitivity`,
      children: snippet(`
          <div data-key="wrapper">
            <label data-key="rotate_speed" data-description="Pointer rotation speed"><span>Rotate speed</span><input></label>
            <label data-key="rotation_damping" data-description="Motion inertia after releasing the pointer"><span>Damping</span><input></label>
            <section class="settings-section"><label data-key="nested" data-description="Nested description"><input aria-label="Nested label" data-auto-label="Nested label"><input aria-label="Nested label" data-auto-label="Nested label"></label></section>
          </div>
        `),
    })
    await tick()

    const toggle = doc_query(`.description-toggle`)
    expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(document.querySelectorAll(`.settings-row-description`)).toHaveLength(0)
    const nested_controls = [...document.querySelectorAll(`[data-key="nested"] input`)]
    expect(nested_controls.map((control) => control.getAttribute(`aria-label`))).toEqual([
      `Nested label`,
      `Nested label`,
    ])

    await click(toggle)
    expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(
      [...document.querySelectorAll(`.settings-row-description`)].map(
        (description) => description.textContent,
      ),
    ).toEqual([`Pointer rotation speed`, `Motion inertia after releasing the pointer`])

    await click(toggle)
    expect(document.querySelectorAll(`.settings-row-description`)).toHaveLength(0)

    // Cleaning up a keyed wrapper must leave nested rows' generated labels intact too.
    doc_query(`[data-key="wrapper"]`).removeAttribute(`data-key`)
    await tick()
    expect(
      nested_controls.map((control) => control.getAttribute(`data-auto-label`)),
    ).toEqual([`Nested label`, `Nested label`])
    expect(doc_query(`[data-key="rotate_speed"] input`).getAttribute(`aria-label`)).toBe(
      `Rotate speed`,
    )
  })

  // two keys overridden, two omitted, so both halves of the merge run; the interpolating
  // default lowercases the title
  test(`labels reword the heading actions, key by key`, async () => {
    mount_section({
      title: `Atoms`,
      changed_keys: [`radius`],
      on_reset_key: () => undefined,
      labels: {
        explain: `Erklären`,
        reset_section: (section_title: string) => `${section_title} zurücksetzen`,
        reset_key: (setting_key: string) => `${setting_key} zurücksetzen`,
      },
      children: snippet(
        `<label data-key="radius" data-description="Rendered atom radius"><span>Radius</span><input value="2"></label>`,
      ),
    })
    await tick()

    const explain = doc_query(`.description-toggle`)
    expect([explain.textContent?.trim(), explain.getAttribute(`aria-label`)]).toEqual([
      `Erklären`,
      `Show descriptions for atoms`,
    ])
    await click(explain)
    expect(explain.getAttribute(`aria-label`)).toBe(`Hide descriptions for atoms`)

    const names = (node: Element) =>
      [`title`, `aria-label`].map((attribute) => node.getAttribute(attribute))
    const reset = doc_query(`.settings-section-heading .reset-button`)
    expect([reset.textContent?.trim(), ...names(reset)]).toEqual([
      `Reset`,
      `Atoms zurücksetzen`,
      `Atoms zurücksetzen`,
    ])
    // the per-row reset button injected by on_reset_key reads from labels too
    const row_reset = doc_query(`.setting-reset-button`)
    expect(names(row_reset)).toEqual([`Radius zurücksetzen`, `Radius zurücksetzen`])

    // Svelte updates reactive label text in place, without replacing the element.
    doc_query(`[data-key="radius"] > span`).childNodes[0].nodeValue = `Atom radius`
    await tick()
    expect([
      ...names(row_reset),
      doc_query(`[data-key="radius"] input`).getAttribute(`aria-label`),
    ]).toEqual([`Atom radius zurücksetzen`, `Atom radius zurücksetzen`, `Atom radius`])
  })

  // the description used to be snapshotted at mount and written back on every refresh, so a
  // caller's later `data-description` was reverted (or deleted, if added after mount)
  test.each([
    [`a mount-time description`, ` data-description="Old text"`],
    [`no description at mount`, ``],
  ])(`follows a caller's later data-description after %s`, async (_, attribute) => {
    mount_section({
      title: `Atoms`,
      descriptions_open: true,
      on_reset_key: () => undefined,
      children: snippet(
        `<label data-key="radius"${attribute}><span>Radius</span><input></label>`,
      ),
    })
    await tick()
    doc_query(`[data-key="radius"]`).setAttribute(`data-description`, `New text`)
    await tick()
    expect(doc_query(`[data-key="radius"]`).getAttribute(`data-description`)).toBe(
      `New text`,
    )
    expect(doc_query(`.settings-row-description`).textContent).toBe(`New text`)
  })

  // Pressing the reset button removes it, which used to drop focus to <body>.
  test(`keyboard reset moves focus to the row's control instead of losing it`, async () => {
    const tracked = mount_tracked_section(
      { radius: 2 },
      `<label data-key="radius"><span>Radius</span><input value="2"></label>`,
      { radius: 1 },
    )
    await tick()
    const button = doc_query(`.setting-reset-button`)
    button.focus()
    await click(button)

    expect(tracked.values.radius).toBe(1)
    expect(document.querySelector(`.setting-reset-button`)).toBeNull()
    expect(document.activeElement).toBe(doc_query(`[data-key="radius"] input`))
  })

  test(`reserves reset gutters for every keyed row, before and after edits`, async () => {
    const tracked = mount_tracked_section(
      { radius: 1 },
      `<div><label data-key="radius"><span>Radius</span><input type="range"></label><label data-key="unknown">Unchanged<input></label></div>`,
    )
    await tick()
    const row = doc_query(`[data-key="radius"]`)
    for (const radius of [1, 2, 1]) {
      tracked.values = { radius }
      await tick()
      expect(row.classList).toContain(`setting-resettable`)
      expect(Boolean(row.querySelector(`.setting-reset-button`))).toBe(radius !== 1)
      expect(doc_query(`[data-key="unknown"]`).classList).toContain(`setting-resettable`)
    }
    tracked.values = {}
    await tick()
    expect(row.classList).toContain(`setting-resettable`)
  })

  test(`ignores missing and explicitly empty descriptions`, async () => {
    mount_section({
      title: `Atoms`,
      children: snippet(
        `<div><div data-key="radius" data-description=""></div><div data-key="unrelated"></div></div>`,
      ),
    })
    await tick()
    expect(document.querySelector(`.description-toggle`)).toBeNull()
    expect(doc_query(`[data-key="radius"]`).dataset.description).toBe(``)
  })

  test(`refreshes replaced controls, changed keys, and remounted rows`, async () => {
    render(SettingsSectionRerenderHarness, {})
    await tick()

    const settings_row = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(`[data-generation]`)
    const row_query = (selector: string) => settings_row()?.querySelector(selector)
    const expect_single_enhancement = (): void => {
      for (const selector of [`.settings-row-description`, `.setting-reset-button`]) {
        expect(settings_row()?.querySelectorAll(selector)).toHaveLength(1)
      }
    }

    // same nodes, not replacements: a value edit re-enhances in place instead of tearing
    // every description and reset button off and back on
    const palette_selector = `[data-key="palette"] .settings-row-description`
    const palette_description = doc_query(palette_selector)
    await click(`[data-testid="change-radius"]`)
    expect(doc_query(palette_selector)).toBe(palette_description)
    expect_single_enhancement()
    expect(row_query(`input`)?.getAttribute(`aria-label`)).toBe(`Radius`)

    const previous_input = row_query(`input`)
    await click(`[data-testid="replace-input"]`)
    expect(row_query(`input`)).not.toBe(previous_input)
    expect(row_query(`input`)?.getAttribute(`aria-label`)).toBe(`Radius`)
    expect_single_enhancement()

    await click(`[data-testid="change-key"]`)
    expect(settings_row()?.dataset.key).toBe(`diameter`)
    expect(row_query(`.setting-reset-button`)?.getAttribute(`aria-label`)).toBe(
      `Reset Radius to default`,
    )
    await click(row_query(`.setting-reset-button`))
    expect(row_query(`.setting-reset-button`)).toBeNull()
    expect(document.querySelector(`.reset-button`)).not.toBeNull()

    await click(`[data-testid="change-key"]`)
    expect_single_enhancement()

    const previous_row = settings_row()
    await click(`[data-testid="replace-radius"]`)
    expect(settings_row()).not.toBe(previous_row)
    expect_single_enhancement()

    await click(`[data-testid="toggle-radius"]`)
    expect(settings_row()).toBeNull()
    await click(`[data-testid="toggle-radius"]`)
    expect_single_enhancement()

    await click(row_query(`.setting-reset-button`))
    expect(row_query(`.setting-reset-button`)).toBeNull()
    expect(settings_row()?.querySelectorAll(`.settings-row-description`)).toHaveLength(1)
    expect(document.querySelector(`.reset-button`)).toBeNull()
  })
})
