import SequenceControls from '#lib/SequenceControls.svelte'
import {
  create_sequence_player,
  is_sequence_key_target,
} from '#lib/sequence-player.svelte.ts'
import {
  TransportNext,
  TransportPause,
  TransportPlay,
  TransportPrevious,
} from '#lib/icons.ts'
import { flushSync, type ComponentProps } from 'svelte'
import { describe, expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query, fire_input, press_key, render } from './index'

const flashed_controls = (player: Player) =>
  ([`play`, `previous`, `next`, `step`, `fps`] as const).filter((control) =>
    player.shortcut_flash.style(control).includes(`transition: none`),
  )

// Drive the rAF loop by hand: each frame callback is queued, run_frame pops and runs one
const stub_animation_frames = () => {
  const callbacks: FrameRequestCallback[] = []
  let next_id = 1
  vi.spyOn(globalThis, `requestAnimationFrame`).mockImplementation((callback_fn) => {
    callbacks.push(callback_fn)
    return next_id++
  })
  const cancel_raf = vi
    .spyOn(globalThis, `cancelAnimationFrame`)
    .mockImplementation(() => {})
  const performance_now = vi.spyOn(performance, `now`).mockReturnValue(0)
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  const run_frame = (timestamp: number) => {
    const callback = callbacks.shift()
    if (!callback) throw new Error(`Missing animation frame callback`)
    callback(timestamp)
    flushSync()
  }
  return { callbacks, cancel_raf, performance_now, run_frame }
}

const host_defaults = {
  count: 5,
  index: 0,
  fps: 10,
  auto_play: false,
  fps_range: [0, 300] as readonly [number, number],
  fps_step: undefined as number | undefined,
}
type Host = typeof host_defaults

function make_player(overrides: Partial<Host> = {}, after_end?: () => void) {
  const host = $state<Host>({ ...host_defaults, ...overrides })
  const events: string[] = []
  const set_index = vi.fn((index: number) => {
    host.index = index
  })
  let player!: ReturnType<typeof create_sequence_player>
  const destroy = $effect.root(() => {
    player = create_sequence_player({
      get count() {
        return host.count
      },
      get index() {
        return host.index
      },
      set index(index) {
        set_index(index)
      },
      get fps() {
        return host.fps
      },
      set fps(fps) {
        host.fps = fps
      },
      get fps_range() {
        return host.fps_range
      },
      get auto_play() {
        return host.auto_play
      },
      fps_step: host.fps_step,
      on_play: () => events.push(`play:${host.index}`),
      on_pause: () => events.push(`pause:${host.index}`),
      on_end: () => {
        events.push(`end:${host.index}`)
        after_end?.()
      },
      on_loop: () => events.push(`loop`),
    })
  })
  onTestFinished(destroy)
  flushSync()
  return { host, events, player, set_index, destroy }
}

