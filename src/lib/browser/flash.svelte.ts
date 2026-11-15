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
