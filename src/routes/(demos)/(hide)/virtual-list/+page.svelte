<script lang="ts">
  // Internal test page for playwright e2e tests (tests/playwright/MultiSelect.test.ts):
  // virtualList windowing needs real browser layout (happy-dom reports clientHeight 0)
  import { MultiSelect } from '$lib'

  const virtual_options = Array.from({ length: 2000 }, (_, idx) => `Option ${idx}`)
</script>

<h2>Virtual List</h2>

<!-- liOptionStyle pins row height to the default virtualList itemHeight (30px) so
  windowing math matches real layout regardless of platform fonts -->
<MultiSelect
  outerDivClass="virtual"
  options={virtual_options}
  virtualList
  open
  ulOptionsStyle="max-height: 300px"
  liOptionStyle="height: 30px; box-sizing: border-box"
/>
