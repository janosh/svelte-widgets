<script lang="ts">
  import ColorInput from '$lib/ColorInput.svelte'
  import { untrack, type ComponentProps } from 'svelte'

  let {
    initial_value,
    ...rest
  }: Omit<ComponentProps<typeof ColorInput>, `value`> & {
    initial_value: string
  } = $props()
  let value = $state(untrack(() => initial_value))
  export const read_value = (): string => value
  export const write_value = (next: string): void => {
    value = next
  }
</script>

<ColorInput {...rest} bind:value />
<output>{value}</output>
