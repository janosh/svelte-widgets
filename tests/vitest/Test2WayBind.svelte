<script lang="ts">
  import { MultiSelect } from '#lib'
  import type { MultiSelectProps } from '#lib/types.ts'
  import type { Component } from 'svelte'

  import type { Test2WayBindProps } from './index'

  // Independent mutable bindings lose mode/value narrowing inside this fixture only;
  // callers still supply the full discriminated Test2WayBindProps union.
  const Select = MultiSelect as Component<Pick<MultiSelectProps, keyof MultiSelectProps>>

  let {
    mode = `multiple`,
    value = $bindable(mode === `single` ? null : []),
    search_text = $bindable(``),
    onValueChanged,
    ...rest
  }: Test2WayBindProps = $props()

  $effect.pre(() => {
    onValueChanged?.(value)
  })
  export { search_text, value }
</script>

<Select {...rest} {mode} bind:search_text bind:value />
