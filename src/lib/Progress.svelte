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
  // Validated while deriving, not in an $effect: the template assigns max/value first, and a
  // non-finite one makes the DOM throw a generic TypeError before any effect runs.
  const progress = $derived.by(() => {
    if (
      !Number.isFinite(max) ||
      max <= 0 ||
      (value !== undefined && !Number.isFinite(value))
    ) {
      throw new Error(
        `Progress requires finite value and positive max, got value=${value}, max=${max}`,
      )
    }
    return value === undefined ? undefined : Math.min(max, Math.max(0, value))
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
