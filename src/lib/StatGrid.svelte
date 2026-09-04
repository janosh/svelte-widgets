<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import type { StatItem } from './stats'
  import { format_stat_delta, format_stat_value, stat_delta_label } from './stats'

  let {
    items,
    format = format_stat_value,
    ...rest
  }: { items: readonly StatItem[]; format?: (value: string | number) => string } & Omit<
    HTMLAttributes<HTMLDivElement>,
    `children`
  > = $props()
</script>

<div {...rest} class={[`stat-tiles`, rest.class]} role="list">
  {#each items as item, idx (idx)}
    <div class="stat" role="listitem">
      <span class="stat-label">{item.label}</span>
      <span class="stat-value">
        {format(item.value)}{#if item.unit}<small class="stat-unit">{item.unit}</small
          >{/if}
      </span>
      {#if item.delta !== undefined}
        <span
          class="stat-delta"
          class:up={Number.isFinite(item.delta) && item.delta > 0}
          class:down={Number.isFinite(item.delta) && item.delta < 0}
          class:positive={Number.isFinite(item.delta) && item.delta_tone === `positive`}
          class:negative={Number.isFinite(item.delta) && item.delta_tone === `negative`}
          role="img"
          aria-label={stat_delta_label(item.delta)}
        >
          {format_stat_delta(item.delta)}
        </span>
      {/if}
      {#if item.hint}
        <span class="stat-hint">{item.hint}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .stat-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
    gap: 0.6rem;
    padding: 0.6rem;
  }
  .stat {
    display: grid;
    gap: 0.15rem;
    padding: 0.65rem 0.8rem;
    border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, currentColor 3%, transparent);
    min-inline-size: 0;
  }
  .stat-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-color-muted, inherit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stat-value {
    font-size: 1.45rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .stat-unit {
    margin-inline-start: 0.25em;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-color-muted, inherit);
  }
  .stat-delta {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-color-muted, inherit);
  }
  .stat-delta.positive {
    color: var(--success-color, light-dark(#2e7d32, #3d9a5c));
  }
  .stat-delta.negative {
    color: var(--error-color, light-dark(#b23c22, #d4654a));
  }
  .stat-hint {
    font-size: 0.72rem;
    color: var(--text-color-muted, inherit);
  }
</style>
