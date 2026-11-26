import { untrack } from 'svelte'
import { create_shortcut_flash } from './browser/flash.svelte.ts'
import { is_editable_event_target } from './shortcuts'
import { clamp } from './utils'

// Shared playback/navigation for ordered collections. Inputs are read lazily off one object
// (getters/setters or a $state proxy), like Svelte props, which preserves reactivity without
// taking ownership of bindable component state or domain callbacks.

// Whether a keydown reaching a sequence viewer (from inside it or forwarded from its window)
// is the viewer's to handle. Form fields keep their keys, except the SequenceControls slider,
// whose keys play the sequence; Enter/Escape in its step input commit by leaving the field.
// Space presses a focused button or toggles a <summary>, so playback must not swallow it there.
export function is_sequence_key_target(event: KeyboardEvent): boolean {
  const { target } = event
  if (!(target instanceof HTMLElement)) return true
  if (!target.matches(`.step-slider`) && is_editable_event_target(target)) {
    if (target.matches(`.step-input`) && [`Escape`, `Enter`].includes(event.key))
      target.blur()
    return false
  }
  return !(event.key === ` ` && target.closest(`button, summary, [role="button"]`))
}

export type SequencePlayerInputs = {
  readonly count: number
  // written only when a seek changes it
  index: number
  // written back snapped to the fps_step grid and clamped to fps_range
  fps: number
  readonly fps_range: readonly [number, number]
  readonly auto_play: boolean
  // FPS grid that keyboard nudges move along and bound values snap to (default 0.1),
  // read once at creation
  fps_step?: number
  // Async viewers must finish the requested frame before playback requests another.
  can_advance?: () => boolean
  on_play?: () => void
  on_pause?: () => void
  on_end?: () => void
  on_loop?: () => void
}

export function create_sequence_player(inputs: SequencePlayerInputs) {
  const { fps_step = 0.1 } = inputs
  const fps_scale = 1 / fps_step
  const snap_fps = (value: number, round = Math.round) =>
    round(value * fps_scale) / fps_scale
  let is_playing = $state(false)
  const shortcut_flash = create_shortcut_flash<
    `play` | `previous` | `next` | `step` | `fps`
  >()

  const fps_limits = $derived.by(() => {
    const [range_start, range_end] = inputs.fps_range
    const lower = Math.min(range_start, range_end)
    const upper = Math.max(range_start, range_end)
    const min = snap_fps(lower, Math.ceil)
    const max = snap_fps(upper, Math.floor)
    return min > max ? ([lower, lower] as const) : ([min, max] as const)
  })

  const normalize_fps = (value: number): number =>
    clamp(snap_fps(Number.isFinite(value) ? value : fps_limits[0]), ...fps_limits)
  const playback_fps = $derived(normalize_fps(inputs.fps))

  // Keep externally-bound values within the control range and configured step grid.
  $effect(() => {
    if (playback_fps !== inputs.fps) inputs.fps = playback_fps
  })

  function seek(index: number): void {
    const { count } = inputs
    if (count < 1 || !Number.isFinite(index)) return
    const next_index = clamp(Math.round(index), 0, count - 1)
    if (next_index !== inputs.index) inputs.index = next_index
  }
  const go_to = (index: number) => {
    set_playing(false)
    seek(index)
  }
  const previous = () => seek(inputs.index - 1)
  const next = () => seek(inputs.index + 1)
  const can_play = $derived(inputs.count > 1 && playback_fps > 0)

  function set_playing(playing: boolean): void {
    if (playing === is_playing || (playing && !can_play)) return
    is_playing = playing
    if (playing) inputs.on_play?.()
    else inputs.on_pause?.()
  }

  const toggle = () => set_playing(!is_playing)

  // Stop immediately and notify the host when the sequence becomes unplayable.
  $effect(() => {
    if (!can_play) untrack(() => set_playing(false))
  })

  // Equivalent host object replacements must not resume user-paused playback.
  const can_auto_play = $derived(inputs.auto_play && can_play)
  $effect(() => {
    if (can_auto_play) untrack(() => set_playing(true))
  })

  function advance(): void {
    if (inputs.index < inputs.count - 1) return next()
    inputs.on_end?.()
    seek(0)
    inputs.on_loop?.()
  }

  function handle_keydown(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing) return false
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const is_cmd_or_ctrl = event.metaKey || event.ctrlKey
    if (is_cmd_or_ctrl && key !== `ArrowLeft` && key !== `ArrowRight`) return false

    const previous_index = inputs.index
    const previous_fps = playback_fps
    const was_playing = is_playing

    if (key === ` `) {
      if (!event.repeat) toggle()
    } else if (key === `ArrowLeft`) {
      seek(is_cmd_or_ctrl ? 0 : inputs.index - 1)
    } else if (key === `ArrowRight`) {
      seek(is_cmd_or_ctrl ? inputs.count - 1 : inputs.index + 1)
    } else if (key === `Home`) seek(0)
    else if (key === `End`) seek(inputs.count - 1)
    else if (key === `j`) seek(inputs.index - 10)
    else if (key === `l`) seek(inputs.index + 10)
    else if (key === `PageUp`) seek(inputs.index - 25)
    else if (key === `PageDown`) seek(inputs.index + 25)
    else if ([`=`, `+`, `-`].includes(key)) {
      inputs.fps = normalize_fps(playback_fps + (key === `-` ? -fps_step : fps_step))
    } else if (key >= `0` && key <= `9`) {
      seek(Math.floor((Number(key) / 10) * (inputs.count - 1)))
    } else return false
    if (is_playing !== was_playing) shortcut_flash.show(`play`)
    else if (inputs.index !== previous_index)
      shortcut_flash.show(
        !is_cmd_or_ctrl && key === `ArrowLeft`
          ? `previous`
          : !is_cmd_or_ctrl && key === `ArrowRight`
            ? `next`
            : `step`,
      )
    else if (playback_fps !== previous_fps) shortcut_flash.show(`fps`)
    return true
  }

  // rAF avoids background-tab queueing while reading FPS and index live without restarting.
  $effect(() => {
    if (!is_playing) return undefined
    let last_timestamp = performance.now()
    let accumulated_ms = 0
    let play_raf: number
    const tick = (now: number) => {
      accumulated_ms += clamp(now - last_timestamp, 0, 250)
      last_timestamp = now
      const step_ms = 1000 / playback_fps
      while (accumulated_ms >= step_ms) {
        if (!is_playing || !can_play) break
        if (inputs.can_advance?.() === false) {
          accumulated_ms = step_ms
          break
        }
        accumulated_ms -= step_ms
        advance()
      }
      if (is_playing && can_play) play_raf = requestAnimationFrame(tick)
      else set_playing(false)
    }
    play_raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(play_raf)
  })

  return {
    get index() {
      return inputs.index
    },
    get count() {
      return inputs.count
    },
    get is_playing() {
      return is_playing
    },
    get fps_limits() {
      return fps_limits
    },
    get fps() {
      return playback_fps
    },
    set fps(value: number) {
      inputs.fps = normalize_fps(value)
    },
    fps_step,
    shortcut_flash,
    go_to,
    play: () => set_playing(true),
    pause: () => set_playing(false),
    seek,
    previous,
    next,
    toggle,
    handle_keydown,
  }
}
