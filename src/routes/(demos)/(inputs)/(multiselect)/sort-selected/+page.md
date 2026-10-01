## Sorting Selected Items

### Frontend Lib Picker

The first picker sorts selected libs by label with `sort_selected`, the second passes a comparator that sorts by programming language first.

```svelte example id="sort-selected"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  type FrontendLib = { label: string; lang: string }

  const frontend_libs: FrontendLib[] = [
    [`Svelte`, `JavaScript`],
    [`React`, `JavaScript`],
    [`Vue`, `JavaScript`],
    [`Angular`, `JavaScript`],
    [`Polymer`, `JavaScript`],
    [`Ruby on Rails`, `Ruby`],
    [`ASP.net`, `C#`],
    [`Laravel`, `PHP`],
    [`Django`, `Python`],
    [`Express`, `JavaScript`],
    [`Spring`, `Java`],
    [`jQuery`, `JavaScript`],
    [`Flask`, `Python`],
    [`Flutter`, `Dart`],
    [`Bootstrap`, `JavaScript`],
    [`Sinatra`, `Ruby`],
    [`Solid`, `JavaScript`],
    [`Ember JS`, `JavaScript`],
    [`Backbone`, `JavaScript`],
    [`Preact`, `JavaScript`],
  ].map(([label, lang]) => ({ label, lang }))

  const sort_by_lang = (op1: FrontendLib, op2: FrontendLib): number =>
    op1.lang.localeCompare(op2.lang) || op1.label.localeCompare(op2.label)

  let selected: FrontendLib[] = $state([])
</script>

selected = {selected.map((itm, idx) => `${idx + 1}. ${itm.label}`).join(`, `) || `[]`}

<MultiSelect
  options={frontend_libs}
  placeholder="Default sorting by label"
  sort_selected
  bind:value={selected}
  style="margin-bottom: 1em"
/>

<MultiSelect
  options={frontend_libs}
  placeholder="Custom sorting by language, then label"
  sort_selected={sort_by_lang}
/>
```

MultiSelect by default renders selected items in the order they were chosen. Enabling `sort_selected` implicitly disables drag reordering because `selected_options_draggable` defaults to `!sort_selected`. Explicitly combining sorting with `selected_options_draggable={true}` throws because the two ordering contracts conflict. The prop

```ts
sort_selected: boolean | ((op1: Option, op2: Option) => number) = false
```

can be set to `true` to sort selected options by label with `localeCompare`. Provide your own comparator function to define a custom sort order.
