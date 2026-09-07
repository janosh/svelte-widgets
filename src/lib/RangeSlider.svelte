<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import {
    snap_range_value,
    step_range_value,
    validate_range,
    type RangeValue,
  } from './range-slider'

  let {
    min = 0,
    max = 100,
    step = 1,
    value = $bindable<RangeValue>([min, max]),
    label = `Range`,
    description,
    lower_label = `Minimum`,
    upper_label = `Maximum`,
    format_value = String,
    show_inputs = true,
    tick_position = `below`,
    tick_count = 2,
    disabled = false,
    oninput,
    oncommit,
    class: class_name,
    ...rest
  }: {
    min?: number
    max?: number
    step?: number
    value?: RangeValue
    label?: string
    description?: string
    lower_label?: string
    upper_label?: string
    format_value?: (value: number) => string
    show_inputs?: boolean
    // Place domain bounds below the track or beside its shortened ends.
    tick_position?: 'below' | 'sides'
    // Total evenly spaced labels, including min and max. Must be an integer >= 2.
    tick_count?: number
    disabled?: boolean
    // oninput follows each accepted change; oncommit runs once on pointer release,
    // each keyboard adjustment, or an accepted numeric edit. Neither fires for prop updates.
    oninput?: (value: RangeValue) => void
    oncommit?: (value: RangeValue) => void
  } & Omit<HTMLAttributes<HTMLDivElement>, `oninput`> = $props()

  const uid = $props.id()
  const ends = [0, 1] as const
  const values = $derived.by(() => {
    validate_range(value, min, max, step)
    return value
  })
  const names = $derived([lower_label, upper_label])
  const positions = $derived(values.map((end) => ((end - min) / (max - min)) * 100))
  const interior_ticks = $derived.by(() => {
    if (!Number.isSafeInteger(tick_count) || tick_count < 2) {
      throw new Error(`RangeSlider needs an integer tick_count >= 2; got ${tick_count}`)
    }
    return Array.from({ length: tick_count - 2 }, (_value, idx) => {
      const fraction = (idx + 1) / (tick_count - 1)
      return { value: min + (max - min) * fraction, position: fraction * 100 }
    })
  })
  let drafts = $derived(values.map(String))
  let rail = $state<HTMLDivElement>()
  let active = $state<0 | 1>(0)
  let dragging = $state(false)
  // Pointer bookkeeping does not drive rendering; only `dragging` and `active` do.
  let drag:
    | {
        pointer_id: number
        start: RangeValue
        thumb: 0 | 1 | undefined
        origin: number
        offset: number
        latest?: RangeValue
      }
    | undefined

  const bounds = (thumb: 0 | 1): RangeValue =>
    thumb === 0 ? [min, values[1]] : [values[0], max]
  const is_rtl = (): boolean =>
    rail !== undefined && getComputedStyle(rail).direction === `rtl`
  // Native :disabled also covers ancestor fieldsets, including their legend exemption.
  const is_disabled = (): boolean =>
    disabled || Boolean(rail?.querySelector(`button`)?.matches(`:disabled`))
  const focus_thumb = (thumb: 0 | 1): void => {
    active = thumb
    const thumbs = rail?.querySelectorAll<HTMLButtonElement>(`[role=slider]`)
    thumbs?.[thumb]?.focus({ preventScroll: true })
  }
  const update = (thumb: 0 | 1, next: number, snap = true): RangeValue | undefined => {
    const [floor, ceiling] = bounds(thumb)
    const accepted =
      next <= floor
        ? floor
        : next >= ceiling
          ? ceiling
          : Math.max(
              floor,
              Math.min(ceiling, snap ? snap_range_value(next, min, max, step) : next),
            )
    if (accepted === values[thumb]) return
    const next_value: RangeValue =
      thumb === 0 ? [accepted, values[1]] : [values[0], accepted]
    value = next_value
    oninput?.([...next_value])
    return next_value
  }
  const commit_value = (next: RangeValue | undefined): void => {
    // A caller can replace the binding synchronously inside oninput. That reset is
    // external state, not a completed user edit, just like a reset between pointer events.
    if (!is_disabled() && next && next[0] === values[0] && next[1] === values[1]) {
      oncommit?.([...next])
    }
  }
  const commit_number = (input: HTMLInputElement, thumb: 0 | 1): void => {
    if (
      !is_disabled() &&
      !input.validity.badInput &&
      Number.isFinite(input.valueAsNumber)
    ) {
      commit_value(update(thumb, input.valueAsNumber))
    }
    drafts = values.map(String)
  }
  const keydown = (
    event: KeyboardEvent,
    thumb: 0 | 1,
    baseline = values[thumb],
  ): void => {
    if (
      is_disabled() ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    let next: number
    const [floor, ceiling] = bounds(thumb)
    if (event.key === `Home`) next = floor
    else if (event.key === `End`) next = ceiling
    else {
      let direction = 0
      if (event.key === `ArrowUp` || event.key === `PageUp`) direction = 1
      else if (event.key === `ArrowDown` || event.key === `PageDown`) direction = -1
      else if (event.key === `ArrowRight` || event.key === `ArrowLeft`)
        direction = (event.key === `ArrowRight` ? 1 : -1) * (is_rtl() ? -1 : 1)
      if (!direction) return
      const stride = event.key.startsWith(`Page`) || event.shiftKey ? 10 : 1
      next = step_range_value(
        Math.max(min, Math.min(max, baseline)),
        min,
        max,
        step,
        direction,
        stride,
      )
    }
    event.preventDefault()
    commit_value(update(thumb, next, false))
  }
  const pointer_value = (event: PointerEvent): number | undefined => {
    if (!rail) return
    const rect = rail.getBoundingClientRect()
    if (rect.width <= 0) return
    const fraction =
      (is_rtl() ? rect.right - event.clientX : event.clientX - rect.left) / rect.width
    return min + fraction * (max - min)
  }
  const move_pointer = (event: PointerEvent): void => {
    if (!drag || drag.pointer_id !== event.pointerId) return
    if (is_disabled()) {
      stop_pointer(event)
      return
    }
    const next = pointer_value(event)
    if (next === undefined) return
    // Coincident handles separate in the direction of the gesture, so neither gets
    // trapped under the other's hit target. Their keyboard tab order never changes.
    if (drag.thumb === undefined) {
      if (next === drag.origin) return
      drag.thumb = next < drag.origin ? 0 : 1
      focus_thumb(drag.thumb)
    }
    const gesture = drag
    const next_value = update(drag.thumb, next - drag.offset)
    if (next_value) gesture.latest = next_value
  }
  const start_pointer = (event: PointerEvent): void => {
    if (
      is_disabled() ||
      drag ||
      event.defaultPrevented ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return
    const next = pointer_value(event)
    if (next === undefined || !rail) return
    event.preventDefault()
    const thumb = Math.abs(next - values[0]) <= Math.abs(next - values[1]) ? 0 : 1
    const on_handle =
      event.target instanceof Element && Boolean(event.target.closest(`[role=slider]`))
    const coincident = on_handle && values[0] === values[1]
    drag = {
      pointer_id: event.pointerId,
      start: [...values],
      thumb: coincident ? undefined : thumb,
      origin: next,
      offset: on_handle ? next - values[thumb] : 0,
    }
    dragging = true
    focus_thumb(thumb)
    rail.setPointerCapture(event.pointerId)
    if (!on_handle) move_pointer(event)
  }
  const stop_pointer = (event: PointerEvent): void => {
    if (!drag || drag.pointer_id !== event.pointerId) return
    const { start, latest, pointer_id } = drag
    drag = undefined
    dragging = false
    if (rail?.hasPointerCapture(pointer_id)) rail.releasePointerCapture(pointer_id)
    if (latest && (start[0] !== values[0] || start[1] !== values[1])) commit_value(latest)
  }
  $effect(() => {
    if (disabled && drag) {
      const { pointer_id } = drag
      drag = undefined
      dragging = false
      if (rail?.hasPointerCapture(pointer_id)) rail.releasePointerCapture(pointer_id)
    }
  })
</script>

<div
  {...rest}
  {@attach (node) => {
    const form = node.closest(`form`)
    const reset_drafts = (event: Event): void => {
      queueMicrotask(() => {
        if (event.defaultPrevented || !node.isConnected) return
        // A native reset discards drafts; the caller owns resetting the bound interval.
        drafts = values.map(String)
        node.querySelectorAll<HTMLInputElement>(`input`).forEach((input, idx) => {
          input.value = drafts[idx]
        })
      })
    }
    form?.addEventListener(`reset`, reset_drafts)
    return () => form?.removeEventListener(`reset`, reset_drafts)
  }}
  class={[`range-slider`, class_name]}
  class:dragging
  role="group"
  aria-labelledby={`${uid}-label`}
  aria-describedby={description ? `${uid}-description` : undefined}
>
  <div class="heading">
    <span id={`${uid}-label`} class="label">{label}</span>
    <div class="summary">
      {#each ends as thumb}
        {#if thumb === 1}<span aria-hidden="true">–</span>{/if}
        <div class="endpoint">
          <span class="formatted" aria-hidden="true">{format_value(values[thumb])}</span>
          {#if show_inputs}
            <input
              type="number"
              {disabled}
              min={bounds(thumb)[0]}
              max={bounds(thumb)[1]}
              step="any"
              aria-label={`${label} ${names[thumb]}`}
              value={drafts[thumb]}
              style:width={`${Math.max(3, drafts[thumb].length)}ch`}
              title={names[thumb]}
              oninput={(event) => {
                const text = event.currentTarget.value
                drafts = drafts.map((draft, idx) => (idx === thumb ? text : draft))
              }}
              onchange={(event) => commit_number(event.currentTarget, thumb)}
              onblur={(event) => commit_number(event.currentTarget, thumb)}
              onkeydown={(event) => {
                if (event.defaultPrevented || event.isComposing) return
                if (event.key === `Enter`) {
                  event.preventDefault()
                  commit_number(event.currentTarget, thumb)
                } else if (event.key === `Escape`) {
                  event.preventDefault()
                  drafts = values.map(String)
                } else if (
                  [`ArrowUp`, `ArrowDown`, `PageUp`, `PageDown`].includes(event.key)
                ) {
                  const draft_value = event.currentTarget.valueAsNumber
                  keydown(
                    event,
                    thumb,
                    Number.isFinite(draft_value) ? draft_value : values[thumb],
                  )
                  if (event.defaultPrevented) drafts = values.map(String)
                }
              }}
            />
          {/if}
        </div>
      {/each}
    </div>
  </div>
  {#if description}<p id={`${uid}-description`}>{description}</p>{/if}
  <div class="track-space" class:side-ticks={tick_position === `sides`}>
    <span class="limit" aria-hidden="true">{format_value(min)}</span>
    <!-- Pointer interactions on the rail are also available through its keyboard-operable thumbs. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="rail"
      bind:this={rail}
      onpointerdown={start_pointer}
      onpointermove={move_pointer}
      onpointerup={stop_pointer}
      onpointercancel={stop_pointer}
      onlostpointercapture={stop_pointer}
    >
      <div class="track" aria-hidden="true">
        <div
          style:inset-inline-start={`${positions[0]}%`}
          style:width={`${positions[1] - positions[0]}%`}
        ></div>
      </div>
      {#each ends as thumb}
        <button
          type="button"
          role="slider"
          class="thumb"
          class:active={active === thumb}
          style:inset-inline-start={`${positions[thumb]}%`}
          {disabled}
          aria-label={`${label} ${names[thumb]}`}
          aria-describedby={description ? `${uid}-description` : undefined}
          aria-valuemin={bounds(thumb)[0]}
          aria-valuemax={bounds(thumb)[1]}
          aria-valuenow={values[thumb]}
          aria-valuetext={format_value(values[thumb])}
          aria-orientation="horizontal"
          onfocus={() => (active = thumb)}
          onkeydown={(event) => keydown(event, thumb)}><span class="knob"></span></button
        >
      {/each}
    </div>
    {#if interior_ticks.length}
      <div class="ticks" aria-hidden="true">
        {#each interior_ticks as tick}
          <span style:inset-inline-start={`${tick.position}%`}
            >{format_value(tick.value)}</span
          >
        {/each}
      </div>
    {/if}
    <span class="limit" aria-hidden="true">{format_value(max)}</span>
  </div>
</div>

<style>
  .range-slider {
    --range-color: var(--range-slider-color, var(--active-color, #6366f1));
    width: 100%;
    min-width: 0;
    font: inherit;
    color: inherit;
    &:has(.thumb:disabled) {
      opacity: 0.5;
    }
    .heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1em;
      flex-wrap: wrap;
    }
    .label {
      font-weight: 600;
    }
    .summary {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      max-width: 100%;
      font-variant-numeric: tabular-nums;
      font-size: 0.9em;
      font-weight: 600;
      color: var(--range-color);
    }
    p {
      margin: 0.35em 0 0;
      font-size: 0.85em;
      opacity: 0.7;
    }
    .track-space {
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 0 22px;
      &.side-ticks {
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        column-gap: 12px;
        padding: 0;
        .rail {
          grid-column: 2;
        }
        .ticks {
          grid-column: 2;
        }
        .limit {
          grid-row: 1;
          margin-top: 0;
          &:last-child {
            grid-column: 3;
          }
        }
      }
    }
    .rail {
      grid-area: 1 / 1 / 2 / -1;
      position: relative;
      height: 44px;
      touch-action: none;
      cursor: pointer;
    }
    .track {
      position: absolute;
      inset: 19px 0;
      height: 6px;
      border-radius: 9px;
      background: var(
        --range-slider-track,
        color-mix(in srgb, currentColor 15%, transparent)
      );
    }
    .track > div {
      position: absolute;
      height: 100%;
      border-radius: inherit;
      background: var(--range-color);
    }
    .thumb {
      position: absolute;
      top: 0;
      width: 44px;
      height: 44px;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--range-color);
      margin-inline-start: -22px;
      display: grid;
      place-items: center;
      cursor: grab;
      box-shadow: none;
      outline: none;
      touch-action: none;
      &.active {
        z-index: 1;
      }
      .knob {
        box-sizing: border-box;
        width: 20px;
        height: 20px;
        border: 3px solid currentColor;
        border-radius: 50%;
        background: var(--range-slider-thumb, #fff);
        box-shadow: 0 1px 4px #0003;
        transition:
          box-shadow 120ms,
          scale 120ms;
      }
      &:hover:not(:disabled) .knob {
        box-shadow: 0 0 0 5px color-mix(in srgb, currentColor 13%, transparent);
      }
      &:focus-visible .knob {
        outline: 2px solid currentColor;
        outline-offset: 4px;
      }
    }
    &.dragging .thumb.active {
      cursor: grabbing;
    }
    &.dragging .thumb.active .knob {
      scale: 1.12;
      box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 15%, transparent);
    }
    .limit,
    .ticks {
      grid-row: 2;
      margin-top: -14px;
      font-size: 0.75em;
      opacity: 0.65;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;
    }
    .limit {
      grid-column: 1;
      &:last-child {
        grid-column: 2;
        text-align: end;
      }
    }
    .ticks {
      grid-column: 1 / -1;
      position: relative;
      height: 1lh;
      span {
        position: absolute;
        display: flex;
        justify-content: center;
        width: 0;
      }
    }
    .endpoint {
      display: grid;
      min-width: 0;
      &:has(input) {
        border-bottom: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      }
      > * {
        grid-area: 1 / 1;
      }
      .formatted {
        align-self: center;
        text-align: center;
        padding-inline: 0.25em;
        pointer-events: none;
      }
      &:focus-within .formatted {
        visibility: hidden;
      }
      &:not(:focus-within) input {
        opacity: 0;
      }
    }
    input {
      box-sizing: content-box;
      min-width: calc(100% - 0.5em);
      padding: 0.25em;
      border: 0;
      border-radius: 0;
      background: var(--range-slider-input-bg, transparent);
      color: inherit;
      font: inherit;
      font-variant-numeric: tabular-nums;
      box-shadow: none;
      appearance: textfield;
    }
    input::-webkit-inner-spin-button,
    input::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }
    input:focus-visible {
      outline: 2px solid var(--range-color);
      outline-offset: 2px;
    }
    &:has(.thumb:disabled) :is(.rail, .thumb, input) {
      cursor: not-allowed;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .range-slider .thumb .knob {
      transition: none;
    }
  }
  @media (forced-colors: active) {
    .range-slider {
      --range-color: Highlight;
      --range-slider-track: GrayText;
      --range-slider-thumb: Canvas;
      .track,
      .knob {
        forced-color-adjust: none;
      }
    }
  }
</style>
