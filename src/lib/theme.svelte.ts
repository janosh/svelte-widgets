// Headless theme helpers shared by ThemeToggle and callers that set theme without the
// button (CommandMenu / PageSearch actions).

import { persisted_choice, storage_set } from './storage'

const THEME_MODES = [`light`, `dark`, `system`] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_MODE_CYCLE = {
  light: `system`,
  system: `dark`,
  dark: `light`,
} as const

const system_preference = (): `light` | `dark` =>
  typeof matchMedia !== `undefined` && matchMedia(`(prefers-color-scheme: dark)`).matches
    ? `dark`
    : `light`

const resolve_theme_mode = (initial_mode: ThemeMode = `system`): ThemeMode =>
  persisted_choice(`theme`, THEME_MODES, initial_mode)

// Shared so ThemeToggle's icon stays in sync when apply_theme_mode is called elsewhere
let theme_mode = $state<ThemeMode>(`system`)
export const theme = {
  get mode(): ThemeMode {
    return theme_mode
  },
}

export const apply_theme_mode = (mode: ThemeMode): void => {
  if (typeof document === `undefined`)
    throw new TypeError(`apply_theme_mode(${mode}) is client-only`)
  const effective = mode === `system` ? system_preference() : mode
  document.documentElement.style.colorScheme = effective
  document.documentElement.dataset.theme = effective
  theme_mode = mode
  storage_set(`theme`, mode)
}

// Mount once per owner and dispose with it. Also works without a ThemeToggle.
export const watch_theme = (): (() => void) => {
  if (typeof document === `undefined`) throw new TypeError(`watch_theme() is client-only`)
  // Read a valid stored choice on every start, retaining in-memory choices if none is readable.
  apply_theme_mode(resolve_theme_mode(theme.mode))
  const color_scheme_query = matchMedia(`(prefers-color-scheme: dark)`)
  const on_change = () => {
    if (theme.mode === `system`) apply_theme_mode(`system`)
  }
  const on_storage = ({ key, storageArea: storage_area }: StorageEvent) => {
    if (storage_area === localStorage && (key === null || key === `theme`))
      apply_theme_mode(resolve_theme_mode())
  }
  globalThis.addEventListener(`storage`, on_storage)
  color_scheme_query.addEventListener(`change`, on_change)
  return () => {
    globalThis.removeEventListener(`storage`, on_storage)
    color_scheme_query.removeEventListener(`change`, on_change)
  }
}
