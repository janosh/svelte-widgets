## External CSS Classes

```svelte example id="foods"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  const options: string[] = [...Array(7).keys()].map((idx) => `Option ${idx + 1}`)
  let selected: string[] = $state(options.slice(0, 2))
</script>

<MultiSelect
  {options}
  outer_div_class="wrapper"
  ul_selected_class="user-choices"
  ul_options_class="dropdown"
  li_option_class="selectable-li"
  input_class="search-text-input"
  li_selected_class="selected-li"
  li_active_option_class="hovered-or-arrow-keyed-li"
  li_user_msg_class="selectable-msg-li"
  li_active_user_msg_class="hovered-or-arrow-keyed-msg-li"
  max_select_msg_class="user-hint-max-selected-reached"
  placeholder="Which foods do you like?"
  bind:selected
  allow_user_options
  max_select={2}
  --sms-bg="color-mix(in srgb, cornflowerblue 15%, light-dark(white, #1a1a2e))"
  --sms-options-bg="color-mix(in srgb, cornflowerblue 10%, light-dark(white, #1a1a2e))"
/>
<!-- max_select={2} needed for max_select_msg to show up -->

<p style="margin-top: 0.5em">
  Selected ({selected.length}/2): {selected.join(', ') || 'none'}
</p>
```

When using CSS frameworks like Tailwind, you can customize the appearance of `<MultiSelect />` through these classes.

This simplified DOM structure of the component shows where these classes are inserted:

```svelte
<div class="multiselect {outer_div_class}">
  <ul class="selected {ul_selected_class}">
    <li class={li_selected_class}>Selected 1</li>
    <li class={li_selected_class}>Selected 2</li>
  </ul>

  <input class={input_class} />

  <span class="max-select-msg {max_select_msg_class}"></span>

  <ul class="options {ul_options_class}">
    <li class={li_option_class}>Option 1</li>
    <li class="{li_option_class} {li_active_option_class}">
      Option 2 (currently active)
    </li>
    ...
    <li class="{li_user_msg_class} {li_active_user_msg_class}">Create this option...</li>
  </ul>
</div>
```
