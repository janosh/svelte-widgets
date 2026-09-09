## External CSS Classes

```svelte example id="foods"
<script lang="ts">
  import { MultiSelect } from '$lib'

  const options: string[] = [...Array(7).keys()].map((idx) => `Option ${idx + 1}`)
  let selected: string[] = $state(options.slice(0, 2))
</script>

<MultiSelect
  {options}
  outerDivClass="wrapper"
  ulSelectedClass="user-choices"
  ulOptionsClass="dropdown"
  liOptionClass="selectable-li"
  inputClass="search-text-input"
  liSelectedClass="selected-li"
  liActiveOptionClass="hovered-or-arrow-keyed-li"
  liUserMsgClass="selectable-msg-li"
  liActiveUserMsgClass="hovered-or-arrow-keyed-msg-li"
  maxSelectMsgClass="user-hint-max-selected-reached"
  placeholder="Which foods do you like?"
  bind:selected
  allowUserOptions
  maxSelect={2}
  --sms-bg="color-mix(in srgb, cornflowerblue 15%, light-dark(white, #1a1a2e))"
  --sms-options-bg="color-mix(in srgb, cornflowerblue 10%, light-dark(white, #1a1a2e))"
/>
<!-- maxSelect={2} needed for maxSelectMsg to show up -->

<p style="margin-top: 0.5em">
  Selected ({selected.length}/2): {selected.join(', ') || 'none'}
</p>
```

When using CSS frameworks like Tailwind, you can customize the appearance of `<MultiSelect />` through these classes.

This simplified DOM structure of the component shows where these classes are inserted:

```svelte
<div class="multiselect {outerDivClass}">
  <ul class="selected {ulSelectedClass}">
    <li class={liSelectedClass}>Selected 1</li>
    <li class={liSelectedClass}>Selected 2</li>
  </ul>

  <input class={inputClass} />

  <span class="max-select-msg {maxSelectMsgClass}"></span>

  <ul class="options {ulOptionsClass}">
    <li class={liOptionClass}>Option 1</li>
    <li class="{liOptionClass} {liActiveOptionClass}">Option 2 (currently active)</li>
    ...
    <li class="{liUserMsgClass} {liActiveUserMsgClass}">Create this option...</li>
  </ul>
</div>
```
