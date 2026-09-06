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
      const direction =
        event.key === `ArrowUp` || event.key === `PageUp`
          ? 1
          : event.key === `ArrowDown` || event.key === `PageDown`
            ? -1
            : event.key === `ArrowRight`
              ? is_rtl()
                ? -1
                : 1
              : event.key === `ArrowLeft`
                ? is_rtl()
                  ? 1
                  : -1
                : 0
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
    <span class="summary" aria-hidden="true"
      >{format_value(values[0])}<span>–</span>{format_value(values[1])}</span
    >
  </div>
  {#if description}<p id={`${uid}-description`}>{description}</p>{/if}
  <div class="track-space">
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
          aria-labelledby={`${uid}-label ${uid}-end-${thumb}`}
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
    <div class="limits" aria-hidden="true">
      <span>{format_value(min)}</span><span>{format_value(max)}</span>
    </div>
  </div>
  <div class="fields" class:visually-hidden={!show_inputs}>
    {#each ends as thumb}
      <label>
        <span id={`${uid}-end-${thumb}`}>{names[thumb]}</span>
        {#if show_inputs}
          <input
            type="number"
            {disabled}
            min={bounds(thumb)[0]}
            max={bounds(thumb)[1]}
            step="any"
            aria-labelledby={`${uid}-label ${uid}-end-${thumb}`}
            value={drafts[thumb]}
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
      </label>
    {/each}
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
      gap: 0.4em;
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
      padding: 0 22px;
    }
    .rail {
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
    .limits {
      display: flex;
      justify-content: space-between;
      gap: 1em;
      margin-top: -1px;
      font-size: 0.75em;
      opacity: 0.65;
      font-variant-numeric: tabular-nums;
    }
    .fields {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.75em;
      margin-top: 1em;
    }
    .fields label {
      display: flex;
      flex-direction: column;
      gap: 0.35em;
      min-width: 0;
      font-size: 0.8em;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 0.6em 0.75em;
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
      border-radius: 7px;
      background: var(--range-slider-input-bg, transparent);
      color: inherit;
      font: inherit;
      font-size: 1.15em;
      font-variant-numeric: tabular-nums;
      box-shadow: none;
    }
    input {
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
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
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
