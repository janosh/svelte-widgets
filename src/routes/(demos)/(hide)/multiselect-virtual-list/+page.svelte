<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  // Internal test page for playwright e2e tests (tests/playwright/MultiSelect.test.ts):
  // virtual_list windowing needs real browser layout (happy-dom reports clientHeight 0)
  import { MultiSelect } from 'svelte-widgets'

  const virtual_options = Array.from({ length: 2000 }, (_, idx) => `Option ${idx}`)
</script>

<Heading level={2} id="virtual-list">Virtual List</Heading>

<MultiSelect
  outer_div_class="virtual"
  options={virtual_options}
  virtual_list
  open
  ul_options_style="max-height: 300px"
/>
