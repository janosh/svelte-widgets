import { mount, tick, unmount, type Component, type MountOptions } from 'svelte'
import { afterEach, onTestFinished } from 'vite-plus/test'

import { MultiSelect } from '#lib'
import type { MultiSelectProps } from '#lib/types.ts'
import { doc_query } from './index'

type MountedComponent = Parameters<typeof unmount>[0]
const mounted_components = new Set<MountedComponent>()

export const mount_component = <Props extends object, Exports extends MountedComponent>(
  component: Component<Props, Exports>,
  options: MountOptions<NoInfer<Props>>,
): Exports => {
  const mounted = mount(component, options)
  mounted_components.add(mounted)
  return mounted
}

export const unmount_component = async (component: MountedComponent): Promise<void> => {
  mounted_components.delete(component)
  await unmount(component)
}

export const mount_multiselect = (
  props: MultiSelectProps,
  target: HTMLElement = document.body,
) => mount_component(MultiSelect, { target, props })

// fresh event per dispatch: happy-dom never resets the stop-propagation flag,
// so shared event instances go inert once a handler calls stopPropagation()
export const fresh_mousemove = () => new MouseEvent(`mousemove`, { bubbles: true })
export const fresh_key = (key: string) =>
  new KeyboardEvent(`keydown`, { key, bubbles: true })

// presses each key in order as a fresh keydown, flushing after every press
export async function press_sequence(
  target: EventTarget,
  ...keys: string[]
): Promise<void> {
  for (const key of keys) {
    target.dispatchEvent(fresh_key(key))
    await tick()
  }
}

const console_methods = { error: console.error, warn: console.warn }

export const normalized_text = (element: Element) =>
  element.textContent?.replaceAll(/\s+/gu, ` `).trim()

afterEach(async () => {
  await Promise.all([...mounted_components].map(unmount_component))
  Object.assign(console, console_methods)
})

// the visible search input; the hidden form-control input carries no autocomplete attr
export const get_input = () => doc_query<HTMLInputElement>(`input[autocomplete]`)

// focusing the search input is what opens the dropdown
export async function focus_input(): Promise<HTMLInputElement> {
  const input = get_input()
  input.focus()
  await tick()
  return input
}

// the dropdown toggles on mouseup, not click
export async function mouseup(target: string | Element): Promise<void> {
  const element = typeof target === `string` ? doc_query(target) : target
  element.dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
}

export async function type_search_text(
  search_text: string,
  input = get_input(),
): Promise<HTMLInputElement> {
  input.value = search_text
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await tick()
  return input
}

// a detached-from-network form: submission is prevented and the node removed after the test
export const make_form = (): HTMLFormElement => {
  const form = document.createElement(`form`)
  form.addEventListener(`submit`, (event) => event.preventDefault())
  document.body.append(form)
  onTestFinished(() => form.remove())
  return form
}

// rendered dropdown option rows: select-all and message rows also carry role=option, so
// they're excluded (group headers and virtual-list spacers have other roles)
export const option_rows = (): HTMLLIElement[] => [
  ...document.querySelectorAll<HTMLLIElement>(
    `ul.options > li[role="option"]:not(.select-all, .user-msg)`,
  ),
]
export const option_texts = () => option_rows().map((row) => row.textContent?.trim())

export const option_by_label = (label: string): HTMLLIElement => {
  const row = option_rows().find((item) => item.textContent?.trim() === label)
  if (!row) throw new Error(`No option row labeled "${label}" in ${option_texts()}`)
  return row
}

// trimmed text of the keyboard-active dropdown row
export const active_text = () => doc_query(`ul.options > li.active`).textContent?.trim()

// trimmed text of the dropdown message row (create/no-match/duplicate), undefined if absent
export const user_msg_text = () =>
  document.querySelector(`.user-msg`)?.textContent?.trim()

export const selected_chips = () => document.querySelectorAll(`ul.selected > li`)
// whitespace-normalized text of all selected chips
export const selected_text = () => normalized_text(doc_query(`ul.selected`))

// the polite screen-reader announcement region
export const live_region = () => doc_query(`.sr-only[aria-live="polite"]`)
