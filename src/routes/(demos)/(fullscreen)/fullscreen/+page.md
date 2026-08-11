## Fullscreen

`FullscreenButton` and the headless `sync_fullscreen` keep a bindable `fullscreen` flag and
the browser's fullscreen state in agreement. The flag is the single source of truth: click
the button, flip the flag yourself, or press <kbd>Esc</kbd> — all three end up in the same
place.

The important part is that the sync is **keyed to one wrapper element**. Two viewers on a
page each own their own flag, so sending one fullscreen leaves the other's flag alone. Read
the flag off `document.fullscreenElement` alone and you get the opposite: every flag flips,
and every flipped flag fires its own `requestFullscreen`.

A fullscreened element inherits nothing from the page and would otherwise render on black,
so entering fullscreen also paints the page background onto a CSS variable
(`--fullscreen-bg` by default, renameable via `bg_css_var`).

### Two independent wrappers

Send one panel fullscreen and watch the other panel's flag stay `false`.

```svelte example id="fullscreen-isolation"
<script lang="ts">
  import FullscreenButton from '$lib/FullscreenButton.svelte'

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

`bind:fullscreen` is two-way, so a checkbox, a hotkey or a `$effect` can enter and leave
fullscreen without touching the button. Omit `wrapper` and the button becomes a plain
toggle for the flag, for consumers that call the Fullscreen API themselves.

```svelte example id="fullscreen-bound"
<script lang="ts">
  import FullscreenButton from '$lib/FullscreenButton.svelte'

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
    <code>on_change</code> only fires when the browser moves the flag — pressing
    <kbd>Esc</kbd> counts, clicking the button does not.
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

The button is a thin wrapper over `sync_fullscreen`, which any component can call during
init to get the same two-way sync without the button's markup:

```ts
sync_fullscreen({
  get_wrapper: () => wrapper,
  get_fullscreen: () => fullscreen,
  set_fullscreen: (next) => (fullscreen = next),
  get_bg_css_var: () => `--viewer-bg`,
})
```

`get_page_background()` is exported alongside it. It returns the first opaque background
among `body` and `html`, falling back to `prefers-color-scheme`.
