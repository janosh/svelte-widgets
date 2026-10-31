<script lang="ts" module>
  // 3 significant digits, stepped one unit outwards (min down, max up) when rounding to
  // nearest would exclude the value, so the shown range still includes every value. Compares
  // final doubles, so values a few ULPs past a short decimal (0.1 * 3) round the right way.
  const inclusive_bound = (num: number, bound: `min` | `max`): string => {
    const short = Number(num.toPrecision(3))
    if ((bound === `min` ? short <= num : short >= num) || !Number.isFinite(num)) {
      return String(short)
    }
    const step = 10 ** (Math.floor(Math.log10(Math.abs(num))) - 2)
    return String(Number((bound === `min` ? short - step : short + step).toPrecision(3)))
  }
</script>

<script lang="ts" generics="Val = unknown">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { anchored_popover, close_before_removal } from '../attachments/index'
  import Icon from '../Icon.svelte'
  import { Filter } from '../icons'
  import { merge_defaults } from '../labels'
  import {
    filter_panel,
    with_category_toggled,
    with_numeric_bound,
    type FilterPanelOptions,
  } from './filter'
  import { COLUMN_FILTER_LABELS, type ColumnFilterLabels } from './labels'
  import type { ColumnFilterValue } from './types'

  // Per-column filter for a table header: a funnel button opening an anchored popover whose
  // control depends on the column's data, a min/max range for numbers, a checklist for few
  // distinct values, a substring box otherwise. Bind `filter` and apply it with
  // compile_filter / filter_rows; bind `open` to allow one open filter at a time. Clicks,
  // presses, input and the Enter/Space keys that activate headers stop at this control so a
  // sortable or draggable header underneath doesn't react, which is why event handler props
  // are omitted.
  type StoppedEvents =
    | `onclick`
    | `onkeydown`
    | `oninput`
    | `onmousedown`
    | `onpointerdown`
  let {
    filter = $bindable(),
    open = $bindable(false),
    column,
    values,
    options,
    format_bound = inclusive_bound,
    labels,
    trigger,
    option,
    ...rest
  }: Omit<HTMLAttributes<HTMLSpanElement>, `children` | StoppedEvents> & {
    filter?: ColumnFilterValue
    open?: boolean
    // column name, read by the trigger's aria-label
    column: string
    // the column's unfiltered values, read only while the panel is open
    values: () => Iterable<Val>
    // control kind, numeric override, checklist cap and cell readers, as filter_panel takes
    // them; the readers can be the same object passed to filter_rows / compile_filter
    options?: FilterPanelOptions<Val>
    // formats the numeric extent shown as the range inputs' placeholders; keep it
    // inclusive (never round `min` up or `max` down) so typing it in keeps every row
    format_bound?: (num: number, bound: `min` | `max`) => string
    labels?: Partial<ColumnFilterLabels>
    // replaces the funnel icon inside the trigger button
    trigger?: Snippet<[{ open: boolean; active: boolean }]>
    // a checklist entry's text
    option?: Snippet<[{ value: string; checked: boolean }]>
  } = $props()

  const msg = $derived(merge_defaults(COLUMN_FILTER_LABELS, labels))
  // Lazy: the distinct-value scan is O(rows) and only runs for the open panel
  const panel = $derived(open ? filter_panel(values(), options) : null)
  const stop_event = (event: Event) => event.stopPropagation()
  // Other keys (Escape, arrows, typing) keep bubbling for the table's own shortcuts
  const stop_activation = (event: KeyboardEvent) => {
    if (event.key === `Enter` || event.key === ` `) event.stopPropagation()
  }
  let trigger_el = $state<HTMLButtonElement>()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  {...rest}
  class={[`column-filter`, rest.class]}
  onclick={stop_event}
  onkeydown={stop_activation}
  oninput={stop_event}
  onmousedown={stop_event}
  onpointerdown={stop_event}
