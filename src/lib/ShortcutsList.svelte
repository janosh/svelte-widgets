<!-- Collapsed <details> listing keyboard shortcuts as key/description rows, keys rendered with
  format_shortcut. The caller decides which shortcuts apply (e.g. per viewer or platform). -->
<script lang="ts">
  import type { HTMLDetailsAttributes } from 'svelte/elements'
  import { format_shortcut } from './shortcuts'
  import type { ShortcutEntry } from './types'

  let {
    shortcuts,
    summary = `Keyboard shortcuts`,
    open = $bindable(false),
    ...rest
  }: {
    shortcuts: readonly ShortcutEntry[] // rows in display order
    summary?: string // text of the always-visible <summary>
    open?: boolean // whether the list is expanded
  } & Omit<HTMLDetailsAttributes, `open` | `children`> = $props()

  const chords = (keys: ShortcutEntry[`keys`]): string[] =>
    [keys].flat().map((chord) => format_shortcut(chord).join(`+`))
</script>

<details {...rest} bind:open class={[`shortcuts-list`, rest.class]}>
  <summary style="cursor: pointer; opacity: 0.8">{summary}</summary>
  <dl>
    {#each shortcuts as { keys, label, keys_label }, idx (idx)}
      <dt style="text-align: right; white-space: nowrap">
        {#if keys_label}
          <kbd>{keys_label}</kbd>
        {:else}
          {#each chords(keys) as chord, chord_idx (chord_idx)}
            {#if chord_idx > 0}{` / `}{/if}
            <kbd>{chord}</kbd>
          {/each}
        {/if}
      </dt>
      <dd style="margin: 0">{label}</dd>
    {/each}
  </dl>
</details>

<style>
  .shortcuts-list {
    font-size: var(--shortcuts-list-font-size, 0.85em);
    margin: var(--shortcuts-list-margin, 6pt 0 0);
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--shortcuts-list-gap, 3pt 1em);
      margin: 4pt 0 0;
    }
    kbd {
      font-family: var(--shortcuts-list-kbd-font, monospace);
      padding: 0 3pt;
      border: 1px solid currentColor;
      border-radius: 3pt;
      opacity: 0.85;
    }
  }
</style>
