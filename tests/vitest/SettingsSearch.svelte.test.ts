import { mount, tick } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'
import settings_search_source from '$lib/SettingsSearch.svelte?raw'
import { doc_query } from './index'
import SettingsSearchHarness from './SettingsSearchHarness.svelte'

const set_query = async (input: HTMLInputElement, query: string): Promise<void> => {
  input.value = query
  input.dispatchEvent(new Event(`input`, { bubbles: true }))
  await tick()
}
const setting_row = (key: string) => doc_query(`[data-key="${key}"]`)

const mounted_search = async () => {
  mount(SettingsSearchHarness, { target: document.body })
  await tick()
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
  test(`renders group title, subtitle, classes, and bound open state`, async () => {
    const { appearance, camera } = await mounted_search()
    expect(appearance.classList).toContain(`settings-group`)
    expect(appearance.classList).toContain(`appearance-group`)
    expect(appearance.open).toBe(true)
    expect(camera.open).toBe(false)
    expect(appearance.querySelector(`.group-title`)?.textContent).toBe(`Appearance`)
    expect(camera.querySelector(`.group-subtitle`)?.textContent).toBe(`Navigation`)
    expect(appearance.querySelector(`summary svg`)?.getAttribute(`aria-hidden`)).toBe(
      `true`,
    )
  })

  test(`matches labels and descriptions while expanding only matching groups`, async () => {
    const { input, appearance, camera } = await mounted_search()

    await set_query(input, `radius`)
    expect(appearance.hidden).toBe(false)
    expect(camera.hidden).toBe(true)
    expect(setting_row(`atom_radius`).hidden).toBe(false)
    expect(setting_row(`color_scheme`).hidden).toBe(true)
    expect(setting_row(`chart-legend`).hidden).toBe(false)

    await set_query(input, `motion inertia`)
    expect(appearance.hidden).toBe(true)
    expect(camera.hidden).toBe(false)
    expect(camera.open).toBe(true)
    expect(setting_row(`rotation_damping`).hidden).toBe(false)
    expect(setting_row(`zoom_speed`).hidden).toBe(true)
  })

  test(`Escape clears filtering and restores each group's prior open state`, async () => {
    const { input, appearance, camera } = await mounted_search()
    const color_scheme = setting_row(`color_scheme`)
    expect(appearance.open).toBe(true)
    expect(camera.open).toBe(false)
    expect(color_scheme.hidden).toBe(true)

    await set_query(input, `damping`)
    expect(appearance.hidden).toBe(true)
    expect(camera.open).toBe(true)

    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `Escape`, bubbles: true, cancelable: true }),
    )
    await tick()

    expect(input.value).toBe(``)
    expect(appearance.hidden).toBe(false)
    expect(appearance.open).toBe(true)
    expect(camera.hidden).toBe(false)
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
    expect(appearance.hidden).toBe(true)
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
    await new Promise((resolve) => queueMicrotask(() => resolve(null)))
    expect(zoom_speed.hidden).toBe(true)

    // ...nor may a match drag it back into view
    await set_query(input, `zoom speed`)
    expect(zoom_speed.hidden).toBe(true)
    expect(camera.hidden).toBe(true)
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
    // `hidden` alone loses to the `display: grid` a grid section puts on its rows, so the
    // keyless row needs the component's own override to actually disappear. happy-dom does
    // not apply Svelte's scoped styles, so the source is the only place to assert it from.
    expect(settings_search_source).toContain(`.settings-search :global([hidden])`)

    await set_query(input, `sphere`)
    expect(segments.hidden).toBe(false)
    expect(surface_quality.hidden).toBe(true)
    expect(appearance.hidden).toBe(false)
    expect(setting_row(`atom_radius`).hidden).toBe(true)

    // Camera starts collapsed; search opens it, and typing on must not drop that state — not
    // even for an instant, which is what re-running the whole attachment per keystroke did.
    await set_query(input, `damping`)
    expect(camera.open).toBe(true)
    const open_writes: boolean[] = []
    const observer = new MutationObserver(() => open_writes.push(camera.open))
    observer.observe(camera, { attributes: true, attributeFilter: [`open`] })
    await set_query(input, `dampin`)
    observer.disconnect()
    expect(open_writes).toEqual([])
    expect(camera.open).toBe(true)
    expect(segments.hidden).toBe(true)

    await set_query(input, ``)
    expect(camera.open).toBe(false)
    expect(segments.hidden).toBe(false)
  })

  test(`shows a status message for no matches and offers a clear button`, async () => {
    const { input, appearance, camera } = await mounted_search()
    await set_query(input, `unobtainium`)

    expect(appearance.hidden).toBe(true)
    expect(camera.hidden).toBe(true)
    const status = doc_query(`[role="status"]`)
    expect(status.textContent).toContain(`No settings match “unobtainium”.`)

    doc_query<HTMLButtonElement>(`.clear-search`).click()
    await tick()
    expect(input.value).toBe(``)
    // The mounted, visible live-region node stays observable while its text clears.
    expect(document.querySelector(`[role="status"]`)).toBe(status)
    expect(status.hidden).toBe(false)
    expect(status.textContent).toBe(``)
  })
})
