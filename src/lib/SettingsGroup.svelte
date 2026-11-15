<script lang="ts">
  // Grouping one level above SettingsSection: a collapsible <details> by default, or with
  // collapsible={false} an always-open, unframed group of controls. Either way the controls
  // sit in a <fieldset> named by the title, so `disabled` turns off the whole group.
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { ChevronRight } from './icons'

  let {
    title,
    open = $bindable(false),
    collapsible = true,
    disabled = false,
    subtitle,
    children,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    title: string
    open?: boolean // collapsible groups only
    collapsible?: boolean
    disabled?: boolean
    // Short right-aligned hint, e.g. a count or the active mode, readable while collapsed
    subtitle?: string
    children: Snippet
  } = $props()

  const title_id = $props.id()
</script>

{#snippet heading()}
  <span class="group-title" id={title_id}>{title}</span>{#if subtitle}<span
      class="group-subtitle">{subtitle}</span
    >{/if}
{/snippet}

{#if collapsible}
  <details {...rest} class={[`settings-group`, rest.class]} bind:open>
    <summary>
      <Icon icon={ChevronRight} style="width: 0.85em; height: 0.85em" />
      {@render heading()}
    </summary>
    <fieldset class="group-body" {disabled} aria-labelledby={title_id}>
      {@render children()}
    </fieldset>
  </details>
{:else}
  <fieldset {...rest} class={[`settings-group`, `static`, rest.class]} {disabled}>
    <legend>{@render heading()}</legend>
    {@render children()}
  </fieldset>
{/if}

<style>
  .settings-group {
    border-top: 1px solid
      var(--settings-group-border, color-mix(in srgb, currentColor 12%, transparent));
  }
  .settings-group:first-of-type {
    border-top: none;
  }
  summary {
    display: flex;
    align-items: center;
    gap: 5pt;
    padding: 5pt 2pt;
    cursor: pointer;
    user-select: none;
    border-radius: var(--border-radius, 3pt);
    list-style: none;
    &::-webkit-details-marker {
      display: none;
    }
    &:hover {
      background: color-mix(in srgb, currentColor 7%, transparent);
    }
    /* the chevron is the only rotating part, so transition it rather than the whole row */
    :global(svg) {
      flex: none;
      opacity: 0.6;
      transition: transform 0.15s ease;
    }
  }
  .settings-group[open] > summary :global(svg) {
    transform: rotate(90deg);
  }
  .group-title {
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    font-size: 0.85em;
  }
  .group-subtitle {
    margin-left: auto;
    font-size: 0.8em;
    opacity: 0.55;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group-body,
  .static {
    display: grid;
    align-content: start;
    gap: 3pt;
    min-width: 0;
    margin: 0;
    padding: 2pt 0 8pt 2pt;
    border: none;
  }
  legend {
    display: flex;
    width: 100%;
    padding: 0 0 3pt;
  }
</style>
