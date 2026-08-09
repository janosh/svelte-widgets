<script lang="ts">
  // Collapsible grouping one level above SettingsSection.
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { ChevronRight } from './icons'

  let {
    title,
    open = $bindable(false),
    subtitle,
    children,
    ...rest
  }: HTMLAttributes<HTMLDetailsElement> & {
    title: string
    open?: boolean
    // Short right-aligned hint, e.g. a count or the active mode, readable while collapsed
    subtitle?: string
    children: Snippet
  } = $props()
</script>

<details {...rest} class={[`settings-group`, rest.class]} bind:open>
  <summary>
    <Icon icon={ChevronRight} aria-hidden="true" style="width: 0.85em; height: 0.85em" />
    <span class="group-title">{title}</span>
    {#if subtitle}<span class="group-subtitle">{subtitle}</span>{/if}
  </summary>
  <div class="group-body">{@render children()}</div>
</details>

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
  .group-body {
    display: grid;
    gap: 3pt;
    padding: 2pt 0 8pt 2pt;
  }
</style>
