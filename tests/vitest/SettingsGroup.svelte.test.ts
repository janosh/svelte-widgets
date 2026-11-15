import { SettingsGroup } from '#lib'
import { tick } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

const children = raw_snippet(`<p>Controls</p>`)

test(`renders title, subtitle, children and details props`, () => {
  render(SettingsGroup, {
    title: `Appearance`,
    subtitle: `3 settings`,
    open: true,
    id: `appearance`,
    class: `extra`,
    children,
  })
  const group = doc_query<HTMLDetailsElement>(`details.settings-group.extra`)
  expect([
    group.open,
    group.id,
    doc_query(`summary .group-title`).textContent,
    doc_query(`summary .group-subtitle`).textContent,
    doc_query(`.group-body`).textContent,
    doc_query(`summary svg`).getAttribute(`aria-hidden`),
  ]).toEqual([true, `appearance`, `Appearance`, `3 settings`, `Controls`, `true`])
})

test(`binds open in both directions and omits unset subtitle`, async () => {
  const props = $state({ title: `Camera`, open: false, children })
  render(SettingsGroup, props)
  const group = doc_query<HTMLDetailsElement>(`details.settings-group`)
  expect(document.querySelector(`.group-subtitle`)).toBeNull()

  doc_query(`summary`).click()
  await tick()
  expect(props.open).toBe(true)

  props.open = false
  await tick()
  expect(group.open).toBe(false)
})

const controls = raw_snippet(`<label>Gap <input type="number" /></label>`)

// both modes put the controls in a fieldset named by the title, so disabled covers them all
test.each([true, false])(
  `collapsible=%s groups its controls in a disableable fieldset named by the title`,
  (collapsible) => {
    render(SettingsGroup, {
      title: `Stacking`,
      collapsible,
      disabled: true,
      class: `caller`,
      style: `margin-top: 3px`,
      children: controls,
    })
    const root = doc_query(`.settings-group.caller`)
    expect([root.tagName, root.style.marginTop]).toEqual([
      collapsible ? `DETAILS` : `FIELDSET`,
      `3px`,
    ])
    const fieldset = doc_query<HTMLFieldSetElement>(
      collapsible ? `fieldset.group-body` : `fieldset.static`,
    )
    const name_id = fieldset.getAttribute(`aria-labelledby`)
    const name = collapsible
      ? document.querySelector(`#${CSS.escape(name_id ?? ``)}`)?.textContent
      : fieldset.querySelector(`:scope > legend`)?.textContent
    expect([name, fieldset.disabled, fieldset.querySelector(`input`)?.type]).toEqual([
      `Stacking`,
      true,
      `number`,
    ])
    expect(document.querySelector(`summary`) !== null).toBe(collapsible)
  },
)
