<script lang="ts">
  import { Icon } from '$lib'
  import { create_clipboard_feedback } from '$lib/clipboard.svelte'
  import * as icon_module from '$lib/icons'
  import type { IconData } from '$lib/icons/types'

  // The catalog is the one place a star import is right: every other call site should
  // import the single glyph it needs so the bundler can drop the rest.
  const catalog: [string, IconData][] = Object.entries(icon_module)
    .filter((entry): entry is [string, IconData] =>
      Boolean(entry[1] && typeof entry[1] === `object` && `viewBox` in entry[1]),
    )
    .toSorted(([left], [right]) => left.localeCompare(right))

  let query = $state(``)
  let size = $state(24)
  let copy_error = $state(``)
  // A clipboard write can be refused (unfocused document, denied permission); say so
  // rather than leaving a tile that silently never confirms.
  const { copied, copy } = create_clipboard_feedback(1200, (error, text) => {
    copy_error = `Could not copy “${text}”: ${error instanceof Error ? error.message : error}`
  })

  const needle = $derived(query.trim())
  const matches = $derived.by(() => {
    const lower = needle.toLowerCase()
    if (!lower) return catalog
    return catalog.filter(([name]) => name.toLowerCase().includes(lower))
  })

  const usage = `import { Icon } from 'svelte-widgets'
import { Download } from 'svelte-widgets/icons'

<Icon icon={Download} />`
</script>

<h2>Icons</h2>

<p>
  {catalog.length} glyphs, tree-shakeable one by one. Import the glyph itself rather than its
  name so a bundle only carries what it renders:
</p>

<pre><code>{usage}</code></pre>

<p>
  Size comes from <code>--icon-size</code>, colour from <code>currentColor</code>, so an
  icon inherits the text around it unless told otherwise. Click any glyph to copy its
  name.
</p>

<div class="controls">
  <input
    type="search"
    placeholder="Filter {catalog.length} icons by name…"
    bind:value={query}
    aria-label="Filter icons by name"
  />
  <label>
    size {size}px
    <input type="range" min="16" max="64" step="4" bind:value={size} />
  </label>
</div>

{#if copy_error}
  <p role="alert" style="font-size: 0.85em; color: var(--error-color, crimson)">
    {copy_error}
  </p>
{/if}

<!-- doubles as the empty state: "0 of 1126 match zzz" needs no extra message -->
<p class="count" role="status">
  {#if needle}
    {matches.length} of {catalog.length} match <code>{needle}</code>
  {:else}
    showing all {catalog.length}
  {/if}
</p>

<ul class="grid" style="--icon-size: {size}px">
  {#each matches as [name, icon] (name)}
    <li>
      <button type="button" onclick={() => void copy(name)} title="Copy “{name}”">
        <Icon {icon} />
        <span class="name">{copied.has(name) ? `copied!` : name}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .controls {
    display: flex;
    gap: 1em;
    align-items: center;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.6em 0;
    background: var(--bg);
    input[type='search'] {
      flex: 1 1 16em;
      padding: 0.4em 0.6em;
    }
    label {
      display: inline-flex;
      align-items: center;
      gap: 0.5em;
      font-size: 0.85em;
      white-space: nowrap;
    }
  }
  .count {
    font-size: 0.85em;
    opacity: 0.7;
    margin: 0 0 0.5em;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7em, 1fr));
    gap: 0.4em;
    /* 1000+ tiles: let the browser skip layout and paint for the ones off screen */
    li {
      content-visibility: auto;
      contain-intrinsic-size: auto 5em;
    }
    button {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4em;
      padding: 0.7em 0.3em;
      border: 1px solid transparent;
      border-radius: 5pt;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      &:hover,
      &:focus-visible {
        background: var(--surface);
        border-color: currentColor;
      }
    }
  }
  .name {
    font-size: 0.7rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
    opacity: 0.8;
  }
</style>
