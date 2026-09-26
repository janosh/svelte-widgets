import { mount, tick, unmount, type Component, type MountOptions } from 'svelte'
import { afterEach, onTestFinished, vi } from 'vitest'

import { MultiSelect } from '$lib'
import type { MultiSelectProps } from '$lib/types'
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

// clicks the element matching selector, then flushes the resulting update
export async function click(selector: string): Promise<void> {
  doc_query(selector).click()
  await tick()
}

// presses each key in order as a fresh keydown, flushing after every press
export async function press_keys(target: EventTarget, ...keys: string[]): Promise<void> {
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
  vi.useRealTimers() // tests opting into fake timers need no try/finally of their own
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
