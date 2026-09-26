import { SettingsSection } from '$lib'
import { createRawSnippet, flushSync, tick, type ComponentProps } from 'svelte'
import { describe, expect, test } from 'vitest'
import { doc_query, render } from './index'
import SettingsSectionRerenderHarness from './SettingsSectionRerenderHarness.svelte'

const snippet = (content: string) => createRawSnippet(() => ({ render: () => content }))
type SettingValues = Record<string, unknown>
const mount_section = (props: ComponentProps<typeof SettingsSection>) =>
  render(SettingsSection, props)
const click_and_tick = async (
  selector: string,
  root: ParentNode | null = document,
): Promise<void> => {
  const button = root?.querySelector<HTMLButtonElement>(selector)
  if (!button) throw new Error(`Missing button: ${selector}`)
  button.click()
  await tick()
}

// A section whose caller writes reference values back, the way a real settings pane does
const mount_tracked_section = (
  initial: SettingValues,
  children: string,
  reset_values?: SettingValues,
) => {
  let current_values = $state<SettingValues>({ ...initial })
  const defaults = reset_values ?? initial
  const reset_calls: [string, unknown, boolean][] = []
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
      const value = defaults[key]
      const present = Object.hasOwn(defaults, key)
      reset_calls.push([key, value, present])
      const next_values = { ...current_values }
      if (present) next_values[key] = value
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
    for (const [title, content] of [
      [`Section A`, `Content A`],
      [`Section B`, `Content B`],
    ]) {
      mount_section({ title, children: snippet(`<span>${content}</span>`) })
    }
    const [heading_a, heading_b] = [...document.querySelectorAll(`h4`)]
    const [section_a, section_b] = [...document.querySelectorAll(`section`)]
    expect([heading_a.textContent?.trim(), heading_b.textContent?.trim()]).toEqual([
      `Section A`,
      `Section B`,
    ])
    expect([section_a.textContent?.trim(), section_b.textContent?.trim()]).toEqual([
      `Content A`,
      `Content B`,
    ])
    expect(heading_a.id.startsWith(`settings-section-title-`)).toBe(true)
    expect(heading_a.id).not.toBe(heading_b.id)
    expect(section_a.getAttribute(`aria-labelledby`)).toBe(heading_a.id)
    expect(section_b.getAttribute(`aria-labelledby`)).toBe(heading_b.id)
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
    expect(
      doc_query(`[data-key="radius"]`).classList.contains(`setting-resettable`),
    ).toBe(false)
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
    flushSync(() => {
      changed_keys = [`nested`]
    })
    await tick()
    expect(document.querySelector(`.setting-reset-button`)).not.toBeNull()
    await click_and_tick(`.settings-section-heading .reset-button`)
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
    await click_and_tick(`.settings-section-heading .reset-button`)

    expect(tracked.values).toEqual({ radius: 1 })
    expect(tracked.reset_calls).toEqual([
      [`radius`, 1, true],
      [`temporary`, undefined, false],
    ])
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
    const [reference_value, reference_present] = [
      initial[key],
      Object.hasOwn(initial, key),
    ]
    const tracked = mount_tracked_section(
      initial,
      `<div>
        <label data-key="radius"><span>Radius</span><input></label>
        <label data-key="palette"><span>Palette</span><select></select></label>
        <label data-key="temporary"><span>Temporary</span><input></label>
        <label data-key="same_size_atoms"><span>Same size</span><input type="checkbox"></label>
      </div>`,
    )

    flushSync(() => (tracked.values = { ...tracked.values, ...change }))
    await tick()
    expect(document.querySelectorAll(`.setting-reset-button`)).toHaveLength(1)
    expect(
      document
        .querySelector(`[data-key="${key}"] .setting-reset-button`)
        ?.getAttribute(`aria-label`),
    ).toBe(`Reset ${label} to default`)
    expect(
      document.querySelector(`.setting-reset-button svg`)?.getAttribute(`viewBox`),
    ).toBe(`0 0 32 32`)
    await click_and_tick(`[data-key="${key}"] .setting-reset-button`)

    expect(tracked.reset_calls).toEqual([[key, reference_value, reference_present]])
    expect(Object.hasOwn(tracked.values, key)).toBe(reference_present)
    if (reference_present) expect(tracked.values[key]).toEqual(reference_value)
    expect(document.querySelector(`.setting-reset-button`)).toBeNull()
    expect(document.querySelector(`.reset-button`)).toBeNull()
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

    const toggle = document.querySelector<HTMLButtonElement>(`.description-toggle`)
    expect(document.querySelector(`h4`)?.textContent?.trim()).toBe(`Pointer sensitivity`)
    expect(toggle?.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(document.querySelectorAll(`.settings-row-description`)).toHaveLength(0)
    const nested_controls = [...document.querySelectorAll(`[data-key="nested"] input`)]
    expect(nested_controls.map((control) => control.getAttribute(`aria-label`))).toEqual([
      `Nested label`,
      `Nested label`,
    ])
    expect(
      document
        .querySelector(`[data-key="rotation_damping"]`)
        ?.getAttribute(`data-description`),
    ).toBe(`Motion inertia after releasing the pointer`)

    await click_and_tick(`.description-toggle`)
    expect(toggle?.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(
      [...document.querySelectorAll(`.settings-row-description`)].map(
        (description) => description.textContent,
      ),
    ).toEqual([`Pointer rotation speed`, `Motion inertia after releasing the pointer`])

    await click_and_tick(`.description-toggle`)
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

    const explain = doc_query<HTMLButtonElement>(`.description-toggle`)
    expect([explain.textContent?.trim(), explain.getAttribute(`aria-label`)]).toEqual([
      `Erklären`,
      `Show descriptions for atoms`,
    ])
    await click_and_tick(`.description-toggle`)
    expect(explain.getAttribute(`aria-label`)).toBe(`Hide descriptions for atoms`)

    const reset = doc_query<HTMLButtonElement>(`.settings-section-heading .reset-button`)
    expect([
      reset.textContent?.trim(),
      reset.getAttribute(`title`),
      reset.getAttribute(`aria-label`),
    ]).toEqual([`Reset`, `Atoms zurücksetzen`, `Atoms zurücksetzen`])

    // the per-row reset button injected by on_reset_key reads from labels too
    const row_reset = doc_query(`.setting-reset-button`)
    expect([
      row_reset.getAttribute(`title`),
      row_reset.getAttribute(`aria-label`),
    ]).toEqual([`Radius zurücksetzen`, `Radius zurücksetzen`])

    // Svelte updates reactive label text in place, without replacing the element.
    const label_text = doc_query(`[data-key="radius"] > span`).firstChild
    if (!label_text) throw new Error(`Missing radius label text`)
    label_text.nodeValue = `Atom radius`
    await tick()
    expect([
      row_reset.getAttribute(`title`),
      row_reset.getAttribute(`aria-label`),
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
    const button = doc_query<HTMLButtonElement>(`.setting-reset-button`)
    button.focus()
    expect(document.activeElement).toBe(button)

    button.click()
    await tick()

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
      expect(row.classList.contains(`setting-resettable`)).toBe(true)
      expect(Boolean(row.querySelector(`.setting-reset-button`))).toBe(radius !== 1)
      expect(
        doc_query(`[data-key="unknown"]`).classList.contains(`setting-resettable`),
      ).toBe(true)
    }
    tracked.values = {}
    await tick()
    expect(row.classList.contains(`setting-resettable`)).toBe(true)
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
    expect(
      document.querySelector(`[data-key="radius"]`)?.getAttribute(`data-description`),
    ).toBe(``)
  })

  test(`refreshes replaced controls, changed keys, and remounted rows`, async () => {
    render(SettingsSectionRerenderHarness, {})
    await tick()

    const settings_row = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(`[data-generation]`)
    const expect_single_enhancement = (): void => {
      expect(settings_row()?.querySelectorAll(`.settings-row-description`)).toHaveLength(
        1,
      )
      expect(settings_row()?.querySelectorAll(`.setting-reset-button`)).toHaveLength(1)
    }

    // same nodes, not replacements: a value edit re-enhances in place instead of tearing
    // every description and reset button off and back on
    const palette_description = doc_query(
      `[data-key="palette"] .settings-row-description`,
    )
    await click_and_tick(`[data-testid="change-radius"]`)
    expect(document.querySelector(`[data-key="palette"] .settings-row-description`)).toBe(
      palette_description,
    )
    expect_single_enhancement()
    expect(settings_row()?.querySelector(`input`)?.getAttribute(`aria-label`)).toBe(
      `Radius`,
    )

    const previous_input = settings_row()?.querySelector(`input`)
    await click_and_tick(`[data-testid="replace-input"]`)
    expect(settings_row()?.querySelector(`input`)).not.toBe(previous_input)
    expect(settings_row()?.querySelector(`input`)?.getAttribute(`aria-label`)).toBe(
      `Radius`,
    )
    expect_single_enhancement()

    await click_and_tick(`[data-testid="change-key"]`)
    expect(settings_row()?.dataset.key).toBe(`diameter`)
    expect(
      settings_row()?.querySelector(`.setting-reset-button`)?.getAttribute(`aria-label`),
    ).toBe(`Reset Radius to default`)
    await click_and_tick(`.setting-reset-button`, settings_row())
    expect(settings_row()?.querySelector(`.setting-reset-button`)).toBeNull()
    expect(document.querySelector(`.reset-button`)).not.toBeNull()

    await click_and_tick(`[data-testid="change-key"]`)
    expect_single_enhancement()

    const previous_row = settings_row()
    await click_and_tick(`[data-testid="replace-radius"]`)
    expect(settings_row()).not.toBe(previous_row)
    expect(settings_row()?.dataset.generation).toBe(`1`)
    expect_single_enhancement()

    await click_and_tick(`[data-testid="toggle-radius"]`)
    expect(settings_row()).toBeNull()
    await click_and_tick(`[data-testid="toggle-radius"]`)
    expect_single_enhancement()

    await click_and_tick(`.setting-reset-button`, settings_row())
    expect(settings_row()?.querySelector(`.setting-reset-button`)).toBeNull()
    expect(settings_row()?.querySelectorAll(`.settings-row-description`)).toHaveLength(1)
    expect(document.querySelector(`.reset-button`)).toBeNull()
  })
})
