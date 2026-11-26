import {
  create_delayed_flag,
  create_on_screen,
  create_prop_state,
  create_pulse_animation,
  motion_duration,
} from '#lib/effects.svelte.ts'
import { flushSync } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vite-plus/test'

const requested_frames = new Map<number, FrameRequestCallback>()
let next_frame_id = 1

function install_animation_frame_mock(): void {
  next_frame_id = 1
  vi.stubGlobal(`requestAnimationFrame`, (callback: FrameRequestCallback) => {
    const frame_id = next_frame_id++
    requested_frames.set(frame_id, callback)
    return frame_id
  })
  vi.stubGlobal(`cancelAnimationFrame`, (frame_id: number) =>
    requested_frames.delete(frame_id),
  )
}

function run_frame(frame_id: number): void {
  const callback = requested_frames.get(frame_id)
  if (!callback) throw new Error(`No requested animation frame ${frame_id}`)
  requested_frames.delete(frame_id)
  callback(performance.now())
}

const stub_reduced_motion = (reduced: () => boolean): void => {
  vi.spyOn(prefersReducedMotion, `current`, `get`).mockImplementation(reduced)
}

// happy-dom's IntersectionObserver never calls back. This one reports visible a microtask after
// observe() like a browser, unless the test already delivered a verdict for that target.
const intersection_callbacks = new Map<Element, IntersectionObserverCallback>()
const last_verdict = new WeakMap<Element, boolean>()
const trigger_intersection = (target: Element, is_intersecting: boolean): void => {
  const callback = intersection_callbacks.get(target)
  if (!callback) throw new Error(`no IntersectionObserver is observing the given element`)
  last_verdict.set(target, is_intersecting)
  callback(
    [{ target, isIntersecting: is_intersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
}
class FakeIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    intersection_callbacks.set(target, this.callback)
    queueMicrotask(() => {
      if (intersection_callbacks.get(target) !== this.callback) return
      trigger_intersection(target, last_verdict.get(target) ?? true)
    })
  }
  disconnect(): void {
    for (const [target, callback] of intersection_callbacks)
      if (callback === this.callback) intersection_callbacks.delete(target)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  requested_frames.clear()
  intersection_callbacks.clear()
})

// the pulse lives in an effect root that is torn down when the test finishes
const start_pulse = (...args: Parameters<typeof create_pulse_animation>) => {
  install_animation_frame_mock()
  vi.stubGlobal(`IntersectionObserver`, FakeIntersectionObserver)
  let pulse: ReturnType<typeof create_pulse_animation> | undefined
  onTestFinished($effect.root(() => void (pulse = create_pulse_animation(...args))))
  if (!pulse) throw new Error(`create_pulse_animation returned nothing`)
  return pulse
}

describe(`create_pulse_animation`, () => {
  test(`resets time and stops after on_tick deactivates synchronously`, () => {
    const state = $state({ active: true })
    const pulse = start_pulse(() => state.active, {
      on_tick: () => {
        state.active = false
        flushSync()
      },
    })
    flushSync()
    run_frame(1)
    expect(pulse.time).toBe(0)
    expect(requested_frames.size).toBe(0)
  })

  // Ticks repaint a whole canvas or invalidate a 3D scene, so a pulse on an off-screen chart
  // is wasted work. It must still animate before any verdict arrives: gated components bind
  // their wrapper after mount, and an observer that never reports (happy-dom, or a real
  // browser in the moment before its first callback) must not stall the pulse.
  test(`animates until an observer reports off screen, then follows it`, async () => {
    const state = $state<{ node: HTMLElement | null }>({ node: null })
    const pulse = start_pulse(() => true, { element: () => state.node })
    flushSync()
    expect(requested_frames.size).toBe(1) // no element yet, so nothing to gate on

    const target = document.createElement(`div`)
    flushSync(() => (state.node = target))
    await Promise.resolve() // let the observer deliver its initial (visible) callback
    flushSync()
    expect(requested_frames.size).toBe(1)

    // Advance the phase so the pause below has something to preserve
    run_frame([...requested_frames.keys()][0])
    flushSync()
    const paused_at = pulse.time
    expect(paused_at).toBeGreaterThan(0)

    for (const [visible, expected_frames] of [
      [false, 0],
      [true, 1],
    ] as const) {
      trigger_intersection(target, visible)
      flushSync()
      expect(requested_frames.size).toBe(expected_frames)
      // Scrolling away pauses rather than resets: only going inactive rewinds the phase
      // (covered above), so the pulse resumes where it left off instead of jumping.
      expect(pulse.time).toBe(paused_at)
    }
  })

  // A chart mounted below the fold is reported off screen straight away. The observer's own
  // initial report arrives a microtask after observe(), so it must not overwrite a verdict
  // that has already landed.
  test(`stays paused when the first verdict is off screen`, async () => {
    const target = document.createElement(`div`)
    start_pulse(() => true, { element: () => target })
    flushSync()

    trigger_intersection(target, false)
    flushSync()
    expect(requested_frames.size).toBe(0)

    await Promise.resolve() // the observer's own initial report would land about here
    flushSync()
    expect(requested_frames.size).toBe(0)
  })
})

// optimistic until an observer reports, and back to on screen once detached, since no
// observer gates it any more
test(`create_on_screen follows its observer and resets on detach`, async () => {
  vi.stubGlobal(`IntersectionObserver`, FakeIntersectionObserver)
  const on_screen = create_on_screen()
  const node = document.createElement(`div`)
  const detach = on_screen.attach(node)
  expect(on_screen.current).toBe(true)
  trigger_intersection(node, false)
  await Promise.resolve() // the observer's initial report must not override the verdict
  expect(on_screen.current).toBe(false)
  detach?.()
  expect([on_screen.current, intersection_callbacks.size]).toEqual([true, 0])
})

describe(`reduced motion`, () => {
  test.each([
    [false, 400],
    [true, 0],
  ])(`motion_duration with reduce=%s gives %s ms`, (reduced, expected) => {
    stub_reduced_motion(() => reduced)
    expect(motion_duration(400)).toBe(expected)
  })

  test(`holds a pulse at rest while reduce motion is on, resumes when it turns off`, () => {
    const prefs = $state({ reduced: true })
    stub_reduced_motion(() => prefs.reduced)
    start_pulse(() => true)
    flushSync()
    expect(requested_frames.size).toBe(0)
    flushSync(() => (prefs.reduced = false))
    expect(requested_frames.size).toBe(1)
  })
})

// The state a component's deriveds read in place of a prop it writes itself: its own writes
// reach the prop, the caller's writes reach the state, and a derived over it follows both.
// Created inside an effect, its initial read must not subscribe that effect, which would
// rebuild the state on every caller write.
test(`create_prop_state mirrors a prop both ways`, () => {
  const prop = $state({ value: 1 })
  const written: number[] = []
  let mirror: { current: number } | undefined
  let doubled = () => NaN
  let creations = 0
  const seen: number[] = [] // what an effect below the state saw, once per change
  const dispose = $effect.root(() => {
    $effect(() => {
      creations++
      const state = create_prop_state(
        () => prop.value,
        (value) => {
          written.push(value)
          prop.value = value
        },
      )
      const twice = $derived(state.current * 2)
      mirror = state
      doubled = () => twice
      $effect(() => {
        seen.push(twice)
      })
    })
  })
  flushSync()
  if (!mirror) throw new Error(`create_prop_state returned nothing`)
  expect([mirror.current, doubled()]).toEqual([1, 2])
  mirror.current = 3 // the component's own write
  flushSync()
  expect([mirror.current, doubled(), prop.value, written]).toEqual([3, 6, 3, [3]])
  prop.value = 5 // the caller's
  flushSync()
  expect([mirror.current, doubled(), written]).toEqual([5, 10, [3]])
  expect([seen, creations]).toEqual([[2, 6, 10], 1])
  dispose()
})

// Work that finishes in time shows nothing, where an instant spinner flashed and shifted the
// layout on every update
test(`create_delayed_flag switches only once busy or idle has held for its delay`, () => {
  vi.useFakeTimers({ toFake: [`setTimeout`, `clearTimeout`] })
  const busy = $state({ value: false })
  let flag: { readonly current: boolean } | undefined
  const dispose = $effect.root(() => {
    flag = create_delayed_flag(() => busy.value, 300)
  })
  const step = (value: boolean, ms: number) => {
    busy.value = value
    flushSync()
    vi.advanceTimersByTime(ms)
    flushSync()
    return flag?.current
  }
  // quick work, again and again: never shown
  const quick = [step(true, 200), step(false, 50), step(true, 200), step(false, 0)]
  expect(quick).toEqual([false, false, false, false])
  expect([step(true, 299), step(true, 1)]).toEqual([false, true])
  // slow work after slow work keeps it up instead of blinking
  const slow = [step(false, 100), step(true, 300), step(false, 299), step(false, 1)]
  expect(slow).toEqual([true, true, true, false])
  dispose()
})
