import type { Attachment } from 'svelte/attachments'

// Peak offsets a wiggle springs toward before springing back; usually set just one of
// angle (deg), scale, dx or dy (px). stiffness and damping follow svelte/motion's Spring.
export const WIGGLE_DEFAULTS = {
  angle: 0, // try 20
  scale: 1, // try 1.2
  dx: 0, // try 10
  dy: 0, // try 10
  duration_ms: 200, // how long the spring pulls toward the peak before heading back
  stiffness: 0.05,
  damping: 0.1,
}
export type WiggleOptions = Partial<typeof WIGGLE_DEFAULTS>

type Pose = [angle: number, scale: number, dx: number, dy: number]
const REST: Pose = [0, 1, 0, 0]
const FRAME_MS = 1000 / 60
const MAX_FRAMES = 600 // a barely damped spring still ends within 10 s
const PRECISION = 0.01 // Spring's default settle threshold

// One pose per 60 Hz frame, stepping svelte/motion's Spring (dt = 1 frame, unit mass): toward
// the peak for duration_ms, then back to rest until every component settles. `from` is the
// [previous, current] pose to continue from, so a re-trigger mid-wiggle keeps its momentum.
export function wiggle_frames(
  options: WiggleOptions = {},
  from: [Pose, Pose] = [REST, REST],
): Pose[] {
  const { angle, scale, dx, dy, duration_ms, stiffness, damping } = {
    ...WIGGLE_DEFAULTS,
    ...options,
  }
  const peak: Pose = [angle, scale, dx, dy]
  let [last, current] = from
  const frames = [current]
  for (let frame = 1; frame < MAX_FRAMES; frame++) {
    const target = frame * FRAME_MS <= duration_ms ? peak : REST
    let settled = target === REST
    const next = current.map((value, idx) => {
      const delta = target[idx] - value
      const velocity = value - last[idx]
      const step = velocity + stiffness * delta - damping * velocity
      if (Math.abs(step) < PRECISION && Math.abs(delta) < PRECISION) return target[idx]
      settled = false
      return value + step
    }) as Pose
    ;[last, current] = [current, next]
    frames.push(next)
    if (settled) return frames
  }
  frames.push(REST) // cut a spring that never settles back to rest
  return frames
}

const to_transform = ([angle, scale, dx, dy]: Pose): string =>
  `rotate(${angle}deg) scale(${scale}) translate(${dx}px, ${dy}px)`

// Shakes every element it is attached to whenever trigger() is called, e.g. to flag a
// rejected input. Runs on the Web Animations API, so the element's own transform returns
// once the wiggle ends. Inline elements ignore transforms: attach to an inline-block or block.
// options is read on every trigger, so passing a $state object retunes the motion live.
// Does nothing while the user prefers reduced motion.
export function create_wiggle(options: WiggleOptions = {}): {
  attach: Attachment<HTMLElement>
  trigger: () => void
} {
  const animations = new Map<HTMLElement, Animation | undefined>()
  let frames: Pose[] = [REST]
  let started_at = 0

  return {
    attach: (node) => {
      animations.set(node, undefined)
      return () => {
        animations.get(node)?.cancel()
        animations.delete(node)
        // nothing left mid-wiggle, so the next node must not resume a cancelled pose
        if (animations.size === 0) frames = [REST]
      }
    },
    trigger: () => {
      if (
        animations.size === 0 ||
        globalThis.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches
      )
        return
      // continue from the running wiggle's [previous, current] frame, or rest once it ended
      const idx = Math.round((performance.now() - started_at) / FRAME_MS)
      const from: [Pose, Pose] =
        idx < frames.length - 1
          ? [frames[Math.max(idx - 1, 0)], frames[idx]]
          : [REST, REST]
      frames = wiggle_frames(options, from)
      started_at = performance.now()
      const keyframes = frames.map((pose) => ({ transform: to_transform(pose) }))
      const timing = { duration: (frames.length - 1) * FRAME_MS, easing: `linear` }
      for (const node of animations.keys()) {
        animations.get(node)?.cancel()
        animations.set(node, node.animate(keyframes, timing))
      }
    },
  }
}
