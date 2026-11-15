<!-- Grid of label/value rows under an optional heading, for property sheets and metadata.
  Labels, string values and the title render as trusted HTML: sanitize untrusted input first.
  Numbers (and number arrays) go through `format`, a row's own `format` winning. -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { format_num } from './format'
  import type { InfoCardItem } from './types'
  import { html_to_text } from './utils'

  let {
    items = [],
    title = ``,
    fallback = ``,
    format: default_format = (num: number) => format_num(num),
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `title`> & {
    // Rows to show as label/value pairs. Rows without a value are hidden.
    items?: readonly InfoCardItem[]
    // Heading above the rows (trusted HTML). Omitted when empty.
    title?: string
    // Text shown when no rows are visible.
    fallback?: string
    // Number formatter for numeric values and number arrays. A row's own `format` overrides it.
    format?: (num: number) => string
  } = $props()

  // the fallback shows when no row has a value
  const shown = $derived(items.filter((item) => item.value != null))
  const format_value = (
    value: string | number | readonly number[],
    format: (num: number) => string,
  ): string => (typeof value === `string` ? value : [value].flat().map(format).join(`, `))
</script>

<section {...rest} class={[`info-card`, rest.class]}>
  {#if title}
    <h2>{@html title}</h2>
  {/if}
  {#each shown as { label, value, unit, format = default_format, tooltip }, idx (idx)}
    <div>
      <span class="label" title={html_to_text(label)}>{@html label}</span>
      <strong title={tooltip ?? null}>
        {@html format_value(value ?? ``, format)}
        {#if unit}<small style="font-weight: normal">{unit}</small>{/if}
      </strong>
    </div>
  {:else}
    {fallback}
  {/each}
</section>

<style>
  /* zero specificity, so a caller's class sets the box */
  :where(.info-card) {
    display: grid;
    grid-template-columns: repeat(
      auto-fit,
      minmax(var(--info-card-min-col-width, 250px), 1fr)
    );
    /* box properties take a plain style or class; only inner elements read custom properties */
    box-sizing: border-box;
    border-radius: 3pt;
    padding: 10pt 12pt;
    margin: 1em 0;
    gap: 10pt 5%;
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1));
    h2 {
      grid-column: 1 / -1;
      margin: 0;
      border-bottom: 1px solid
        var(
          --info-card-title-border-color,
          light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.3))
        );
    }
    div {
      display: flex;
      justify-content: space-between;
      align-items: center;
      white-space: nowrap;
      gap: 1em;
    }
    .label {
      text-overflow: ellipsis;
      overflow: hidden;
    }
    strong {
      font-weight: 600;
      background: var(
        --info-card-value-bg,
        light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1))
      );
      padding: 0 4pt;
      border-radius: 3pt;
    }
  }
</style>
