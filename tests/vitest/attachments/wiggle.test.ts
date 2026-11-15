import { create_wiggle, WIGGLE_DEFAULTS, wiggle_frames } from '#lib/attachments/wiggle.ts'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import type { MockInstance } from 'vite-plus/test'

const FRAME_MS = 1000 / 60
const to_keyframes = (frames: ReturnType<typeof wiggle_frames>) =>
  frames.map(([angle, scale, dx, dy]) => ({
    transform: `rotate(${angle}deg) scale(${scale}) translate(${dx}px, ${dy}px)`,
  }))

describe(`wiggle_frames`, () => {
  test.each([50, 200, 500])(
    `pulls toward the peak for duration_ms=%d, then settles exactly at rest`,
    (duration_ms) => {
      const frames = wiggle_frames({ angle: 20, duration_ms })
      expect(frames[0]).toEqual([0, 1, 0, 0])
      expect(frames.at(-1)).toEqual([0, 1, 0, 0])
      // the pull phase leans toward the peak (it may overshoot it, never cross back past rest)
      const pull = frames
        .slice(1, Math.floor(duration_ms / FRAME_MS) + 1)
        .map(([angle]) => angle)
      expect(Math.min(...pull)).toBeGreaterThan(0)
      // and it swings back past rest afterwards: the default spring is underdamped
      expect(Math.min(...frames.map(([angle]) => angle))).toBeLessThan(0)
      // only animated components move
      for (const [, scale, dx, dy] of frames) expect([scale, dx, dy]).toEqual([1, 0, 0])
    },
  )

  test(`steps svelte/motion's Spring at one 60 Hz frame per pose`, () => {
    const { stiffness, damping } = WIGGLE_DEFAULTS
    const [, second, third] = wiggle_frames({ dx: 10 })
    // first step from rest: velocity 0, so d = stiffness * delta
    expect(second[2]).toBeCloseTo(stiffness * 10, 12)
    const velocity = second[2]
    expect(third[2]).toBeCloseTo(
      second[2] + velocity + stiffness * (10 - second[2]) - damping * velocity,
      12,
    )
  })

  test(`continues from a mid-wiggle pose with its momentum`, () => {
    const [last, current] = [
      [5, 1, 0, 0],
      [8, 1, 0, 0],
    ] as [number, number, number, number][]
    const frames = wiggle_frames({ angle: 20 }, [last, current])
    expect(frames[0]).toEqual(current)
    // velocity 3 carries on, plus the pull toward 20, minus damping
    const { stiffness, damping } = WIGGLE_DEFAULTS
    expect(frames[1][0]).toBeCloseTo(8 + 3 + stiffness * 12 - damping * 3, 12)
  })

  test(`cuts a spring that never settles back to rest`, () => {
    const frames = wiggle_frames({ angle: 45, stiffness: 0.5, damping: 0 })
    expect(frames).toHaveLength(601)
    expect(frames.at(-1)).toEqual([0, 1, 0, 0])
    expect(Math.abs(frames.at(-2)?.[0] ?? 0)).toBeGreaterThan(1)
  })
})

describe(`create_wiggle`, () => {
  let reduce_motion = false
  let animate: MockInstance<HTMLElement[`animate`]>
  beforeEach(() => {
    reduce_motion = false
    vi.spyOn(globalThis, `matchMedia`).mockImplementation(
      (query) =>
        ({ matches: query.includes(`reduce`) && reduce_motion }) as MediaQueryList,
    )
    animate = vi.spyOn(HTMLElement.prototype, `animate`)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test(`trigger animates every attached node with the spring keyframes`, () => {
    const options = { scale: 1.2, duration_ms: 100 }
    const shake = create_wiggle(options)
    const nodes = [document.createElement(`span`), document.createElement(`button`)]
    for (const node of nodes) shake.attach(node)
    shake.trigger()

    const frames = wiggle_frames(options)
    expect(animate.mock.contexts).toEqual(nodes)
    for (const [keyframes, timing] of animate.mock.calls) {
      expect(keyframes).toEqual(to_keyframes(frames))
      expect(timing).toEqual({
        duration: (frames.length - 1) * FRAME_MS,
        easing: `linear`,
      })
    }
  })

  test(`reads options on every trigger, so mutating them retunes the next wiggle`, () => {
    const options = { angle: 10 }
    const shake = create_wiggle(options)
    shake.attach(document.createElement(`span`))
    shake.trigger()
    options.angle = 30
    shake.trigger()
    expect(animate.mock.calls[1][0]).toEqual(to_keyframes(wiggle_frames({ angle: 30 })))
  })

  test(`a re-trigger cancels the running wiggle and continues from its pose, or from rest once it ended`, () => {
    vi.useFakeTimers({ toFake: [`performance`] })
    const shake = create_wiggle({ angle: 20 })
    shake.attach(document.createElement(`span`))
    shake.trigger()
    const first = animate.mock.results[0].value as Animation
    const cancel = vi.spyOn(first, `cancel`)
    vi.advanceTimersByTime(10 * FRAME_MS)
    shake.trigger()
    expect(cancel).toHaveBeenCalledOnce()
    // the second wiggle continues from frame 10 with its momentum, not from rest
    const frames = wiggle_frames({ angle: 20 })
    const resumed = wiggle_frames({ angle: 20 }, [frames[9], frames[10]])
    expect(animate.mock.calls[1][0]).toEqual(to_keyframes(resumed))
    // once that wiggle has ended, the next one starts from rest again
    vi.advanceTimersByTime(20_000)
    shake.trigger()
    expect(animate.mock.calls[2][0]).toEqual(animate.mock.calls[0][0])
  })

  test(`does nothing while the user prefers reduced motion`, () => {
    reduce_motion = true
    const shake = create_wiggle({ angle: 20 })
    shake.attach(document.createElement(`span`))
    shake.trigger()
    expect(animate).not.toHaveBeenCalled()
  })

  test(`detaching cancels the node's wiggle, and a fresh node after the last detach starts from rest`, () => {
    vi.useFakeTimers({ toFake: [`performance`] })
    const shake = create_wiggle({ angle: 20 })
    const detach = shake.attach(document.createElement(`span`))
    shake.trigger()
    const cancel = vi.spyOn(animate.mock.results[0].value as Animation, `cancel`)
    vi.advanceTimersByTime(10 * FRAME_MS)
    if (typeof detach === `function`) detach()
    expect(cancel).toHaveBeenCalledOnce()
    shake.trigger() // no nodes left: animates nothing and starts no wiggle to resume
    expect(animate).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(10 * FRAME_MS)
    // neither the cancelled pose nor the node-less trigger carries over
    shake.attach(document.createElement(`span`))
    shake.trigger()
    expect(animate.mock.calls[1][0]).toEqual(animate.mock.calls[0][0])
  })
})
