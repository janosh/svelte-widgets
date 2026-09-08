<script lang="ts" generics="Item">
  import { untrack, type Snippet } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import { flip } from 'svelte/animate'
  import type { HTMLAttributes } from 'svelte/elements'
  import { fade } from 'svelte/transition'
  import { chain_handlers, type MasonryOrder } from './utils'

  type ItemId = string | number
  type ItemRecord = { id: ItemId; idx: number; item: Item }

  // With the default getId, non-primitive items need an id property (name it via idKey) to
  // key the each block; a custom getId can derive the key from anything.
  // See https://svelte.dev/docs/svelte/each#Keyed-each-blocks.
  let {
    animate = true,
    order = `balanced-stable`,
    calcCols = (masonryWidth: number, minColWidth: number, gap: number): number =>
      Math.min(items.length, Math.floor((masonryWidth + gap) / (minColWidth + gap)) || 1),
    duration_ms = 200,
    gap = 20,
    getId = (item: Item): ItemId => {
      if (typeof item === `number`) return item
      if (typeof item === `string`) return item
      const resolved = (item as Record<string, unknown>)[idKey]
      if (typeof resolved === `string` || typeof resolved === `number`) return resolved
      throw new Error(
        `Masonry: item[${JSON.stringify(idKey)}] is ${typeof resolved}, expected string | number. Item: ${JSON.stringify(item)}`,
      )
    },
    idKey = `id`,
    initialCols,
    items,
    masonryHeight = $bindable(0),
    masonryWidth = $bindable(0),
    maxColWidth = 500,
    minColWidth = 330,
    columnProps = {},
    children,
    div = $bindable(),
    // Virtualization props
    virtualize = false,
    getEstimatedHeight,
    overscan = 5,
    height,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `children`> & {
    animate?: boolean
    order?: MasonryOrder
    calcCols?: (masonryWidth: number, minColWidth: number, gap: number) => number
    duration_ms?: number
    gap?: number
    getId?: (item: Item) => ItemId
    idKey?: string
    initialCols?: number
    items: Item[]
    masonryHeight?: number
    masonryWidth?: number
    maxColWidth?: number
    minColWidth?: number
    columnProps?: Omit<HTMLAttributes<HTMLDivElement>, `children`>
    children?: Snippet<[{ idx: number; item: Item }]>
    div?: HTMLDivElement
    // Virtualization props
    virtualize?: boolean
    getEstimatedHeight?: (item: Item) => number
    overscan?: number
    height?: number | string
  } = $props()

  // Needed over a random uuid so the id survives hydration.
  const unique_id = $props.id()

  // Measurements are the source of truth; the average is only needed for unseen items.
  const item_heights = new SvelteMap<ItemId, number>()
  const avg_measured_height = $derived(
    item_heights.size
      ? [...item_heights.values()].reduce((sum, item_height) => sum + item_height, 0) /
          item_heights.size
      : 150,
  )
  // Assignments and render records are non-reactive caches, preserving existing children.
  const stable_assignments = new Map<ItemId, number>()
  let prev_stable_num_cols = 0
  const item_records = new Map<ItemId, ItemRecord>()

  $effect(() => {
    const current_ids = new Set(items.map(getId))
    untrack(() => {
      for (const cache of [item_heights, stable_assignments, item_records]) {
        for (const id of cache.keys()) {
          if (!current_ids.has(id)) cache.delete(id)
        }
      }
    })
  })

  function get_item_record(item: Item, idx: number): ItemRecord {
    const id = getId(item)
    const existing = item_records.get(id)
    if (existing?.item === item && existing.idx === idx) return existing

    const record = { id, idx, item }
    item_records.set(id, record)
    return record
  }

  // Zero heights/estimates are unmeasured, so continue to the next estimate.
  const get_height = (item: Item): number =>
    item_heights.get(getId(item)) || getEstimatedHeight?.(item) || avg_measured_height

  // Keep measuring when order changes; virtualized grids use estimates only.
  const measure_height = (item_id: ItemId) => (node: HTMLElement) => {
    if (virtualize) return
    const observer = new ResizeObserver(() => {
      const item_height = node.offsetHeight
      if (item_height > 0) item_heights.set(item_id, item_height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }

  let effective_order = $derived(virtualize ? `row-first` : order)

  $effect.pre(() => {
    if (maxColWidth < minColWidth) {
      console.warn(
        `Masonry: maxColWidth (${maxColWidth}) < minColWidth (${minColWidth}).`,
      )
    }
  })
  // masonryWidth is 0 during SSR: prefer initialCols over the historical 1920px fallback.
  // CSS container queries hide the excess SSR columns before hydration.
  let n_cols = $derived.by(() => {
    if (
      initialCols !== undefined &&
      (!Number.isInteger(initialCols) || initialCols < 1)
    ) {
      throw new Error(
        `Masonry: initialCols must be a positive integer when provided, received ${initialCols}.`,
      )
    }
    if (!(masonryWidth > 0) && initialCols !== undefined)
      return Math.min(items.length, initialCols)
    const cols = calcCols(masonryWidth > 0 ? masonryWidth : 1920, minColWidth, gap)
    // Indexing columns requires a positive integer; zero is valid for an empty list.
    if (!Number.isInteger(cols) || cols < (items.length > 0 ? 1 : 0)) {
      throw new Error(
        `Masonry: calcCols must return a positive integer, received ${cols}.`,
      )
    }
    return cols
  })

  // Container query rules: breakpoint(n) = (minColWidth + gap) * n - gap
  let container_query_css = $derived(
    Array.from({ length: n_cols - 1 }, (_, idx) => {
      const col_count = idx + 1
      const max_width = (minColWidth + gap) * (col_count + 1) - gap - 1
      const min_width =
        col_count === 1
          ? ``
          : `(min-width: ${(minColWidth + gap) * col_count - gap}px) and `
      return `@container masonry ${min_width}(max-width: ${max_width}px) { [data-masonry-id="${unique_id}"] > .col:nth-child(n+${
        col_count + 1
      }) { display: none !important; } }`
    }).join(`\n`),
  )

  let items_to_cols = $derived.by(() => {
    const cols: ItemRecord[][] = Array.from({ length: n_cols }, () => [])
    const heights = cols.map(() => 0)
    const stable = effective_order === `balanced-stable`
    const use_heights =
      stable ||
      ((effective_order === `balanced` || effective_order === `column-balanced`) &&
        item_heights.size >= items.length)
    if (stable) {
      // Growing resets placement; shrinking only reseats out-of-range assignments.
      if (n_cols > prev_stable_num_cols) stable_assignments.clear()
      prev_stable_num_cols = n_cols
    }
    let remaining_height =
      use_heights && effective_order === `column-balanced`
        ? items.reduce((sum, item) => sum + get_height(item) + gap, 0)
        : 0
    let col_idx = 0
    for (const [idx, item] of items.entries()) {
      const record = get_item_record(item, idx)
      const item_height = use_heights ? get_height(item) + gap : 0
      if (effective_order === `column-sequential`) {
        col_idx = Math.floor((idx * Math.min(n_cols, items.length)) / items.length)
      } else if (!use_heights) {
        col_idx = idx % n_cols
      } else if (effective_order === `column-balanced`) {
        // Split near the remaining average and reserve one item for each later column.
        const col_height = heights[col_idx]
        const remaining_cols = n_cols - col_idx - 1
        const target = remaining_height / (remaining_cols + 1)
        if (
          col_height > 0 &&
          remaining_cols > 0 &&
          (items.length - idx <= remaining_cols ||
            Math.abs(col_height - target) <= Math.abs(col_height + item_height - target))
        ) {
          remaining_height -= col_height
          col_idx++
        }
      } else {
        const assigned = stable ? stable_assignments.get(record.id) : undefined
        col_idx =
          assigned !== undefined && assigned < n_cols
            ? assigned
            : heights.indexOf(Math.min(...heights))
        if (stable) stable_assignments.set(record.id, col_idx)
      }
      cols[col_idx].push(record)
      heights[col_idx] += item_height
    }
    return cols
  })

  let warned_missing_height = false
  $effect.pre(() => {
    if (virtualize && height === undefined && !warned_missing_height) {
      warned_missing_height = true
      console.warn(
        `Masonry: virtualize=true requires a height prop. Falling back to 400px.`,
      )
    }
  })

  // Binary search: find first index where cumulative_heights[idx] >= target
  function binary_search_ge(cumulative_heights: number[], target: number): number {
    let [low_idx, high_idx] = [0, cumulative_heights.length]
    while (low_idx < high_idx) {
      const mid_idx = (low_idx + high_idx) >>> 1
      if (cumulative_heights[mid_idx] < target) low_idx = mid_idx + 1
      else high_idx = mid_idx
    }
    return low_idx
  }

  // declared before prefix_heights, which depends on it
  let scroll_top = $state(0)
  let ticking = false

  function on_scroll(event: Event) {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      scroll_top = (event.target as HTMLElement).scrollTop
      ticking = false
    })
  }

  // prefix_heights[col][idx] = cumulative height of items 0..idx. Virtualizing uses ONLY
  // estimates, never measured heights, so the scroll window can't drift.
  let prefix_heights = $derived(
    items_to_cols.map((column_items) => {
      let sum = 0
      return column_items.map(({ item }) => {
        // `||` as in get_height: `??` would collapse the scroll window to gaps alone
        sum += (virtualize ? getEstimatedHeight?.(item) || 150 : get_height(item)) + gap
        return sum
      })
    }),
  )

  // viewport height: numbers used directly, CSS strings like `80vh` need the measured value
  let container_height = $derived(
    typeof height === `number` ? height : masonryHeight || 400,
  )

  // same height as a CSS value; strings like `80vh` pass through
  let css_height = $derived(
    typeof height === `number` ? `${height}px` : (height ?? `400px`),
  )
  // Emitted after any consumer style so virtualization keeps the sizing it depends on
  let virtual_style = $derived(
    virtualize ? `overflow-y: auto; height: ${css_height};` : ``,
  )

  // wait for a real container height, else CSS units like `80vh` flicker
  let can_virtualize = $derived(
    virtualize && (typeof height === `number` || masonryHeight > 0),
  )
  // Filtering can shrink the grid before the browser reports its clamped scroll offset.
  // Clamp against the tallest column so shorter columns stay aligned with the shared view.
  let window_scroll_top = $derived.by(() => {
    const max_scroll_top = Math.max(
      0,
      ...prefix_heights.map((heights) => (heights.at(-1) ?? 0) - gap - container_height),
    )
    return Math.min(scroll_top, max_scroll_top)
  })

  // Per-column render window: on-screen slice plus padding for the culled items. Recomputes
  // on scroll, so it reads prefix_heights rather than redoing those O(n) prefix sums.
  let col_windows = $derived(
    prefix_heights.map((ph) => {
      if (!can_virtualize) return { start: 0, end: ph.length, pad_top: 0, pad_bottom: 0 }
      const start = Math.max(0, binary_search_ge(ph, window_scroll_top) - 1 - overscan)
      // the item straddling the bottom edge is on screen, so the exclusive end must clear it
      // (mirrors the row of margin `start` takes)
      const end = Math.min(
        ph.length,
        binary_search_ge(ph, window_scroll_top + container_height) + 1 + overscan,
      )
      return {
        start,
        end,
        pad_top: start > 0 ? ph[start - 1] : 0,
        pad_bottom: Math.max(0, (ph.at(-1) ?? 0) - (end > 0 ? (ph[end - 1] ?? 0) : 0)),
      }
    }),
  )

  // FLIP animations don't work well with virtualization
  let effective_animate = $derived(animate && !can_virtualize)
</script>

<!-- container queries in <head> hide excess SSR columns -->
<svelte:head>
  <svelte:element this={`style`}>{container_query_css}</svelte:element>
</svelte:head>

{#snippet render_item(idx: number, item: Item)}
  {#if children}{@render children({ idx, item })}{:else}
    <span>{item}</span>
  {/if}
{/snippet}

<div
  bind:clientWidth={masonryWidth}
  bind:clientHeight={masonryHeight}
  bind:this={div}
  style:gap="{gap}px"
  {...rest}
  onscroll={chain_handlers(virtualize ? on_scroll : undefined, rest.onscroll)}
  style={`display: flex; width: 100%; justify-content: center; box-sizing: border-box; ${rest.style ? `${rest.style}; ` : ``}${virtual_style}`}
  class={[`masonry`, rest.class]}
  data-masonry-id={unique_id}
>
  {#each items_to_cols as col, col_idx (col_idx)}
    {@const { start, end, pad_top, pad_bottom } = col_windows[col_idx]}
    {@const visible_items = can_virtualize ? col.slice(start, end) : col}
    <div
      {...columnProps}
      class={[`col`, `col-${col_idx}`, columnProps.class]}
      style:display="grid"
      style:flex="1 1 0"
      style:min-width="0"
      style:gap="{gap}px"
      style:max-width="{maxColWidth}px"
      style:padding-top={can_virtualize ? `${pad_top}px` : undefined}
      style:padding-bottom={can_virtualize ? `${pad_bottom}px` : undefined}
    >
      {#if effective_animate}
        {#each visible_items as { id, idx, item } (id)}
          <div
            {@attach measure_height(id)}
            in:fade={{ delay: 100, duration: duration_ms }}
            out:fade={{ delay: 0, duration: duration_ms }}
            animate:flip={{ duration: duration_ms }}
          >
            {@render render_item(idx, item)}
          </div>
        {/each}
      {:else}
        {#each visible_items as { id, idx, item } (id)}
          <div {@attach measure_height(id)}>
            {@render render_item(idx, item)}
          </div>
        {/each}
      {/if}
    </div>
  {/each}
</div>

<style>
  /* layout properties live inline (see issue #48) so CSS resets can't override them */
  div.masonry {
    container-type: inline-size;
    container-name: masonry;
    overflow-wrap: anywhere;
  }
  div.masonry div.col {
    height: max-content;
  }
</style>
