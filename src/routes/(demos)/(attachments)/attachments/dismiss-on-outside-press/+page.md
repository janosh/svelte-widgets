## `dismiss_on_outside_press`

For a surface assembled from several elements, call `dismiss_on_outside_press()` directly with an `inside` list instead of attaching `click_outside` to one node.

```svelte example id="attachments-dismiss-multiple"
<script lang="ts">
  import { dismiss_on_outside_press } from '$lib/attachments'

  let open = $state(true)
  let first = $state<HTMLElement | null>(null)
  let second = $state<HTMLElement | null>(null)

  $effect(() => {
    if (!open || !first || !second) return
    return dismiss_on_outside_press({
      inside: [first, second],
      escape: true,
      callback: () => (open = false),
    })
  })
</script>

<button onclick={() => (open = true)}>Open two-part surface</button>
{#if open}
  <div bind:this={first} style="padding: 0.5rem; border: 1px solid currentColor">
    First part
  </div>
  <div bind:this={second} style="padding: 0.5rem; border: 1px solid currentColor">
    Second part
  </div>
{/if}
```

<style>
  h3, h3 code {
    font-size: 1.2em;
    margin-top: 2em;
  }
  /* the index at the top is this page's only prose list, so lay it out inline */
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 3pt 1em;
    padding: 0;
    list-style: none;
  }
</style>
