<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes, HTMLInputAttributes } from 'svelte/elements'
  import { tooltip } from './attachments/index'
  import {
    merge_defaults,
    NUMBER_RANGE_INPUT_LABELS,
    type NumberRangeInputLabels,
  } from './labels'
  import {
    create_range_scale,
    range_key_action,
    snap_range_value,
    step_range_coordinate,
    type RangeScale,
  } from './range-slider'

  // The wrapping label names the number input; the slider needs its own accessible label.
  let {
    value = $bindable(),
    label,
    min,
    max,
    step,
    scale = `linear`,
    title,
    children,
    labels,
    empty = `retain`,
    commit = `input`,
    on_commit,
    number_props,
    range_props,
    ...rest
  }: {
    value: number | undefined
    min: number
    max: number
    step: number | `any`
    // Log mode keeps value in real units and measures step in base-10 decades.
    scale?: RangeScale
    // Accessible name for the slider and, without children, the number input.
    label?: string
    // Invalid drafts never replace the committed value. Clearing retains it by default.
    empty?: `retain` | `undefined`
    commit?: `input` | `change`
    on_commit?: (value: number | undefined) => void
    number_props?: Omit<HTMLInputAttributes, `type` | `value` | `min` | `max` | `step`>
    range_props?: Omit<HTMLInputAttributes, `type` | `value` | `min` | `max` | `step`>
    title?: string
    children?: Snippet
    labels?: Partial<NumberRangeInputLabels>
  } & Omit<HTMLAttributes<HTMLLabelElement>, `title`> = $props()
  // A range input with invalid min/max silently defaults to 0-100 while the number input stays
  // unbounded, so one slider touch clamps and writes back a value the caller never limited.
  $effect(() => {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      max < min ||
      (step !== `any` && (!Number.isFinite(step) || step <= 0))
    ) {
      throw new Error(
        `NumberRangeInput needs finite min <= max and positive step or "any", got min=${min}, max=${max}, step=${step}`,
      )
    }
  })
  const domain = $derived(create_range_scale(min, max, scale))
  const log_step = $derived(step === `any` ? (domain.max - domain.min) / 100 : step)
  $effect(() => {
    if (scale !== `log`) return
    domain.validate_step(log_step, `NumberRangeInput`)
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
      throw new Error(
        `NumberRangeInput logarithmic value must be within [${min}, ${max}]; got ${value}`,
      )
    }
  })
  const msg = $derived(merge_defaults(NUMBER_RANGE_INPUT_LABELS, labels))
  let range_label = $derived(label?.trim() || msg.value)
  // With children the <label> already names the number input and an aria-label would override
  // that visible text; without them the label is empty and needs the fallback.
  const number_label = $derived(children ? undefined : range_label)
  // A writable derived value follows external updates while allowing incomplete local drafts.
  let draft = $derived(value === undefined ? `` : String(value))
  let slider_value = $derived(value ?? min)
  let range_editing = false
  let keyboard_value: number | undefined
  const commit_input = (input: HTMLInputElement, final: boolean): void => {
    if (input.disabled || input.readOnly) return
    let next = keyboard_value ?? input.valueAsNumber
    if (input.type === `range`) {
      if (final && range_editing) next = slider_value
      else if (keyboard_value === undefined) {
        // Native range snapping cannot retain an off-grid maximum or typed value.
        // Log sliders use step="any" and snap only user edits, in exponent coordinates.
        if (scale === `log` && step !== `any`) {
          next = snap_range_value(next, domain.min, domain.max, log_step)
          input.value = String(next)
        }
        next = domain.from_position(next)
      }
      // Finalize the preview without decoding the browser's rounded range position again.
      slider_value = next
      range_editing = !final
    }
    const cleared = input.value === `` && !input.validity.badInput
    // Step controls the increment; typed finite values may lie between steps.
    const valid =
      Number.isFinite(next) &&
      (scale !== `log` || next > 0) &&
      !input.validity.rangeUnderflow &&
      !input.validity.rangeOverflow
    if ((final || commit === `input`) && (valid || (cleared && empty === `undefined`))) {
      const next_value = valid ? next : undefined
      if (next_value !== value) {
        value = next_value
        on_commit?.(value)
      }
    }
    if (final) {
      draft = value === undefined ? `` : String(value)
      if (input.type === `number`) input.value = draft
    }
  }
  const log_keydown = (event: KeyboardEvent): void => {
    const input = event.currentTarget as HTMLInputElement
    if (scale !== `log` || input.matches(`:disabled`) || input.readOnly) return
    const action = range_key_action(
      event,
      input.type !== `range` ? 0 : getComputedStyle(input).direction === `rtl` ? -1 : 1,
    )
    if (action === undefined) return
    let next: number
    if (typeof action === `string`) next = domain[action]
    else {
      const baseline =
        input.type === `range`
          ? slider_value
          : Number.isFinite(input.valueAsNumber) && input.valueAsNumber > 0
            ? input.valueAsNumber
            : (value ?? min)
      const bounded = Math.max(min, Math.min(max, baseline))
      next = step_range_coordinate(
        bounded,
        domain,
        log_step,
        Math.sign(action),
        Math.abs(action),
      )
    }
    event.preventDefault()
    input.value = String(input.type === `range` ? next : domain.from_position(next))
    // A keyboard adjustment is a completed edit, including when commit="change".
    const previous_keyboard_value = keyboard_value
    keyboard_value = domain.from_position(next)
    try {
      input.dispatchEvent(new Event(`input`, { bubbles: true }))
      input.dispatchEvent(new Event(`change`, { bubbles: true }))
    } finally {
      keyboard_value = previous_keyboard_value
    }
  }
