<script lang="ts">
  // A purpose-named group of controls: an unframed <fieldset> headed by its legend, so a
  // panel of controls reads as a few labeled groups without boxes around each. Unlike
  // SettingsSection it has no reset or description chrome, and it never collapses like
  // SettingsGroup.
  import type { Snippet } from 'svelte'
  import type { HTMLFieldsetAttributes } from 'svelte/elements'

  let {
    legend,
    children,
    ...rest
  }: HTMLFieldsetAttributes & { legend: string; children: Snippet } = $props()
</script>

<fieldset {...rest} class={[`control-group`, rest.class]}>
  <legend>{legend}</legend>
  {@render children()}
</fieldset>

<style>
  fieldset {
    display: grid;
    align-content: start;
    gap: var(--control-group-gap, 1ex);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }
  legend {
    padding: 0 0 0.5ex;
    font-weight: 600;
  }
</style>
