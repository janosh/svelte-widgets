// A value that shows `next` for duration_ms after each show(), then falls back to `resting`
export type Flash<T> = { readonly value: T; show: (value: T) => void; reset: () => void }

export function create_flash<T>(resting: T, duration_ms: number): Flash<T> {
  let value = $state(resting)
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => () => clearTimeout(timer))

  return {
    get value() {
      return value
    },
    show: (next: T) => {
      clearTimeout(timer)
      value = next
      timer = setTimeout(() => (value = resting), duration_ms)
    },
    reset: () => {
      clearTimeout(timer)
      value = resting
    },
  }
}

// Highlights the control a keyboard shortcut just triggered: show(control) flashes it for
// 400 ms and style(control) is that control's inline style. Inline styles reach controls
// inside child components without changing their icon or hit area.
export function create_shortcut_flash<T extends string>() {
  const flash = create_flash<T | undefined>(undefined, 400)
  const color = `color-mix(in srgb, var(--accent-color, #4a9eff) 35%, transparent)`
  return {
    show: flash.show,
    style: (control: T): string =>
      flash.value === control
        ? `background: ${color}; box-shadow: 0 0 0 1px ${color}; transition: none`
        : `transition: background-color 0.2s ease-out, box-shadow 0.2s ease-out`,
  }
}
