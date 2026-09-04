<script lang="ts">
  import JsonTree from '$lib/json-tree/JsonTree.svelte'
  import type { ComponentProps } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'

  // Extra JsonTree props (editable, on_copy, ...) forwarded as-is
  let rest: Partial<ComponentProps<typeof JsonTree>> = $props()

  let value = $state<Record<string, Record<string, string>>>({
    nested: {
      stale: `old`,
      findme: `old`,
    },
  })
  let collapsed_paths = $state(new SvelteSet<string>())
</script>

<button
  type="button"
  data-testid="replace-json"
  onclick={() => (value = { nested: { fresh: `new`, findme: `new` } })}
>
  Replace JSON
</button>
<button
  type="button"
  data-testid="replace-flat-json"
  onclick={() => (value = { other: { fresh: `new` } })}
>
  Replace Flat JSON
</button>
<button
  type="button"
  data-testid="mutate-leaf"
  onclick={() => (value.nested.findme = `mutated`)}
>
  Mutate Leaf
</button>
<span data-testid="collapsed-count">{collapsed_paths.size}</span>
<JsonTree {...rest} {value} bind:collapsed_paths default_fold_level={5} />