</script>

<label {...rest}>
  <span {@attach tooltip()} {title}>{@render children?.()}</span>
  <input
    {...number_props}
    type="number"
    class:logarithmic={scale === `log`}
    {min}
    {max}
    step={scale === `log` ? `any` : step}
    value={draft}
    aria-label={number_props?.['aria-label'] ?? number_label}
    oninput={(event) => {
      draft = event.currentTarget.value
      commit_input(event.currentTarget, false)
      number_props?.oninput?.(event)
    }}
    onchange={(event) => {
      commit_input(event.currentTarget, true)
      number_props?.onchange?.(event)
    }}
    onblur={(event) => {
      commit_input(event.currentTarget, true)
      number_props?.onblur?.(event)
    }}
    onkeydown={(event) => {
      if (event.key === `Enter`) commit_input(event.currentTarget, true)
      if (event.key === `Escape`) draft = value === undefined ? `` : String(value)
      number_props?.onkeydown?.(event)
      log_keydown(event)
    }}
  />
  <input
    {...range_props}
    type="range"
    min={domain.min}
    max={domain.max}
    step={scale === `log` ? `any` : step}
    value={domain.to_position(slider_value)}
    aria-label={range_props?.['aria-label'] ?? range_label}
    aria-valuemin={scale === `log` ? min : range_props?.['aria-valuemin']}
    aria-valuemax={scale === `log` ? max : range_props?.['aria-valuemax']}
    aria-valuenow={scale === `log` ? slider_value : range_props?.['aria-valuenow']}
    aria-valuetext={range_props?.['aria-valuetext'] ??
      (scale === `log` ? String(slider_value) : undefined)}
    oninput={(event) => {
      commit_input(event.currentTarget, false)
      range_props?.oninput?.(event)
    }}
    onchange={(event) => {
      commit_input(event.currentTarget, true)
      range_props?.onchange?.(event)
    }}
    onkeydown={(event) => {
      range_props?.onkeydown?.(event)
      log_keydown(event)
    }}
  />
</label>

<style>
  label {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10pt;
  }
  /* no children means no label cell, so the flex gap shouldn't reserve one either */
  label > span:empty {
    display: none;
  }
  input {
    font-size: inherit;
    font-family: inherit;
  }
  input.logarithmic {
    appearance: textfield;
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }
  }
  input[type='range'] {
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
  }
</style>
