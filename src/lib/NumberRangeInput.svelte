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
  import type { HTMLAttributes } from 'svelte/elements'
  import { tooltip } from './attachments'

  // The same three bounds either way: optional when a schema entry can supply them, required
  // when nothing else can.
  type Bounds = { min?: number | string; max?: number | string; step?: number | string }
  type SchemaBounds = Bounds & { setting: string; schema: NumberRangeSchema }
  type ExplicitBounds = Required<Bounds> & { setting?: string; schema?: undefined }

  // Paired number + range input bound to the same value, wrapped in a flex <label>.
  // The label text/markup is passed as children (supports inline units like <small>Å</small>).
  // Pass a `title` to show a tooltip; wrapping <label> only names the number input
  // so the range slider uses that title when present and otherwise gets a fallback name.
  // Children go in their own <span> so the label is exactly three elements (text, number,
  // range), which lets a settings pane put every row on one shared column grid.
  let {
    value = $bindable(),
    setting,
    schema,
    min,
    max,
    step,
    title,
    children,
    ...rest
  }: {
    value: number | undefined
    title?: string
    children?: Snippet
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
  let resolved_title = $derived(title ?? setting_config?.description)
  let range_label = $derived(resolved_title?.trim() || setting?.trim() || `Value`)
  // With children the wrapping <label> already names the number input and an aria-label would
  // override that visible text; without them the label is empty, so it needs the fallback too.
  const number_label = $derived(children ? undefined : range_label)
</script>

<!-- data-key defaults to `setting` so a settings pane's per-row reset and search find the row
without every call site repeating the key; `rest` comes last so a caller can still override -->
<label {@attach tooltip()} title={resolved_title} data-key={setting} {...rest}>
  <span>{@render children?.()}</span>
  <input type="number" {...input_bounds} bind:value aria-label={number_label} />
  <input type="range" {...input_bounds} bind:value aria-label={range_label} />
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
