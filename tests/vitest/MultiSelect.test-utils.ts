import { mount, tick, unmount, type Component, type MountOptions } from 'svelte'
import { afterEach } from 'vitest'
import { SvelteSet } from 'svelte/reactivity'

import { MultiSelect } from '$lib'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'

type MountedComponent = Parameters<typeof unmount>[0]
const mounted_components = new SvelteSet<MountedComponent>()

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

export async function type_search_text(
  search_text: string,
  input = get_input(),
): Promise<HTMLInputElement> {
  input.value = search_text
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await tick()
  return input
}
