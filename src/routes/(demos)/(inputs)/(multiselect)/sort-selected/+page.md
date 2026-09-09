## Sorting Selected Items

### Frontend Lib Picker (default sorting)

```svelte example id="default-sort"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'
  type FrontendLib = { label: string; lang: string; repo: string }

  const frontend_libs: FrontendLib[] = [
    [`Svelte`, `JavaScript`, `sveltejs/svelte`],
    [`React`, `JavaScript`, `facebook/react`],
    [`Vue`, `JavaScript`, `vuejs/vue`],
    [`Angular`, `JavaScript`, `angular/angular`],
    [`Polymer`, `JavaScript`, `polymer/polymer`],
    [`Ruby on Rails`, `Ruby`, `rails/rails`],
    [`ASP.net`, `C#`, `dotnet/aspnetcore`],
    [`Laravel`, `PHP`, `laravel/laravel`],
    [`Django`, `Python`, `django/django`],
    [`Express`, `JavaScript`, `expressjs/express`],
    [`Spring`, `Java`, `spring-projects/spring-framework`],
    [`jQuery`, `JavaScript`, `jquery/jquery`],
    [`Flask`, `Python`, `pallets/flask`],
    [`Flutter`, `Dart`, `flutter/flutter`],
    [`Bootstrap`, `JavaScript`, `twbs/bootstrap`],
    [`Sinatra`, `Ruby`, `sinatra/sinatra`],
    [`Solid`, `JavaScript`, `solidjs/solid`],
    [`Ember JS`, `JavaScript`, `emberjs/ember.js`],
    [`Backbone`, `JavaScript`, `jashkenas/backbone`],
    [`Preact`, `JavaScript`, `preactjs/preact`],
  ].map(([label, lang, github_slug]) => ({
    label,
    lang,
    repo: `https://github.com/${github_slug}`,
  }))

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
  import { MultiSelect } from 'svelte-widgets'
  type FrontendLib = { label: string; lang: string; repo: string }

  const frontend_libs: FrontendLib[] = [
    [`Svelte`, `JavaScript`, `sveltejs/svelte`],
    [`React`, `JavaScript`, `facebook/react`],
    [`Vue`, `JavaScript`, `vuejs/vue`],
    [`Angular`, `JavaScript`, `angular/angular`],
    [`Polymer`, `JavaScript`, `polymer/polymer`],
    [`Ruby on Rails`, `Ruby`, `rails/rails`],
    [`ASP.net`, `C#`, `dotnet/aspnetcore`],
    [`Laravel`, `PHP`, `laravel/laravel`],
    [`Django`, `Python`, `django/django`],
    [`Express`, `JavaScript`, `expressjs/express`],
    [`Spring`, `Java`, `spring-projects/spring-framework`],
    [`jQuery`, `JavaScript`, `jquery/jquery`],
    [`Flask`, `Python`, `pallets/flask`],
    [`Flutter`, `Dart`, `flutter/flutter`],
    [`Bootstrap`, `JavaScript`, `twbs/bootstrap`],
    [`Sinatra`, `Ruby`, `sinatra/sinatra`],
    [`Solid`, `JavaScript`, `solidjs/solid`],
    [`Ember JS`, `JavaScript`, `emberjs/ember.js`],
    [`Backbone`, `JavaScript`, `jashkenas/backbone`],
    [`Preact`, `JavaScript`, `preactjs/preact`],
  ].map(([label, lang, github_slug]) => ({
    label,
    lang,
    repo: `https://github.com/${github_slug}`,
  }))

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

MultiSelect by default renders selected items in the order they were chosen. Enabling `sortSelected` implicitly disables drag reordering because `selectedOptionsDraggable` defaults to `!sortSelected`. Explicitly combining sorting with `selectedOptionsDraggable={true}` throws because the two ordering contracts conflict. The prop

```ts
sortSelected: boolean | ((op1: Option, op2: Option) => number) = false
```

can be set to `true` to sort selected options by label with `localeCompare`. Provide
your own comparator function to define a custom sort order.
