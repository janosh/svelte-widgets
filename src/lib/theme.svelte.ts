// Reactive theme mode shared by ThemeToggle and callers that set theme without the button
// (CommandMenu / PageSearch actions), plus everything rune-free from theme-core.ts, which
// bundles built without the Svelte compiler (workers, Node) import directly.

import { persisted_choice, storage_set } from './browser/index'
import {
  system_scheme,
  THEME_MODES,
  type ColorScheme,
  type ThemeMode,
} from './theme-core'

export * from './theme-core'

const resolve_theme_mode = (initial_mode: ThemeMode = `system`): ThemeMode =>
  persisted_choice(`theme`, THEME_MODES, initial_mode)

// Shared so ThemeToggle's icon stays in sync when apply_theme_mode is called elsewhere
let theme_mode = $state<ThemeMode>(`system`)
let theme_resolved = $state<ColorScheme>()
export const theme = {
  get mode(): ThemeMode {
    return theme_mode
  },
  // the applied light or dark scheme, which also changes when the OS flips in system mode
  get resolved(): ColorScheme | undefined {
    return theme_resolved
  },
}

export const apply_theme_mode = (mode: ThemeMode): void => {
  if (typeof document === `undefined`)
    throw new TypeError(`apply_theme_mode(${mode}) is client-only`)
  const effective = mode === `system` ? system_scheme() : mode
  document.documentElement.style.colorScheme = effective
  document.documentElement.dataset.theme = effective
  theme_mode = mode
  theme_resolved = effective
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