describe(`create_sequence_player`, () => {
  test.each([
    [`previous at the first item`, 0, (player: Player) => player.previous(), 0, 0],
    [`next at the last item`, 4, (player: Player) => player.next(), 4, 0],
    [`seek below zero`, 2, (player: Player) => player.seek(-5), 0, 1],
    [`seek past the end`, 2, (player: Player) => player.seek(99), 4, 1],
    [`seek rounds fractional indices`, 0, (player: Player) => player.seek(2.6), 3, 1],
    [`seek ignores NaN`, 2, (player: Player) => player.seek(Number.NaN), 2, 0],
    [`seek to the current index is a no-op`, 2, (player: Player) => player.seek(2), 2, 0],
    [`go_to seeks and pauses`, 1, (player: Player) => player.go_to(3), 3, 1],
    [
      `next after the sequence shrinks to 3 items`,
      4,
      (player: Player, host: Host) => {
        host.count = 3
        flushSync()
        player.next()
      },
      2,
      1,
    ],
  ])(`%s clamps within [0, count)`, (_name, start, act, expected, set_calls) => {
    const { host, player, set_index } = make_player({ index: start })
    act(player, host)
    expect(host.index).toBe(expected)
    expect(set_index).toHaveBeenCalledTimes(set_calls)
    expect(flashed_controls(player)).toEqual([])
  })

  test(`empty or single-item sequences cannot play and ignore seeks`, () => {
    const { host, player, events } = make_player({ count: 1, index: 0 })
    player.play()
    player.toggle()
    player.seek(3)
    expect(player.is_playing).toBe(false)
    expect(host.index).toBe(0)
    expect(events).toEqual([])
    host.count = 0
    flushSync()
    player.next()
    expect(host.index).toBe(0)
  })

  test(`advances on the fps grid, catches up after long frames, loops at the end`, () => {
    const { callbacks, run_frame } = stub_animation_frames()
    const { host, player, events } = make_player({ fps: 10, index: 3 })
    player.play()
    flushSync()
    expect(player.is_playing).toBe(true)
    expect(callbacks).toHaveLength(1)

    run_frame(50) // below one 100 ms step: nothing moves yet
    expect(host.index).toBe(3)
    run_frame(100) // 4 -> last item
    expect(host.index).toBe(4)
    run_frame(200) // past the end: wraps to 0 and reports end + loop
    expect(host.index).toBe(0)
    expect(events).toEqual([`play:3`, `end:4`, `loop`])

    // One long frame catches up several steps, but a stall is capped at 250 ms (2 steps)
    run_frame(420) // 220 ms elapsed -> 2 steps
    expect(host.index).toBe(2)
    run_frame(5000) // 4580 ms elapsed, capped to 250 -> 2 steps
    expect(host.index).toBe(4)
  })

  test(`fps changes mid-play take effect on the next frame without restarting the loop`, () => {
    const { callbacks, cancel_raf, run_frame } = stub_animation_frames()
    const { host, player } = make_player({ fps: 10 })
    player.play()
    flushSync()
    run_frame(100)
    expect(host.index).toBe(1)

    host.fps = 100
    flushSync()
    expect(cancel_raf).not.toHaveBeenCalled()
    expect(callbacks).toHaveLength(1) // the same chained callback, no extra schedule
    run_frame(130) // 30 ms at 100 fps = 3 steps
    expect(host.index).toBe(4)

    player.fps = 20 // setter snaps through the same normalizer
    expect(host.fps).toBe(20)
    host.fps = 0 // unplayable: stops and drains the loop
    flushSync()
    expect(player.is_playing).toBe(false)
    expect(cancel_raf).toHaveBeenCalledTimes(1)
  })

  test(`play twice schedules one loop; pause and destroy cancel the pending frame`, () => {
    const { callbacks, cancel_raf } = stub_animation_frames()
    const { player, events, destroy } = make_player()
    player.play()
    player.play()
    player.toggle() // already playing -> pauses
    player.play()
    flushSync()
    expect(events).toEqual([`play:0`, `pause:0`, `play:0`])
    expect(callbacks).toHaveLength(1)

    player.pause()
    flushSync()
    expect(cancel_raf).toHaveBeenCalledWith(1)
    player.pause()
    flushSync()
    expect(events).toEqual([`play:0`, `pause:0`, `play:0`, `pause:0`])

    player.play()
    flushSync()
    expect(callbacks).toHaveLength(2)
    destroy()
    expect(cancel_raf).toHaveBeenLastCalledWith(2)
  })

  test(`schedules no frame after a callback destroys the player`, () => {
    const { callbacks, run_frame } = stub_animation_frames()
    let destroy_player = () => {}
    const { host, player, destroy } = make_player({ index: 4 }, () => destroy_player())
    destroy_player = destroy
    player.play()
    flushSync()
    run_frame(200) // two steps: the first passes the end, where on_end destroys the player
    expect([callbacks.length, host.index]).toEqual([0, 0])
  })

  test(`stops with on_pause when the sequence shrinks below two items while playing`, () => {
    const { callbacks, cancel_raf } = stub_animation_frames()
    const { host, player, events } = make_player({ index: 2 })
    player.play()
    flushSync()
    host.count = 1
    flushSync()
    expect(player.is_playing).toBe(false)
    expect(events).toEqual([`play:2`, `pause:2`])
    expect(cancel_raf).toHaveBeenCalledTimes(1)
    expect(callbacks).toHaveLength(1) // stale frame: running it must not advance
    callbacks[0](500)
    flushSync()
    expect(host.index).toBe(2)
  })

  test(`auto-play starts when allowed and playable, but never resumes a user pause`, () => {
    stub_animation_frames()
    const { host, player, events } = make_player({ auto_play: true, count: 1 })
    expect(player.is_playing).toBe(false)
    host.count = 4
    flushSync()
    expect(events).toEqual([`play:0`])

    player.pause()
    flushSync()
    host.index = 2 // unrelated host changes do not re-trigger auto-play
    flushSync()
    expect(player.is_playing).toBe(false)

    host.auto_play = false
    flushSync()
    host.auto_play = true
    flushSync()
    expect(events).toEqual([`play:0`, `pause:0`, `play:2`])
  })

  test.each([
    [{ fps: 7.26, fps_range: [0, 300] }, 7.3, [0, 300]],
    [{ fps: 500, fps_range: [0, 300] }, 300, [0, 300]],
    [{ fps: Number.NaN, fps_range: [0.1, 300] }, 0.1, [0.1, 300]],
    [{ fps: 5, fps_range: [300, 2.04] }, 5, [2.1, 300]], // reversed + snapped inward
    [{ fps: 5, fps_range: [2.04, 2.06] }, 2.04, [2.04, 2.04]], // no grid point inside
    [{ fps: 7.26, fps_range: [0.3, 300], fps_step: 0.5 }, 7.5, [0.5, 300]], // custom grid
  ] as const)(`normalizes host fps %j to %s with limits %j`, (overrides, fps, limits) => {
    const { host, player } = make_player({
      ...overrides,
      fps_range: [...overrides.fps_range],
    })
    expect(player.fps).toBeCloseTo(fps, 10)
    expect(host.fps).toBeCloseTo(fps, 10) // written back so the bound value is valid
    expect(player.fps_limits.map((lim) => Number(lim.toFixed(10)))).toEqual(limits)
    expect(player.fps_step).toBe(`fps_step` in overrides ? overrides.fps_step : 0.1)
  })

  test.each([
    [{ key: ` ` }, 2, 10, true, true, `play`],
    [{ key: ` `, repeat: true }, 2, 10, false, true, undefined],
    [{ key: `ArrowRight` }, 3, 10, false, true, `next`],
    [{ key: `ArrowLeft` }, 1, 10, false, true, `previous`],
    [{ key: `ArrowLeft`, metaKey: true }, 0, 10, false, true, `step`],
    [{ key: `ArrowRight`, ctrlKey: true }, 9, 10, false, true, `step`],
    [{ key: `Home` }, 0, 10, false, true, `step`],
    [{ key: `End` }, 9, 10, false, true, `step`],
    [{ key: `j` }, 0, 10, false, true, `step`],
    [{ key: `L` }, 9, 10, false, true, `step`],
    [{ key: `PageUp` }, 0, 10, false, true, `step`],
    [{ key: `PageDown` }, 9, 10, false, true, `step`],
    [{ key: `+` }, 2, 10.1, false, true, `fps`],
    [{ key: `=` }, 2, 10.1, false, true, `fps`],
    [{ key: `-` }, 2, 9.9, false, true, `fps`],
    [{ key: `5` }, 4, 10, false, true, `step`],
    [{ key: `0` }, 0, 10, false, true, `step`],
    [{ key: `9` }, 8, 10, false, true, `step`],
    [{ key: `q` }, 2, 10, false, false, undefined],
    [{ key: `f`, ctrlKey: true }, 2, 10, false, false, undefined],
    [{ key: `j`, metaKey: true }, 2, 10, false, false, undefined],
  ])(
    `handle_keydown(%j) -> index %s, fps %s, playing=%s, handled=%s`,
    (init, index, fps, playing, handled, control) => {
      stub_animation_frames()
      const { host, player } = make_player({ count: 10, index: 2 })
      // Child controls and IME composition own these keys before the player can act.
      for (const is_composing of [true, false]) {
        const ignored = new KeyboardEvent(`keydown`, {
          ...init,
          isComposing: is_composing,
          cancelable: true,
        })
        if (!is_composing) ignored.preventDefault()
        expect(player.handle_keydown(ignored)).toBe(false)
        expect([host.index, host.fps, player.is_playing]).toEqual([2, 10, false])
        expect(flashed_controls(player)).toEqual([])
      }
      expect(player.handle_keydown(new KeyboardEvent(`keydown`, init))).toBe(handled)
      flushSync()
      expect(host.index).toBe(index)
      expect(host.fps).toBeCloseTo(fps, 10)
      expect(player.is_playing).toBe(playing)
      expect(flashed_controls(player)).toEqual(control ? [control] : [])
    },
  )

  test.each([
    [{ index: 0 }, `ArrowLeft`],
    [{ index: 4 }, `End`],
    [{ fps: 300 }, `+`],
    [{ fps: 0 }, `-`],
    [{ count: 1 }, ` `],
  ])(`unchanged shortcut %j %s does not flash`, (overrides, key) => {
    const { player } = make_player(overrides)
    player.handle_keydown(new KeyboardEvent(`keydown`, { key }))
    expect(flashed_controls(player)).toEqual([])
  })
})

