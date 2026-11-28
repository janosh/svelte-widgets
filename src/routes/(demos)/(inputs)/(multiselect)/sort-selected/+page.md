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

```ts
sort_selected: boolean | ((op1: Option, op2: Option) => number) = false
```

By default, selected items keep the order they were chosen in. `true` sorts them by label with `localeCompare`, a comparator sets a custom order. Sorting disables drag reordering, since `selected_options_draggable` defaults to `!sort_selected`; passing `selected_options_draggable={true}` alongside throws.
