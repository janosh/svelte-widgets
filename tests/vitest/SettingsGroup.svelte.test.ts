import { SettingsGroup } from '$lib'
import { createRawSnippet, mount, tick } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query } from './index'

const children = createRawSnippet(() => ({ render: () => `<p>Controls</p>` }))

test(`renders title, subtitle, children and details props`, () => {
  mount(SettingsGroup, {
    target: document.body,
    props: {
      title: `Appearance`,
      subtitle: `3 settings`,
      open: true,
      id: `appearance`,
      class: `extra`,
      children,
    },
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
  mount(SettingsGroup, { target: document.body, props })
  const group = doc_query<HTMLDetailsElement>(`details.settings-group`)
  expect(document.querySelector(`.group-subtitle`)).toBeNull()

  doc_query(`summary`).click()
  await tick()
  expect(props.open).toBe(true)

  props.open = false
  await tick()
  expect(group.open).toBe(false)
})
