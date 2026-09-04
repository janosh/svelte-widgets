import { SettingsSearch } from '$lib'
import type { SettingsSearchLabels } from '$lib/labels'
import { createRawSnippet, mount, tick } from 'svelte'
import { describe, expect, test } from 'vitest'
import { doc_query } from './index'
import SettingsSearchHarness from './SettingsSearchHarness.svelte'

const set_query = async (input: HTMLInputElement, query: string): Promise<void> => {
  input.value = query
  input.dispatchEvent(new Event(`input`, { bubbles: true }))
  await tick()
}
const setting_row = (key: string) => doc_query(`[data-key="${key}"]`)
// Filtering marks its own attribute, so `hidden` stays whatever the caller set it to
const filtered_out = (element: Element) => element.hasAttribute(`data-search-hidden`)

const mount_harness = async (
  props: { trigger?: `inline` | `icon`; initial_query?: string } = {},
): Promise<void> => {
  mount(SettingsSearchHarness, { target: document.body, props })
  await tick()
}

const mounted_search = async () => {
  await mount_harness()
  const input = doc_query<HTMLInputElement>(`input[type="search"]`)
  const [appearance, camera] = [
    ...document.querySelectorAll<HTMLDetailsElement>(`details.settings-group`),
  ]
  if (!appearance || !camera) {
    throw new Error(`Settings search harness failed to mount`)
  }
  return { input, appearance, camera }
}

