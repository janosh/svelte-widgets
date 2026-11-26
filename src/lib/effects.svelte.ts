// Rune-based effect helpers: reduced-motion durations, delayed busy flags, on-screen
// tracking, visibility-gated pulse animations and self-written bindable props.

import { untrack } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import { prefersReducedMotion } from 'svelte/motion'
import { in_view } from './attachments/in-view'

// Animation length honoring the OS "reduce motion" setting: 0 (snap) while it is on. Reactive
// when read in an effect or template, so flipping the setting applies without a reload.
export const motion_duration = (ms: number): number =>
  prefersReducedMotion.current ? 0 : ms

type PulseAnimationOptions = {
  step?: number // phase advance per frame
  on_tick?: () => void
  // Element the pulse decorates. When given, the loop pauses while it is off screen, since
  // on_tick callers repaint a whole canvas or invalidate a 3D scene on every frame.
  element?: () => Element | null | undefined
}

type PulseAnimation = { readonly time: number; readonly unit: number }

// `unit` swings through one full cycle every 2π/PULSE_FREQUENCY units of `time`
const PULSE_FREQUENCY = 4

// `busy`, switching on once it has held for delay_ms and off once it has been idle as long:
// work that usually finishes sooner (each playback frame's read, each slider step's recompute)
// shows no spinner or dimming, and work that keeps restarting (slow frame after slow frame)
// keeps it up, where an instant one flashed and shifted the layout on every update. Creates
// an $effect, so call it during component init.
export function create_delayed_flag(
  busy: () => boolean,
  delay_ms = 300,
): { readonly current: boolean } {
  let current = $state(false)
  $effect(() => {
    const target = busy()
    const timer = setTimeout(() => (current = target), delay_ms)
    return () => clearTimeout(timer)
  })
  return {
    get current() {
      return current
    },
  }
}

// Whether a node is on screen, with `attach` as its attachment. Optimistic until an observer
// says otherwise: waiting for the first callback would delay whatever this gates, and stall
// forever under test DOMs whose stub IntersectionObserver never fires (happy-dom). A gated
// animation wastes at most a frame off screen.
export function create_on_screen(): { readonly current: boolean; attach: Attachment } {
  let on_screen = $state(true)
  return {
    get current() {
      return on_screen
    },
    attach: (node) => {
      const stop_observing = in_view((visible) => (on_screen = visible))(node)
      return () => {
        stop_observing()
        on_screen = true // nothing gates it until a new observer reports
      }
    },
  }
}

export function create_pulse_animation(
  active: () => boolean,
  { step = 0.02, on_tick, element }: PulseAnimationOptions = {},
): PulseAnimation {
  let time = $state(0)
  let frame_id: number | null = null
  const cancel_frame = () => {
    if (frame_id == null) return
    cancelAnimationFrame(frame_id)
    frame_id = null
  }
  // Inactive pulses restart from phase zero when they next light up
  const stop = () => {
    cancel_frame()
    time = 0
  }

  const visibility = create_on_screen()
  $effect(() => {
    const node = element?.()
    return node ? visibility.attach(node) : undefined
  })

  // Reduced motion holds the pulse at its resting phase: highlights stay visible, just still
  $effect(() => {
    if (!active() || prefersReducedMotion.current) return stop()
    // Pause, don't stop: `time` survives so the pulse resumes mid-phase, and resetting it
    // would republish `unit` to every consumer — the repaints this gate exists to avoid.
    if (!visibility.current) return cancel_frame()

    const animate = () => {
      const running = frame_id
      time += step
      on_tick?.()
      // on_tick destroyed the owner or re-ran this effect, whose cleanup or new loop took over
      if (frame_id !== running) return
      if (!active()) return stop()
      frame_id = requestAnimationFrame(animate)
    }
    frame_id = requestAnimationFrame(animate)
    return cancel_frame
  })

  return {
    get time() {
      return time
    },
    get unit() {
      return 0.5 + 0.5 * Math.sin(time * PULSE_FREQUENCY)
    },
  }
}

// A bindable prop the component writes itself, as state its deriveds read instead of the prop.
// A derived that re-runs inside a teardown (e.g. a bind:this resolving a prop through callers'
// spreads) reads a prop its component wrote and no caller binds untracked (Svelte 5.57's
// prop() returns the bare value then), so it loses that dependency and never updates again.
// `current` writes through to the prop; the caller's own writes arrive through `get`. Creates
// an $effect.pre, so it must be called during component init.
export function create_prop_state<T>(
  get: () => T,
  set: (value: T) => void,
): { current: T } {
  let value = $state.raw(untrack(get))
  $effect.pre(() => {
    const next = get()
    // Written from a throwaway root: Svelte re-walks every derived below a state an effect
    // writes, looking for that effect (self-invalidation), which this one never reads. That
    // second walk was ~4 ms of each caller-driven step of a parameter sweep.
    $effect.root(() => {
      value = next
    })()
  })
  return {
    get current() {
      return value
    },
    set current(next: T) {
      value = next
      set(next)
    },
  }
}
