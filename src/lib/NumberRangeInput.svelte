<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes, HTMLInputAttributes } from 'svelte/elements'
  import { tooltip } from './attachments/index'
  import {
    merge_defaults,
    NUMBER_RANGE_INPUT_LABELS,
    type NumberRangeInputLabels,
  } from './labels'

  // The wrapping label names the number input; the slider needs its own accessible label.
  let {
    value = $bindable(),
    setting,
    min,
    max,
    step,
    title,
    children,
    labels,
    empty = `retain`,
    commit = `input`,
    oncommit,
    number_props,
    range_props,
    ...rest
  }: {
    value: number | undefined
    min: number | string
    max: number | string
    step: number | string
    setting?: string
    // Invalid drafts never replace the committed value. Clearing retains it by default.
    empty?: `retain` | `undefined`
    commit?: `input` | `change`
    oncommit?: (value: number | undefined) => void
    number_props?: Omit<HTMLInputAttributes, `type` | `value` | `min` | `max` | `step`>
    range_props?: Omit<HTMLInputAttributes, `type` | `value` | `min` | `max` | `step`>
    title?: string
    children?: Snippet
    labels?: Partial<NumberRangeInputLabels>
  } & Omit<HTMLAttributes<HTMLLabelElement>, `title`> = $props()
  // A range input with no min/max silently defaults to 0-100 while the number input stays
  // unbounded, so one slider touch clamps and writes back a value the caller never limited.
  $effect(() => {
    if (min === undefined || max === undefined || step === undefined) {
      throw new Error(
        `NumberRangeInput needs min, max, and step, got min=${min}, max=${max}, step=${step}`,
      )
    }
  })
  const msg = $derived(merge_defaults(NUMBER_RANGE_INPUT_LABELS, labels))
  let range_label = $derived(title?.trim() || setting?.trim() || msg.value)
  // With children the <label> already names the number input and an aria-label would override
  // that visible text; without them the label is empty and needs the fallback.
  const number_label = $derived(children ? undefined : range_label)
  // A writable derived value follows external updates while allowing incomplete local drafts.
  let draft = $derived(value === undefined ? `` : String(value))
  const commit_input = (input: HTMLInputElement, final: boolean): void => {
    if (input.disabled || input.readOnly) return
    const next = input.valueAsNumber
    const cleared = input.value === `` && !input.validity.badInput
    // Step controls the increment; typed finite values may lie between steps.
    const valid =
      Number.isFinite(next) &&
      !input.validity.rangeUnderflow &&
      !input.validity.rangeOverflow
    if ((final || commit === `input`) && (valid || (cleared && empty === `undefined`))) {
      const next_value = valid ? next : undefined
      if (next_value !== value) {
        value = next_value
        oncommit?.(value)
      }
    }
    if (final) draft = value === undefined ? `` : String(value)
  }
</script>

<!-- Settings reset/search use data-key; callers may override it through rest. -->
<label data-key={setting} {...rest}>
  <span {@attach tooltip()} {title}>{@render children?.()}</span>
  <input
    {...number_props}
    type="number"
    {min}
    {max}
    {step}
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
    }}
  />
  <input
    {...range_props}
    type="range"
    {min}
    {max}
    {step}
    value={value ?? min}
    aria-label={range_props?.['aria-label'] ?? range_label}
    oninput={(event) => {
      commit_input(event.currentTarget, false)
      range_props?.oninput?.(event)
    }}
    onchange={(event) => {
      commit_input(event.currentTarget, true)
      range_props?.onchange?.(event)
    }}
  />
</label>

<style>
  label {
    display: flex;
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
  input[type='range'] {
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
  }
</style>
