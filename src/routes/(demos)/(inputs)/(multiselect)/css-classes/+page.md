## Inner Element Props

```svelte example id="foods"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  const options: string[] = [...Array(7).keys()].map((idx) => `Option ${idx + 1}`)
  let selected: string[] = $state(options.slice(0, 2))
</script>

<MultiSelect
  {options}
  class="wrapper"
  ul_selected_props={{ class: `user-choices` }}
  ul_options_props={{ class: `dropdown` }}
  li_option_props={{ class: `selectable-li` }}
  input_props={{ class: `search-text-input` }}
  li_selected_props={{ class: `selected-li`, style: `font-weight: 500` }}
  li_user_msg_props={{ class: `selectable-msg-li` }}
  max_select_msg_props={{ class: `user-hint-max-selected-reached` }}
  placeholder="Which foods do you like?"
  bind:value={selected}
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

Each inner element takes an `*_props` object of HTML attributes (`class`, `style`, `data-*`, `title`, ...), handy for CSS frameworks like Tailwind. `class` merges with the component's own classes (e.g. `active` on the hovered or arrow-keyed option), and `li_option_props.style` / `li_selected_props.style` merge after each option's own `style` field. Event handlers are not accepted: the component's own listeners own those elements.

This simplified DOM structure of the component shows where these props land:

```svelte
<div class="multiselect {class}">
  <ul {...ul_selected_props} class="selected {ul_selected_props.class}">
    <li {...li_selected_props}>Selected 1</li>
    <li {...li_selected_props}>Selected 2</li>
  </ul>

  <input {...input_props} />

  <span {...max_select_msg_props} class="max-select-msg {max_select_msg_props.class}"></span>

  <ul {...ul_options_props} class="options {ul_options_props.class}">
    <li {...li_select_all_props} class="select-all {li_select_all_props.class}">Select all</li>
    <li {...li_group_header_props} class="group-header {li_group_header_props.class}">Group</li>
    <li {...li_option_props}>Option 1</li>
    <li {...li_option_props} class="{li_option_props.class} active">
      Option 2 (currently active)
    </li>
    ...
    <li {...li_user_msg_props} class="user-msg {li_user_msg_props.class} active">
      Create this option...
    </li>
  </ul>
</div>
```
