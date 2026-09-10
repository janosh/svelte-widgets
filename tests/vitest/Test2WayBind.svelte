<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { Component } from 'svelte'

  import type { Test2WayBindProps } from './index'

  const Select = MultiSelect as Component<Test2WayBindProps>

  let {
    mode = `multiple`,
    value = $bindable(mode === `single` ? null : []),
    active_index = $bindable(null),
    active_option = $bindable(null),
    max_select = null,
    options = $bindable(),
    search_text = $bindable(``),
    breakpoint = $bindable(800),
    open = $bindable(false),
    onActiveIndexChanged,
    onActiveOptionChanged,
    onOptionsChanged,
    onSearchTextChanged,
    onValueChanged,
    ...rest
  }: Test2WayBindProps = $props()

  $effect.pre(() => {
    onActiveIndexChanged?.(active_index)
  })
  $effect.pre(() => {
    onActiveOptionChanged?.(active_option)
  })
  $effect.pre(() => {
    onOptionsChanged?.(options)
  })
  $effect.pre(() => {
    onSearchTextChanged?.(search_text)
  })
  $effect.pre(() => {
    onValueChanged?.(value)
  })
  export { breakpoint, max_select, search_text, value }
</script>

<Select
  {...rest}
  {mode}
  {max_select}
  bind:active_index
  bind:active_option
  bind:options
  bind:search_text
  bind:value
  bind:open
/>