// keys belong to the player unless typed into a form field (the step slider excepted), or a
// Space would press a focused button; Enter/Escape leave the step input
test.each([
  [`button`, ``, `ArrowRight`, true],
  [`button`, ``, ` `, false],
  [`input`, `step-input`, `ArrowRight`, false],
  [`input`, `step-slider`, `ArrowRight`, true],
  [`input`, `step-input`, `Enter`, false],
  [`div`, ``, ` `, true],
  [`svg`, ``, ` `, true], // not an HTMLElement: nothing to keep the key from the player
])(
  `is_sequence_key_target on <%s class=%j> for %j: %s`,
  (tag, class_name, key, owned) => {
    const target = document.createElement(tag)
    target.className = class_name
    document.body.append(target)
    target.focus()
    // judged in a listener: only a dispatched event has a target
    const is_owned = vi.fn(is_sequence_key_target)
    target.addEventListener(`keydown`, is_owned)
    press_key(target, key)
    expect(is_owned.mock.results).toEqual([{ type: `return`, value: owned }])
    if (key === `Enter`) expect(document.activeElement).not.toBe(target)
  },
)

describe(`SequenceControls`, () => {
  const mount_controls = (
    player: Player,
    props: Partial<ComponentProps<typeof SequenceControls>> = {},
  ) => render(SequenceControls, { playback: player, ...props })

  test.each([true, false])(
    `slider scrub pauses and previews, then commits and restores playing=%s on release`,
    async (was_playing) => {
      stub_animation_frames()
      const { host, player } = make_player({ index: 1 })
      if (was_playing) player.play()
      const on_index_input = vi.fn()
      mount_controls(player, { on_index_input })
      const [previous, play, next] = document.querySelectorAll(`.nav-section button`)
      // stepping is locked while playing; the play button names the action it performs
      for (const btn of [previous, next])
        expect(btn.hasAttribute(`disabled`)).toBe(was_playing)
      expect(play.getAttribute(`aria-label`)).toBe(was_playing ? `Pause` : `Play`)
      // SVG glyphs: ⏮ ▶ ⏸ ⏭ text sits at a font-dependent height off the button's center
      const icons = [
        TransportPrevious,
        was_playing ? TransportPause : TransportPlay,
        TransportNext,
      ]
      expect(
        [previous, play, next].map((btn) => btn.querySelector(`path`)?.getAttribute(`d`)),
      ).toEqual(icons.map((icon) => icon.d))
      // titles name the keys handle_keydown binds
      const shortcuts = [play, next].map((btn) => btn.getAttribute(`aria-keyshortcuts`))
      expect(shortcuts).toEqual([`Space`, `ArrowRight`])
      expect(next.getAttribute(`title`)).toBe(`Next step (→)`)

      const slider = doc_query<HTMLInputElement>(`.step-slider`)
      slider.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
      await fire_input(slider, `3`, `input`)
      expect(player.is_playing).toBe(false)
      expect(on_index_input).toHaveBeenCalledExactlyOnceWith(3)
      expect(host.index).toBe(1) // the host's preview handler owns intermediate frames
      slider.dispatchEvent(new PointerEvent(`pointerup`, { bubbles: true }))
      flushSync()
      expect(host.index).toBe(3)
      expect(player.is_playing).toBe(was_playing)
    },
  )

  test(`visible picks the sections; step and fps inputs commit and labels mark steps`, async () => {
    const { host, player } = make_player({ index: 1 })
    mount_controls(player, {
      visible: (section: string) => section !== `nav`,
      step_label_positions: [0, 4],
    })
    expect(document.querySelector(`.nav-section`)).toBeNull()
    const labels = [...document.querySelectorAll(`.step-label`)]
    expect(labels.map((el) => el.textContent?.trim())).toEqual([`1`, `5`])
    const step_input = doc_query<HTMLInputElement>(`.step-input`)
    expect(step_input.value).toBe(`2`)
    await fire_input(step_input, `4`, `input`)
    expect(host.index).toBe(3)
    // an out-of-range entry clamps the index, and the field shows the committed step
    await fire_input(step_input, `40`, `input`, `change`)
    expect([host.index, step_input.value]).toEqual([4, `5`])

    const fps_input = doc_query<HTMLInputElement>(`.fps-section input`)
    await fire_input(fps_input, `12.34`, `input`)
    await fire_input(fps_input, ``, `input`, `change`)
    // snapped to the 0.1 grid; the cleared field leaves the fps and then shows it again
    expect([host.fps, fps_input.value]).toEqual([12.3, `12.3`])
  })
})

type Player = ReturnType<typeof create_sequence_player>
