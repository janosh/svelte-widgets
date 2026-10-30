<script lang="ts" generics="Item">
  import { untrack, type Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { reveal_scroll, virtual_window } from './virtual'

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
  const total_height = $derived(items.length * item_size)
  // Destructured into per-field deriveds: unlike the fresh window object, the numbers stay
  // equal across sub-row scrolls, so the keyed each re-slices only when a row enters or leaves
  const { start, end } = $derived.by(() => {
    if (
      !Number.isFinite(item_size) ||
      item_size <= 0 ||
      !Number.isInteger(overscan) ||
      overscan < 0 ||
      !Number.isInteger(initial_count) ||
      initial_count < 0
    ) {
      throw new Error(
        `VirtualList requires positive item_size and nonnegative integer overscan/initial_count; got ${item_size}, ${overscan}, ${initial_count}`,
      )
    }
    return virtual_window({
      scroll: scroll_top,
      viewport,
      item_size,
      count: items.length,
      overscan,
      min_window: viewport ? 0 : initial_count,
    })
  })

  const set_scroll = (top: number): void => {
    if (!element) return
    const spacer = element.firstElementChild
    if (spacer instanceof HTMLElement) spacer.style.height = `${total_height}px`
    element.scrollTop = Math.max(0, Math.min(top, total_height - viewport))
    scroll_top = element.scrollTop
  }

  // Clamp stale scroll positions when the data or viewport changes.
  $effect.pre(() => {
    void total_height
    void viewport
    untrack(() => set_scroll(scroll_top))
  })

  const observe = (node: HTMLDivElement): (() => void) => {
    const observer = new ResizeObserver(() => {
      viewport = node.clientHeight
    })
    viewport = node.clientHeight
    observer.observe(node)
    return () => observer.disconnect()
  }

  // Bring an item into view without rendering the intervening rows.
  export function scroll_to_index(idx: number): void {
    if (!Number.isInteger(idx))
      throw new Error(`VirtualList requires an integer index; got ${idx}`)
    if (!element || !items.length) return
    const top = Math.max(0, Math.min(items.length - 1, idx)) * item_size
    set_scroll(reveal_scroll(top, item_size, viewport, element.scrollTop))
  }
</script>

<div
  bind:this={element}
  {@attach observe}
  {...rest}
  class={[`virtual-list`, rest.class]}
  onscroll={(event) => {
    scroll_top = event.currentTarget.scrollTop
    rest.onscroll?.(event)
  }}
>
  <div style:height={`${total_height}px`} style:position="relative">
    <div
      style:position="absolute"
      style:inset-inline="0"
      style:top={`${start * item_size}px`}
    >
      {#each items.slice(start, end) as item, offset (key(item, start + offset))}
        <div
          style:height={`${item_size}px`}
          style:display="flow-root"
          style:box-sizing="border-box"
          data-index={start + offset}
        >
          {@render children(item, start + offset)}
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
