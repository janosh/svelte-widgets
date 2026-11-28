## Fullscreen

`FullscreenButton` and the headless `sync_fullscreen` keep a bindable `fullscreen` flag and the browser's fullscreen state in agreement. The flag is the single source of truth: clicking the button, setting the flag and pressing <kbd>Esc</kbd> all end in the same state.

The sync is **keyed to one wrapper element**: sending one of two viewers fullscreen leaves the other's flag alone. A flag read off `document.fullscreenElement` alone would flip on every viewer, and each flipped flag would fire its own `requestFullscreen`.

A fullscreened element inherits nothing from the page and would otherwise render on black, so entering fullscreen also paints the page background onto a CSS variable (`--fullscreen-bg` by default, renameable via `bg_css_var`).

### Two independent wrappers

Send one panel fullscreen; the other's flag stays `false`.

```svelte example id="fullscreen-isolation"
<script lang="ts">
  import FullscreenButton from 'svelte-widgets/FullscreenButton.svelte'

  let left_wrapper = $state<HTMLElement | undefined>(undefined)
  let right_wrapper = $state<HTMLElement | undefined>(undefined)
  let [left_fullscreen, right_fullscreen] = $state([false, false])
</script>

<div style="display: flex; gap: 1em; flex-wrap: wrap">
  <section bind:this={left_wrapper} class="panel">
    <header>
      <strong>Left panel</strong>
      <FullscreenButton wrapper={left_wrapper} bind:fullscreen={left_fullscreen} />
    </header>
    <p>left_fullscreen = <code>{left_fullscreen}</code></p>
  </section>

  <section bind:this={right_wrapper} class="panel">
    <header>
      <strong>Right panel</strong>
      <FullscreenButton wrapper={right_wrapper} bind:fullscreen={right_fullscreen} />
    </header>
    <p>right_fullscreen = <code>{right_fullscreen}</code></p>
  </section>
</div>

<style>
  .panel {
    flex: 1 1 14em;
    padding: 6pt 9pt;
    border: 1px solid color-mix(in srgb, currentcolor 20%, transparent);
    border-radius: 4pt;
  }
  .panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
  }
  /* the CSS var the button paints on the way in */
  .panel:fullscreen {
    background: var(--fullscreen-bg);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
</style>
```

### Driving the flag from elsewhere

`bind:fullscreen` is two-way, so a checkbox, a hotkey or a `$effect` can enter and leave fullscreen without touching the button. Omit `wrapper` and the button becomes a plain toggle for the flag, for consumers that call the Fullscreen API themselves (`on_change` then stays silent: there is no wrapper to transition). A request the browser rejects flips the flag back, so it always ends up matching the browser.

`hotkey="F"` adds a plain-key shortcut: it toggles fullscreen while the pointer is over `wrapper` or focus is inside it (so of several viewers only the hovered one reacts), names the key in the button's `title` and `aria-keyshortcuts`, and flashes the button. Chords such as <kbd>Cmd/Ctrl</kbd>+<kbd>F</kbd> stay the browser's, typing in a field is left alone, a hidden button takes no key, and a wrapper nested inside another with the same hotkey leaves the key to the outer one unless the inner one is in fullscreen. A chord or several keys throw, since the key would never fire.

```svelte example id="fullscreen-bound"
<script lang="ts">
  import FullscreenButton from 'svelte-widgets/FullscreenButton.svelte'

  let wrapper = $state<HTMLElement | undefined>(undefined)
  let fullscreen = $state(false)
  let events = $state<string[]>([])
</script>

<div
  bind:this={wrapper}
  style="padding: 9pt; border: 1px solid color-mix(in srgb, currentcolor 20%, transparent); border-radius: 4pt"
>
  <p style="display: flex; gap: 1em; align-items: center; margin: 0 0 6pt">
    <FullscreenButton
      {wrapper}
      bind:fullscreen
      bg_css_var="--demo-bg"
      on_change={(next) => (events = [`on_change: ${next}`, ...events].slice(0, 4))}
      on_request_error={(error) => (events = [`error: ${error}`, ...events])}
    />
    <label>
      <input type="checkbox" bind:checked={fullscreen} />
      fullscreen
    </label>
  </p>
  <p style="margin: 0">
    <code>on_change</code> fires once per real fullscreen transition — button, checkbox or
    <kbd>Esc</kbd> alike — and never for a request the browser rejects.
  </p>
  {#if events.length}
    <ul style="margin: 6pt 0 0; padding-left: 1.25em">
      {#each events as event, idx (idx)}<li><code>{event}</code></li>{/each}
    </ul>
  {/if}
</div>

<style>
  div:fullscreen {
    background: var(--demo-bg);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
</style>
```

### `sync_fullscreen`

The button is a thin wrapper over `sync_fullscreen` (from `svelte-widgets/browser`), which any component can call during init for the same two-way sync without the button:

```ts
sync_fullscreen({
  get_wrapper: () => wrapper,
  get_fullscreen: () => fullscreen,
  set_fullscreen: (next) => (fullscreen = next),
  get_bg_css_var: () => `--viewer-bg`,
})
```

The wrapper's background comes from `get_bg_color(document.body)` (from `svelte-widgets/attachments`): the first opaque background among `body` and `html`, else the browser's page canvas, which is dark under a dark root `color-scheme`.