>
  <button
    bind:this={trigger_el}
    type="button"
    class={[`column-filter-trigger`, { active: Boolean(filter) }]}
    aria-label={msg.trigger(column)}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {#if trigger}
      {@render trigger({ open, active: Boolean(filter) })}
    {:else}
      <Icon icon={Filter} />
    {/if}
  </button>
  {#if panel}
    <div
      class="column-filter-panel"
      out:close_before_removal
      {@attach anchored_popover({ anchor: trigger_el, on_close: () => (open = false) })}
    >
      {#if panel.kind === `numeric`}
        {@const range = filter?.kind === `numeric` ? filter : undefined}
        {#each [`min`, `max`] as const as bound (bound)}
          <label>
            {msg[bound]}
            <input
              type="number"
              step="any"
              value={range?.[bound] ?? ``}
              placeholder={panel.extent ? format_bound(panel.extent[bound], bound) : ``}
              oninput={(event) =>
                (filter = with_numeric_bound(filter, bound, event.currentTarget.value))}
            />
          </label>
        {/each}
      {:else if panel.kind === `category`}
        {@const selected = filter?.kind === `category` ? new Set(filter.values) : null}
        {@const { choices } = panel}
        <div class="column-filter-choices">
          {#each choices as value (value)}
            {@const checked = selected === null || selected.has(value)}
            <label>
              <input
                type="checkbox"
                {checked}
                onchange={() => (filter = with_category_toggled(filter, value, choices))}
              />
              {#if option}
                {@render option({ value, checked })}
              {:else}
                {value || msg.blank}
              {/if}
            </label>
          {/each}
        </div>
      {:else}
        <input
          type="search"
          aria-label={msg.contains}
          placeholder={msg.contains}
          value={filter?.kind === `text` ? filter.text : ``}
          oninput={({ currentTarget: { value: text } }) =>
            (filter = text ? { kind: `text`, text } : undefined)}
        />
      {/if}
      {#if filter}
        <button
          type="button"
          class="column-filter-clear"
          onclick={() => (filter = undefined)}
        >
          {msg.clear}
        </button>
      {/if}
    </div>
  {/if}
</span>

<style>
  .column-filter {
    display: inline-flex;
    align-items: center;
    margin-left: 3px;
    vertical-align: middle;
  }
  .column-filter-trigger {
    display: inline-grid;
    place-items: center;
    width: var(--column-filter-trigger-size, 14px);
    height: var(--column-filter-trigger-size, 14px);
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    line-height: 1;
    opacity: 0.55;
    :global(svg) {
      width: var(--column-filter-icon-size, 10px);
      height: var(--column-filter-icon-size, 10px);
    }
    &:hover,
    &[aria-expanded='true'] {
      opacity: 1;
      background: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.16));
    }
    /* an active filter is easy to forget about, so it stays fully lit and accented */
    &.active {
      opacity: 1;
      color: var(--column-filter-active-color, var(--accent-color, #4a9eff));
    }
  }
  /* touch: the glyph keeps its size inside a 24px target, whatever size the host picks */
  @media (pointer: coarse) {
    .column-filter-trigger {
      min-width: 24px;
      min-height: 24px;
    }
  }
  .column-filter-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 11em;
    padding: var(--column-filter-panel-padding, 6px);
    border: var(
      --column-filter-panel-border,
      1px solid light-dark(rgba(0, 0, 0, 0.12), rgba(255, 255, 255, 0.18))
    );
    border-radius: var(--column-filter-panel-radius, 4px);
    background: var(--column-filter-panel-bg, var(--page-bg, Canvas));
    box-shadow: var(--column-filter-panel-shadow, 0 4px 12px rgba(0, 0, 0, 0.18));
    color: inherit; /* not the UA [popover] CanvasText */
    font-weight: normal;
    label {
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: space-between;
    }
    input[type='number'],
    input[type='search'] {
      width: 6em;
      min-width: 0;
      padding: 1px 3px;
    }
  }
  .column-filter-choices {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: var(--column-filter-choices-max-height, 14em);
    overflow-y: auto;
    label {
      justify-content: flex-start;
    }
  }
  .column-filter-clear {
    padding: 2px 4px;
    border: 1px solid light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.2));
    border-radius: 3px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.9em;
  }
</style>
