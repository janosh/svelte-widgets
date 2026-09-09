## User interface

### Food Picker (initially invalid)

```svelte example id="foods"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  const foods =
    `🍇 Grapes, 🍈 Melon, 🍉 Watermelon, 🍊 Tangerine, 🍋 Lemon, 🍌 Banana, 🍍 Pineapple, 🥭 Mango, 🍎 Red Apple, 🍏 Green Apple, 🍐 Pear, 🍑 Peach, 🍒 Cherries, 🍓 Strawberry, 🫐 Blueberries, 🥝 Kiwi, 🍅 Tomato, 🫒 Olive, 🥥 Coconut, 🥑 Avocado, 🍆 Eggplant, 🥔 Potato, 🥕 Carrot, 🌽 Ear of Corn, 🌶️ Hot Pepper, 🫑 Bell Pepper, 🥒 Cucumber, 🥬 Leafy Green, 🥦 Broccoli, 🧄 Garlic, 🧅 Onion, 🍄 Mushroom, 🥜 Peanuts`.split(
      `, `,
    )

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
  remove_all_title="Remove all foods"
  close_dropdown_on_select
  style="width: min(500px, 100%)"
  invalid
/>
```

### Retain Focus Picker

```svelte example id="retain-focus"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  const options = [`Svelte`, `Solid`, `React`]
</script>

<MultiSelect
  {options}
  close_dropdown_on_select="retain-focus"
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
