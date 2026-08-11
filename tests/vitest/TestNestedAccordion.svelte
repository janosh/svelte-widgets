<script lang="ts">
  import Accordion from '$lib/Accordion.svelte'

  const outer_items = [
    { value: `outer-one`, label: `Outer one` },
    { value: `outer-two`, label: `Outer two` },
  ]
  const inner_items = [
    { value: `inner-one`, label: `Inner one` },
    { value: `inner-two`, label: `Inner two` },
  ]
  let [outer_value, inner_value] = $state([`outer-one`, `inner-one`])
</script>

<Accordion items={outer_items} bind:value={outer_value}>
  {#snippet panel({ item })}
    {#if item.value === `outer-one`}
      <Accordion items={inner_items} bind:value={inner_value} />
    {/if}
  {/snippet}
</Accordion>
