<script module lang="ts">
  export type NumberRangeSchemaEntry = Readonly<{
    minimum?: number | string
    maximum?: number | string
    multipleOf?: number | string
    description?: string
  }>
  export type NumberRangeSchema = Readonly<Record<string, NumberRangeSchemaEntry>>
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes, HTMLInputAttributes } from 'svelte/elements'
  import { tooltip } from './attachments/index'
  import {
    merge_defaults,
    NUMBER_RANGE_INPUT_LABELS,
    type NumberRangeInputLabels,
  } from './labels'

  // same three bounds either way: optional when a schema can supply them, else required
  type Bounds = { min?: number | string; max?: number | string; step?: number | string }
  type SchemaBounds = Bounds & { setting: string; schema: NumberRangeSchema }
  type ExplicitBounds = Required<Bounds> & { setting?: string; schema?: undefined }

  // Paired number + range input on one value in a flex <label>; children carry the label
  // markup. A wrapping <label> names only the number input, so the slider falls back to
  // `title`. Children get their own <span> so the row is exactly three grid columns.
  let {
    value = $bindable(),
    setting,
    schema,
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
    // Invalid drafts never replace the committed value. Clearing retains it by default.
    empty?: `retain` | `undefined`
    commit?: `input` | `change`
    oncommit?: (value: number | undefined) => void
    number_props?: Omit<HTMLInputAttributes, `type` | `value` | `min` | `max` | `step`>
    range_props?: Omit<HTMLInputAttributes, `type` | `value` | `min` | `max` | `step`>
    title?: string
    children?: Snippet
    labels?: Partial<NumberRangeInputLabels>
  } & (SchemaBounds | ExplicitBounds) &
    Omit<HTMLAttributes<HTMLLabelElement>, `title`> = $props()

  let setting_config = $derived.by(() => {
    if (!setting || !schema) return undefined
    const config = schema[setting]
    if (!config) {
      throw new Error(`NumberRangeInput schema has no entry for setting "${setting}"`)
    }
    return config
  })
  let input_bounds = $derived({
    min: min ?? setting_config?.minimum,
    max: max ?? setting_config?.maximum,
    step: step ?? setting_config?.multipleOf ?? `any`,
  })
  // A range input with no min/max silently defaults to 0-100 while the number input stays
  // unbounded, so one slider touch clamps and writes back a value the caller never limited.
  $effect(() => {
    if (input_bounds.min === undefined || input_bounds.max === undefined) {
      throw new Error(
        `NumberRangeInput needs both a min and a max to render its slider, got ` +
          `min=${input_bounds.min}, max=${input_bounds.max}${
            setting ? ` for setting "${setting}"` : ``
          }. Pass min/max props or give the schema entry minimum/maximum.`,
      )
    }
  })
  let resolved_title = $derived(title ?? setting_config?.description)
  const msg = $derived(merge_defaults(NUMBER_RANGE_INPUT_LABELS, labels))
  let range_label = $derived(resolved_title?.trim() || setting?.trim() || msg.value)
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

<!-- data-key defaults to `setting` so a settings pane's per-row reset and search find the row
without every call site repeating the key; `rest` comes last so a caller can still override -->
<label {@attach tooltip()} title={resolved_title} data-key={setting} {...rest}>
  <span>{@render children?.()}</span>
  <input
    {...number_props}
    type="number"
    {...input_bounds}
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
    {...input_bounds}
    {value}
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
    flex: 1;
    min-width: 40px;
  }
</style>
