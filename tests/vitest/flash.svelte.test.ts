import { create_flash } from '#lib/browser/flash.svelte.ts'
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
    expect(flash.value).toBe(`idle`)
    flash.show(`first`)
    expect(flash.value).toBe(`first`)
    vi.advanceTimersByTime(900)
    flash.show(`second`)
    vi.advanceTimersByTime(100) // the first timer would have fired here
    expect(flash.value).toBe(`second`)
    vi.advanceTimersByTime(899)
    expect(flash.value).toBe(`second`)
    vi.advanceTimersByTime(1)
    expect(flash.value).toBe(`idle`)
    teardown()
  })

  // a leaked timer is invisible through `value` (it writes the resting value reset already
  // wrote), so the pending count says whether reset dropped it
  test(`reset reverts at once and leaves no pending timer`, () => {
    const { flash, teardown } = mount_flash()
    flash.show(`copied`)
    expect(vi.getTimerCount()).toBe(1)
    flash.reset()
    expect([flash.value, vi.getTimerCount()]).toEqual([`idle`, 0])
    teardown()
  })

  test(`tearing down inside the window drops the pending timer`, () => {
    const { flash, teardown } = mount_flash()
    flash.show(`copied`)
    teardown()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2000) // a surviving timer would revert this to `idle`
    expect(flash.value).toBe(`copied`)
  })
})
