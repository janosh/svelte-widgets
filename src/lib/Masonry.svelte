<script lang="ts" generics="Item">
  import type { Snippet } from 'svelte'
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

  // Plain (non-reactive) Map so measurements don't re-render; only the two counters below
  // are reactive, to drive column balancing
  const item_heights_cache = new Map<ItemId, number>()
  let measured_count = $state(0)
  let measured_sum = $state(0)
  let avg_measured_height = $derived(
    measured_count > 0 ? measured_sum / measured_count : null,
  )

  // Tracks each item's assigned column (for balanced-stable mode)
  const stable_assignments = new Map<ItemId, number>()
  let prev_stable_num_cols = 0
  const item_records = new Map<ItemId, ItemRecord>()

  // Drop heights/assignments of removed items (prevents memory leak)
  $effect(() => {
    const current_ids = new Set(items.map(getId))
    let removed_sum = 0
    for (const [id, item_height] of item_heights_cache.entries()) {
      if (!current_ids.has(id)) {
        removed_sum += item_height
        item_heights_cache.delete(id)
      }
    }
    if (removed_sum > 0) {
      measured_sum -= removed_sum
      measured_count = item_heights_cache.size
    }
    for (const stale_map of [stable_assignments, item_records]) {
      for (const id of stale_map.keys()) {
        if (!current_ids.has(id)) stale_map.delete(id)
      }
    }
  })

  function get_item_record(item: Item, idx: number): ItemRecord {
    const id = getId(item)
    const existing = item_records.get(id)
    if (existing?.item === item && existing.idx === idx) return existing

    const record = { id, idx, item }
    item_records.set(id, record)
    return record
  }

  // Reads from non-reactive cache, so won't trigger re-renders
  const get_height = (item: Item): number => {
    // `||` not `??`: a 0 height is meaningless, so fall through to the estimate chain
    const cached = item_heights_cache.get(getId(item))
    return cached || getEstimatedHeight?.(item) || avg_measured_height || 150
  }

  // Attached even for modes that don't need measurement, since order can change at runtime.
  // Skipped while virtualizing, which uses estimates only.
  const measure_height = (item_id: ItemId) => (node: HTMLElement) => {
    if (virtualize) return
    const observer = new ResizeObserver(() => {
      const new_height = node.offsetHeight
      const old_height = item_heights_cache.get(item_id) ?? 0
      if (new_height > 0 && old_height !== new_height) {
        measured_sum += new_height - old_height
        item_heights_cache.set(item_id, new_height)
        // in sync with the cache so `measured_count >= items.length` checks stay accurate
        measured_count = item_heights_cache.size
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }

  let effective_order = $derived(virtualize ? `row-first` : order)

  // Index-only placement. Deliberately never calls get_height, so these modes take no
  // dependency on height state.
  function distribute_by_idx(
    num_cols: number,
    pick_col: (idx: number) => number,
  ): ItemRecord[][] {
    const cols: ItemRecord[][] = Array.from({ length: num_cols }, () => [])
    for (const [idx, item] of items.entries()) {
      cols[pick_col(idx)].push(get_item_record(item, idx))
    }
    return cols
  }

  // pick_col receives the per-column heights (item height + gap) accumulated so far
  function distribute(
    num_cols: number,
    pick_col: (heights: number[], item: Item) => number,
  ): ItemRecord[][] {
    const cols: ItemRecord[][] = Array.from({ length: num_cols }, () => [])
    const heights: number[] = Array.from({ length: num_cols }, () => 0)

    for (const [idx, item] of items.entries()) {
      const col_idx = pick_col(heights, item)
      cols[col_idx].push(get_item_record(item, idx))
      heights[col_idx] += get_height(item) + gap
    }
    return cols
  }

  const shortest_col = (heights: number[]): number =>
    heights.indexOf(Math.min(...heights))

  // At a steady column count new items go to the shortest column and existing ones keep
  // theirs; a change drops every assignment (more columns) or reseats the ones now out of
  // range (fewer). Mutating stable_assignments inside a $derived is safe: it's a
  // non-reactive cache, not a dependency.
  function balanced_stable_to_cols(num_cols: number): ItemRecord[][] {
    if (num_cols > prev_stable_num_cols) stable_assignments.clear()
    prev_stable_num_cols = num_cols

    return distribute(num_cols, (heights, item) => {
      const id = getId(item)
      const col_idx = stable_assignments.get(id)
      if (col_idx !== undefined && col_idx < num_cols) return col_idx
      const new_col = shortest_col(heights)
      stable_assignments.set(id, new_col)
      return new_col
    })
  }

  // Height-aware column-first: fill col 1 to target height, then col 2, etc.
  function column_balanced_to_cols(num_cols: number): ItemRecord[][] {
    const total_height = items.reduce((sum, item) => sum + get_height(item) + gap, 0)
    const target_per_col = total_height / num_cols
    let col_idx = 0

    return distribute(num_cols, (heights) => {
      if (heights[col_idx] >= target_per_col && col_idx < num_cols - 1) col_idx++
      return col_idx
    })
  }

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
    // distribute() builds one array per column, so <1 leaves nowhere to put an item (0 is
    // fine when empty, which is what the default calcCols returns).
    const checked = (cols: number) => {
      // fractional is equally broken: Array.from truncates the column array while row-first's
      // `idx % n_cols` keeps producing the untruncated index
      if (items.length > 0 && (!Number.isInteger(cols) || cols < 1)) {
        throw new Error(
          `Masonry: calcCols must return a positive integer, received ${cols}.`,
        )
      }
      return cols
    }
    if (masonryWidth > 0) return checked(calcCols(masonryWidth, minColWidth, gap))
    if (initialCols === undefined) return checked(calcCols(1920, minColWidth, gap))
    return Math.min(items.length, initialCols)
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
    // balanced-stable never falls back: stable assignments + estimates for new items keep
    // existing items from jumping columns as long as the column count holds
    if (effective_order === `balanced-stable`) return balanced_stable_to_cols(n_cols)

    // Other height-aware modes need every item measured; check the mode first so only they
    // depend on measured_count.
    if (effective_order === `balanced` && measured_count >= items.length) {
      return distribute(n_cols, shortest_col)
    }
    if (effective_order === `column-balanced` && measured_count >= items.length) {
      return column_balanced_to_cols(n_cols)
    }
    if (effective_order === `column-sequential`) {
      // sequential column-first: first N items in col 1, next N in col 2, etc.
      const items_per_col = Math.ceil(items.length / n_cols)
      return distribute_by_idx(n_cols, (idx) =>
        Math.min(Math.floor(idx / items_per_col), n_cols - 1),
      )
    }
    // row-first, and the round-robin fallback for height-aware modes pre-measurement
    return distribute_by_idx(n_cols, (idx) => idx % n_cols)
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

  // Per-column render window: on-screen slice plus padding for the culled items. Recomputes
  // on scroll, so it reads prefix_heights rather than redoing those O(n) prefix sums.
  let col_windows = $derived(
    prefix_heights.map((ph) => {
      if (!can_virtualize) return { start: 0, end: ph.length, pad_top: 0, pad_bottom: 0 }
      const start = Math.max(0, binary_search_ge(ph, scroll_top) - 1 - overscan)
      // the item straddling the bottom edge is on screen, so the exclusive end must clear it
      // (mirrors the row of margin `start` takes)
      const end = Math.min(
        ph.length,
        binary_search_ge(ph, scroll_top + container_height) + 1 + overscan,
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
