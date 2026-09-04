<script lang="ts">
  import type { HTMLProgressAttributes } from 'svelte/elements'

  let {
    value,
    max = 100,
    label = `Progress`,
    ...rest
  }: Omit<HTMLProgressAttributes, `value` | `max`> & {
    value?: number
    max?: number
    label?: string
  } = $props()
  const progress = $derived(
    value === undefined ? undefined : Math.min(max, Math.max(0, value)),
  )
  $effect(() => {
    if (
      !Number.isFinite(max) ||
      max <= 0 ||
      (value !== undefined && !Number.isFinite(value))
    ) {
      throw new Error(
        `Progress requires finite value and positive max, got value=${value}, max=${max}`,
      )
    }
  })
</script>

<progress {...rest} aria-label={rest['aria-label'] ?? label} {max} value={progress}
></progress>

<style>
  progress {
    width: 100%;
    accent-color: var(--accent-color, #4e79a7);
  }
</style>
