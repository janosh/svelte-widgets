import { create_flash, create_shortcut_flash } from '#lib/browser/flash.svelte.ts'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

describe(`create_flash`, () => {
  // in an effect root, since the timer is dropped by a teardown effect
  const mount_flash = () => {
    let flash!: ReturnType<typeof create_flash<string>>
    const dispose = $effect.root(() => void (flash = create_flash(`idle`, 1000)))
    flushSync()
    return { flash, teardown: () => flushSync(dispose) }
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // without clearing the pending timer, the first show's timeout lands mid-window and hides
  // the second one early
  test(`reverts once the window elapses, a second show restarting the window`, () => {
    const { flash, teardown } = mount_flash()
    expect(flash.current).toBe(`idle`)
    flash.show(`first`)
    expect(flash.current).toBe(`first`)
    vi.advanceTimersByTime(900)
    flash.show(`second`)
    vi.advanceTimersByTime(100) // the first timer would have fired here
    expect(flash.current).toBe(`second`)
    vi.advanceTimersByTime(899)
    expect(flash.current).toBe(`second`)
    vi.advanceTimersByTime(1)
    expect(flash.current).toBe(`idle`)
    teardown()
  })

  // a leaked timer is invisible through `value` (it writes the resting value reset already
  // wrote), so the pending count says whether reset dropped it
  test(`reset reverts at once and leaves no pending timer`, () => {
    const { flash, teardown } = mount_flash()
    flash.show(`copied`)
    expect(vi.getTimerCount()).toBe(1)
    flash.reset()
    expect([flash.current, vi.getTimerCount()]).toEqual([`idle`, 0])
    teardown()
  })

  test(`tearing down inside the window drops the pending timer`, () => {
    const { flash, teardown } = mount_flash()
    flash.show(`copied`)
    teardown()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2000) // a surviving timer would revert this to `idle`
    expect(flash.current).toBe(`copied`)
  })
})

// only the flashed control gets the highlight, fades back after 400 ms, and then leaves the
// control's own transitions alone
test(`create_shortcut_flash highlights only the flashed control for 400 ms, then fades`, () => {
  vi.useFakeTimers()
  let flash!: ReturnType<typeof create_shortcut_flash<`play` | `next`>>
  const dispose = $effect.root(() => void (flash = create_shortcut_flash()))
  const highlighted = (control: `play` | `next`) =>
    flash.style(control).startsWith(`background`)
  flash.show(`play`)
  expect([highlighted(`play`), highlighted(`next`)]).toEqual([true, false])
  vi.advanceTimersByTime(399)
  expect(highlighted(`play`)).toBe(true)
  vi.advanceTimersByTime(1)
  expect([highlighted(`play`), flash.style(`play`)]).toEqual([
    false,
    `transition: background-color 0.2s ease-out, box-shadow 0.2s ease-out`,
  ])
  vi.advanceTimersByTime(200)
  expect([flash.style(`play`), flash.style(`next`)]).toEqual([``, ``])
  flushSync(dispose)
})
