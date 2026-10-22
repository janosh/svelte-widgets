<script lang="ts">
  // Term/value rows, each on one line: terms never wrap and a long value clips with an
  // ellipsis, its full text in the title. Terms key the rows, so they must be unique. Columns
  // come from the caller's grid-template-columns (one by default).
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    rows,
    ...rest
  }: HTMLAttributes<HTMLDListElement> & {
    rows: readonly (readonly [string, string | number])[]
  } = $props()
</script>

<dl {...rest} class={[`key-value-list`, rest.class]}>
  {#each rows as [term, value] (term)}
    <div>
      <dt>{term}</dt>
      <dd title={String(value)}>{value}</dd>
    </div>
  {/each}
</dl>

<style>
  dl {
    display: grid;
    align-content: start;
    gap: 4pt 2em;
    margin: 0;
    div {
      display: flex;
      justify-content: space-between;
      gap: 1em;
      min-width: 0;
      border-bottom: 1px solid var(--border-color, #8884);
      padding: 2pt 0;
    }
    dt {
      opacity: 0.7;
      white-space: nowrap;
    }
    dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
