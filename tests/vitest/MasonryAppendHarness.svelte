<script lang="ts">
  import { Masonry, type MasonryOrder } from '$lib'
  import AppendRenderProbe from './AppendRenderProbe.svelte'

  let {
    events,
    order = `balanced-stable`,
    virtualize = false,
  }: { events: number[]; order?: MasonryOrder; virtualize?: boolean } = $props()

  let items = $state([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
  let n_cols = $state(2)

  export const append = (...ids: number[]): void => {
    items = [...items, ...ids.map((id) => ({ id }))]
  }

  export const remove = (...ids: number[]): void => {
    items = items.filter(({ id }) => !ids.includes(id))
  }

  export const set_cols = (next_cols: number): void => {
    n_cols = next_cols
  }
</script>

<Masonry
  {items}
  animate={false}
  calcCols={() => n_cols}
  idKey="id"
  {order}
  {virtualize}
  height={300}
  overscan={0}
>
  {#snippet children({ item })}
    <AppendRenderProbe {events} {item} />
  {/snippet}
</Masonry>
