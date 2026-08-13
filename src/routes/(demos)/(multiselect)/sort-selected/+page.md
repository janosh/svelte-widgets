<script lang="ts">
  import { FileDetails } from '$lib'
  import options_src from '$site/options.ts?raw'
</script>

## Sorting Selected Items

### Frontend Lib Picker (default sorting)

```svelte example id="default-sort"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'
  import { frontend_libs } from '$site/options'

  let selected: ObjectOption[] = $state([])
</script>

selected = {selected.map((itm, idx) => `${idx + 1}. ${itm.label}`).join(`, `) || `[]`}

<MultiSelect
  options={frontend_libs}
  placeholder="Pick your favorite frontend libs"
  sortSelected
  bind:selected
/>
```

### Frontend Lib Picker (custom sorting by programming language)

```svelte example id="custom-sort"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { frontend_libs, type FrontendLib } from '$site/options'

  const sortSelected = (op1: FrontendLib, op2: FrontendLib): number => {
    if (op1.lang !== op2.lang) return op1.lang.localeCompare(op2.lang)
    return String(op1.label).localeCompare(String(op2.label))
  }
</script>

<MultiSelect
  options={frontend_libs}
  placeholder="Pick your favorite frontend libs"
  {sortSelected}
/>
```

<FileDetails files={[{ title: `<code>options.ts</code>`, content: options_src }]} />

MultiSelect by default renders selected items in the order they were chosen. Enabling `sortSelected` implicitly disables drag reordering because `selectedOptionsDraggable` defaults to `!sortSelected`. Explicitly combining sorting with `selectedOptionsDraggable={true}` throws because the two ordering contracts conflict. The prop

```ts
sortSelected: boolean | ((op1: Option, op2: Option) => number) = false
```

can be set to `true` to sort selected options by label with `localeCompare`. Provide
your own comparator function to define a custom sort order.
