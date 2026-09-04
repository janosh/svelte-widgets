<script lang="ts" generics="Item">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { virtual_window } from './virtual'

  let {
    items,
    item_size = 32,
    overscan = 5,
    initial_count = 20,
    children,
    key = (_item, idx) => idx,
    element = $bindable(),
    ...rest
  }: {
    items: readonly Item[]
    item_size?: number
    overscan?: number
    initial_count?: number
    children: Snippet<[Item, number]>
    key?: (item: Item, idx: number) => string | number
    element?: HTMLDivElement
  } & Omit<HTMLAttributes<HTMLDivElement>, `children`> = $props()

  let scroll_top = $state(0)
  let viewport = $state(0)
  const window_range = $derived(
    virtual_window({
      scroll: scroll_top,
      viewport,
      item_size,
      count: items.length,
      overscan,
      min_window: viewport ? 0 : initial_count,
    }),
  )
  $effect(() => {
    if (
      !Number.isFinite(item_size) ||
      item_size <= 0 ||
      !Number.isInteger(overscan) ||
      overscan < 0
    ) {
      throw new Error(
        `VirtualList requires item_size > 0 and integer overscan >= 0; got ${item_size}, ${overscan}`,
      )
    }
  })
  $effect(() => {
    if (!element) return
    const node = element
    const measure = () => {
      viewport = node.clientHeight
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  })
  // Bring an item into view without rendering the intervening rows.
  export function scroll_to_index(idx: number): void {
    if (!element || !items.length) return
    const top = Math.max(0, Math.min(items.length - 1, idx)) * item_size
    element.scrollTop = Math.max(
      top + (viewport > 0 ? item_size - viewport : 0),
      Math.min(element.scrollTop, top),
    )
    scroll_top = element.scrollTop
  }
</script>

<div
  bind:this={element}
  {...rest}
  class={[`virtual-list`, rest.class]}
  onscroll={(event) => {
    scroll_top = event.currentTarget.scrollTop
    rest.onscroll?.(event)
  }}
>
  <div style:height={`${items.length * item_size}px`} style:position="relative">
    <div
      style:position="absolute"
      style:inset-inline="0"
      style:top={`${window_range.start * item_size}px`}
    >
      {#each items.slice(window_range.start, window_range.end) as item, offset (key(item, window_range.start + offset))}
        <div
          style:height={`${item_size}px`}
          style:box-sizing="border-box"
          data-index={window_range.start + offset}
        >
          {@render children(item, window_range.start + offset)}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-list {
    overflow: auto;
    overflow-anchor: none;
    max-height: 20rem;
  }
</style>
