<script lang="ts">
  import JsonTree from '$lib/json-tree/JsonTree.svelte'
  import type { ComponentProps } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'

  // Extra JsonTree props (editable, on_copy, ...) forwarded as-is
  let rest: Partial<ComponentProps<typeof JsonTree>> = $props()

  let value = $state<Record<string, Record<string, string>>>({
    nested: { stale: `old`, findme: `old` },
  })
  let collapsed_paths = $state(new SvelteSet<string>())
  // Buttons the tests click by data-testid
  const actions: Record<string, () => void> = {
    'replace-json': () => (value = { nested: { fresh: `new`, findme: `new` } }),
    'replace-flat-json': () => (value = { other: { fresh: `new` } }),
    'mutate-leaf': () => (value.nested.findme = `mutated`),
  }
</script>

{#each Object.entries(actions) as [testid, onclick] (testid)}
  <button type="button" data-testid={testid} {onclick}>{testid}</button>
{/each}
<span data-testid="collapsed-count">{collapsed_paths.size}</span>
<JsonTree {...rest} {value} bind:collapsed_paths default_fold_level={5} />
