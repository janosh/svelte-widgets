## User interface

### Food Picker (initially invalid)

```svelte example id="foods"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { foods } from '$site/options'

  // golden-angle hues are distinct and stable across prerender/hydration (Math.random() isn't)
  let options = $derived(
    foods.map((label, idx) => ({
      label,
      style: `background-color: hsla(${(idx * 137.5) % 360}, 70%, 50%, 0.3)`,
    })),
  )
</script>

<MultiSelect
  {options}
  placeholder="Pick your favorite foods"
  removeAllTitle="Remove all foods"
  closeDropdownOnSelect
  style="width: min(500px, 100%)"
  invalid
/>
```

### Retain Focus Picker

```svelte example id="retain-focus"
<script lang="ts">
  import { MultiSelect } from '$lib'

  const options = [`Svelte`, `Solid`, `React`]
</script>

<MultiSelect
  {options}
  closeDropdownOnSelect="retain-focus"
  placeholder="Pick a framework"
/>
```

This page is the fixture for the Playwright UI tests in `tests/playwright/MultiSelect.test.ts`, which cover the remove-all button, focus and dropdown open/close behavior, filtering, and the ARIA attributes.

<!-- the Playwright arrow-key navigation test depends on this smooth scroll -->
<style>
  @media (prefers-reduced-motion: no-preference) {
    :global(html) {
      scroll-behavior: smooth;
    }
  }
</style>
