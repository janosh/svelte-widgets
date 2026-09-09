<script lang="ts">
  // Internal test page for playwright e2e tests (tests/playwright/MultiSelect.test.ts):
  // virtual_list windowing needs real browser layout (happy-dom reports clientHeight 0)
  import { MultiSelect } from 'svelte-widgets'

  const virtual_options = Array.from({ length: 2000 }, (_, idx) => `Option ${idx}`)
</script>

<h2>Virtual List</h2>

<!-- li_option_style pins row height to the default virtual_list item_height (30px) so
  windowing math matches real layout regardless of platform fonts -->
<MultiSelect
  outer_div_class="virtual"
  options={virtual_options}
  virtual_list
  open
  ul_options_style="max-height: 300px"
  li_option_style="height: 30px; box-sizing: border-box"
/>
