<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { Test2WayBindProps } from './index'

  let {
    active_index = null,
    active_option = null,
    max_select = $bindable(null),
    options = $bindable(),
    selected = $bindable(
      options
        ?.filter((opt) => opt instanceof Object && opt?.preselected)
        .slice(0, max_select ?? undefined) ?? [],
    ),
    search_text = $bindable(``),
    value = $bindable(null),
    breakpoint = $bindable(800),
    open = $bindable(false),
    onActiveIndexChanged,
    onActiveOptionChanged,
    onOptionsChanged,
    onSearchTextChanged,
    onSelectedChanged,
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
    onSelectedChanged?.(selected)
  })
  $effect.pre(() => {
    onValueChanged?.(value)
  })

  export { breakpoint, max_select, search_text, selected, value }
</script>

<MultiSelect
  bind:max_select
  bind:active_index
  bind:active_option
  bind:options
  bind:search_text
  bind:selected
  bind:value
  bind:open
  {...rest}
/>
