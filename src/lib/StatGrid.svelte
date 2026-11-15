<script lang="ts" module>
  import { format_locale } from './format'

  // Tiles and changes: 4 significant digits (integers in full), scientific `1e6` from 1e6
  // and below 1e-3, en-US grouping, `n/a` for NaN and ±Infinity
  const format_stat = (num: number): string =>
    Number.isFinite(num)
      ? format_locale(num, {
          digits: 4,
          sci_range: [1e-3, 1e6],
          grouping: true,
          locale: `en-US`,
        })
      : `n/a`
  // [direction, glyph] by Math.sign(delta) + 1; the glyph carries the sign, so a change
  // never reads by color alone
  const DELTA_DIRS = [
    [`down`, `▼`],
    [`flat`, `▸`],
    [`up`, `▲`],
  ] as const
</script>

<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import type { StatItem } from './types'

  let {
    items,
    format = (value) => (typeof value === `string` ? value : format_stat(value)),
    ...rest
  }: {
    items: readonly StatItem[]
    // formats values only; deltas always use the built-in 4-significant-digit format
    format?: (value: string | number) => string
  } & Omit<HTMLAttributes<HTMLDivElement>, `children`> = $props()
</script>

<div {...rest} class={[`stat-tiles`, rest.class]} role="list">
  {#each items as { label, value, unit, delta, delta_tone, hint }}
    <div class="stat" role="listitem">
      <span class="stat-label">{label}</span>
      <span class="stat-value">
        {format(value)}{#if unit}<small class="stat-unit">{unit}</small>{/if}
      </span>
      {#if delta !== undefined}
        {@const [dir, glyph] = Number.isFinite(delta)
          ? DELTA_DIRS[Math.sign(delta) + 1]
          : []}
        {@const shown = format_stat(Math.abs(delta))}
        <span
          class={[`stat-delta`, dir, dir && delta_tone]}
          role="img"
          aria-label={dir ? `change ${dir} ${shown}` : `change unavailable`}
        >
          {dir ? `${glyph} ${shown}` : `n/a`}
        </span>
      {/if}
      {#if hint}
        <span class="stat-hint">{hint}</span>
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
  .stat-label,
  .stat-unit,
  .stat-delta,
  .stat-hint {
    font-size: 0.72rem;
    color: var(--text-color-muted, inherit);
  }
  .stat-label {
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
    font-weight: 500;
  }
  .stat-delta {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    &.positive {
      color: var(--success-color, light-dark(#2e7d32, #3d9a5c));
    }
    &.negative {
      color: var(--error-color, light-dark(#b23c22, #d4654a));
    }
  }
</style>