describe(`SettingsSearch`, () => {
  test(`matches labels and descriptions while expanding only matching groups`, async () => {
    const { input, appearance, camera } = await mounted_search()

    await set_query(input, `radius`)
    expect(filtered_out(appearance)).toBe(false)
    expect(filtered_out(camera)).toBe(true)
    expect(filtered_out(setting_row(`atom_radius`))).toBe(false)
    expect(filtered_out(setting_row(`color_scheme`))).toBe(true)
    expect(filtered_out(setting_row(`chart-legend`))).toBe(false)

    await set_query(input, `motion inertia`)
    expect(filtered_out(appearance)).toBe(true)
    expect(filtered_out(camera)).toBe(false)
    expect(camera.open).toBe(true)
    expect(filtered_out(setting_row(`rotation_damping`))).toBe(false)
    expect(filtered_out(setting_row(`zoom_speed`))).toBe(true)
  })

  test(`Escape clears filtering and restores each group's prior open state`, async () => {
    const { input, appearance, camera } = await mounted_search()
    const color_scheme = setting_row(`color_scheme`)
    expect(appearance.open).toBe(true)
    expect(camera.open).toBe(false)
    expect(color_scheme.hidden).toBe(true)

    await set_query(input, `damping`)
    expect(filtered_out(appearance)).toBe(true)
    expect(camera.open).toBe(true)

    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `Escape`, bubbles: true, cancelable: true }),
    )
    await tick()

    expect(input.value).toBe(``)
    expect(filtered_out(appearance)).toBe(false)
    expect(appearance.open).toBe(true)
    expect(filtered_out(camera)).toBe(false)
    expect(camera.open).toBe(false)
    expect(color_scheme.hidden).toBe(true)
    expect(document.querySelectorAll(`[data-key][hidden]`)).toHaveLength(1)
  })

  test(`restores group choices made before search starts`, async () => {
    const { input, appearance, camera } = await mounted_search()
    appearance.open = false
    camera.open = true
    appearance.dispatchEvent(new Event(`toggle`))
    camera.dispatchEvent(new Event(`toggle`))

    await set_query(input, `damping`)
    expect(filtered_out(appearance)).toBe(true)
    expect(camera.open).toBe(true)

    await set_query(input, ``)
    expect(appearance.open).toBe(false)
    expect(camera.open).toBe(true)
  })

  test(`leaves rows the caller hides after mount alone`, async () => {
    const { input, camera } = await mounted_search()
    const zoom_speed = setting_row(`zoom_speed`)
    expect(zoom_speed.hidden).toBe(false)

    doc_query<HTMLButtonElement>(`[data-testid="hide-zoom-speed"]`).click()
    await tick()
    expect(zoom_speed.hidden).toBe(true)

    // An idle (empty-query) refresh must not replay a stale baseline back over the caller
    document
      .querySelector(`[data-key="rotation_damping"]`)
      ?.append(document.createComment(``))
    await new Promise((resolve) => void queueMicrotask(() => resolve(null)))
    expect(zoom_speed.hidden).toBe(true)

    // ...nor may a match drag it back into view
    await set_query(input, `zoom speed`)
    expect(zoom_speed.hidden).toBe(true)
    expect(filtered_out(camera)).toBe(true)
    expect(document.querySelector(`[role="status"]`)?.textContent).toContain(
      `No settings match`,
    )

    await set_query(input, ``)
    expect(zoom_speed?.hidden).toBe(true)
  })

  test(`matches section rows without data-key and keeps forced groups open across queries`, async () => {
    const { input, appearance, camera } = await mounted_search()
    const segments = doc_query(`section.grid > label:not([data-key])`)
    const surface_quality = doc_query(`section.grid > .setting:not([data-key])`)

    await set_query(input, `sphere`)
    expect(filtered_out(segments)).toBe(false)
    expect(filtered_out(surface_quality)).toBe(true)
    expect(filtered_out(appearance)).toBe(false)
    expect(filtered_out(setting_row(`atom_radius`))).toBe(true)

    // search opens the collapsed Camera section; typing on must not drop that state, not
    // an instant, which is what re-running the whole attachment per keystroke did
    await set_query(input, `damping`)
    expect(camera.open).toBe(true)
    const open_writes: boolean[] = []
    const observer = new MutationObserver(() => open_writes.push(camera.open))
    observer.observe(camera, { attributes: true, attributeFilter: [`open`] })
    await set_query(input, `damping `)
    observer.disconnect()
    expect(open_writes).toEqual([])
    expect(camera.open).toBe(true)
    expect(filtered_out(segments)).toBe(true)

    await set_query(input, ``)
    expect(camera.open).toBe(false)
    expect(filtered_out(segments)).toBe(false)
  })

  // A pane with no room for a standing field parks a magnifier in the corner instead
  test(`trigger="icon" opens on click and collapses back to the trigger on Escape`, async () => {
    await mount_harness({ trigger: `icon` })
    expect(document.querySelector(`input[type="search"]`)).toBeNull()

    doc_query<HTMLButtonElement>(`.open-search`).click()
    await tick()
    const input = doc_query<HTMLInputElement>(`input[type="search"]`)
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute(`aria-label`)).toBe(`Search settings`)

    await set_query(input, `damping`)
    expect(filtered_out(setting_row(`zoom_speed`))).toBe(true)

    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `Escape`, bubbles: true, cancelable: true }),
    )
    await tick()
    expect(document.querySelector(`input[type="search"]`)).toBeNull()
    expect(document.activeElement).toBe(doc_query(`.open-search`))
    expect(filtered_out(setting_row(`zoom_speed`))).toBe(false)
  })

  // rows nest when a keyed wrapper holds keyed rows: a hit on either end keeps the group,
  // so a wrapper matched by its own label never hides its children
  test(`keeps nested rows visible when either end of the nesting matches`, async () => {
    const { input } = await mounted_search()

    await set_query(input, `rotation axes`) // matches the wrapper's data-label only
    expect(filtered_out(setting_row(`rotation`))).toBe(false)
    expect(filtered_out(setting_row(`rotation_x`))).toBe(false)

    await set_query(input, `sphere`) // matches neither end
    expect(filtered_out(setting_row(`rotation`))).toBe(true)
    expect(filtered_out(setting_row(`rotation_x`))).toBe(true)
  })

  // emptying the query must never collapse the field under the cursor: deriving open
  // state from `query` alone breaks the first case, dropping focus on clear the second
  test.each([
    {
      name: `opened by the trigger and cleared by typing`,
      initial_query: ``,
      open: async () => doc_query<HTMLButtonElement>(`.open-search`).click(),
      clear: (input: HTMLInputElement) => set_query(input, ``),
    },
    {
      // a query the user never typed: a restored session, or a deep link
      name: `opened by an initial query and cleared by the button`,
      initial_query: `radius`,
      open: async () => {},
      clear: async () => doc_query<HTMLButtonElement>(`.clear-search`).click(),
    },
  ])(`trigger="icon" stays open when $name`, async ({ initial_query, open, clear }) => {
    await mount_harness({ trigger: `icon`, initial_query })
    await open()
    await tick()
    const input = doc_query<HTMLInputElement>(`input[type="search"]`)
    await set_query(input, `radius`)

    await clear(input)
    await tick()

    expect(document.querySelector(`input[type="search"]`)).toBe(input)
    expect(input.value).toBe(``)
    expect(document.activeElement).toBe(input)
    expect(document.querySelector(`.open-search`)).toBeNull()
  })

  // Typing a heading reveals what it holds, even though no row repeats the heading's words
  test(`matches rows by their section and group titles`, async () => {
    const { input, appearance, camera } = await mounted_search()

    await set_query(input, `camera`)
    expect(filtered_out(camera)).toBe(false)
    expect(filtered_out(appearance)).toBe(true)
    expect(filtered_out(setting_row(`rotation_damping`))).toBe(false)
    expect(filtered_out(setting_row(`zoom_speed`))).toBe(false)

    await set_query(input, `atoms`)
    expect(filtered_out(appearance)).toBe(false)
    expect(filtered_out(camera)).toBe(true)
    expect(filtered_out(setting_row(`atom_radius`))).toBe(false)
  })

  test(`shows a status message for no matches and offers a clear button`, async () => {
    const { input, appearance, camera } = await mounted_search()
    await set_query(input, `unobtainium`)

    expect(filtered_out(appearance)).toBe(true)
    expect(filtered_out(camera)).toBe(true)
    const status = doc_query(`[role="status"]`)
    expect(status.textContent).toContain(`No settings match “unobtainium”.`)

    doc_query<HTMLButtonElement>(`.clear-search`).click()
    await tick()
    expect(input.value).toBe(``)
    // the button unmounts on clear, so focus has to land back in the field
    expect(document.activeElement).toBe(input)
    // the live region stays mounted and visible while its text clears
    expect(document.querySelector(`[role="status"]`)).toBe(status)
    expect(status.hidden).toBe(false)
    expect(status.textContent).toBe(``)
  })

  // mounted bare rather than through the harness, which forwards no `labels`
  test.each<[string, Partial<SettingsSearchLabels>, string, string]>([
    [
      `an empty partial keeps them`,
      {},
      `Clear settings search`,
      `No settings match “radius”.`,
    ],
    [
      `custom entries reach the DOM, interpolating the query`,
      {
        clear_search: `Suche leeren`,
        no_matches: (query) => `Nichts zu „${query}“ gefunden.`,
      },
      `Suche leeren`,
      `Nichts zu „radius“ gefunden.`,
    ],
  ])(`labels: %s`, async (_desc, labels, clear_label, status_text) => {
    mount(SettingsSearch, {
      target: document.body,
      props: {
        query: `radius`,
        labels,
        children: createRawSnippet(() => ({ render: () => `<div></div>` })),
      },
    })
    await tick()
    expect(doc_query(`.clear-search`).getAttribute(`aria-label`)).toBe(clear_label)
    expect(doc_query(`.no-matches`).textContent?.trim()).toBe(status_text)
  })
})
