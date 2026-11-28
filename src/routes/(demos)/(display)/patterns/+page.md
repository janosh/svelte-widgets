## Tabs

`Tabs` binds the selected `value` and supports `automatic` or `manual` keyboard `activation`. It ships no visual chrome: style `.tabs-list`, `.tabs-tab`, `.tabs-panel` and their `data-state` attributes.

```svelte example id="patterns-tabs"
<script lang="ts">
  import { Tabs } from 'svelte-widgets'

  const items = [
    { value: `overview`, label: `Overview` },
    { value: `api`, label: `API` },
    { value: `disabled`, label: `Disabled`, disabled: true },
  ] as const
  let value = $state<(typeof items)[number][`value`]>(`overview`)
</script>

<Tabs {items} bind:value activation="manual" label="Package sections">
  {#snippet panel({ item })}
    <p>{item.label} panel. Current value: <code>{value}</code>.</p>
  {/snippet}
</Tabs>
```

## Accordion

`Accordion` uses real heading buttons and regions. `mode="multiple"` binds an array of open values; in single mode `collapsible={false}` keeps the open item from closing itself. It is also headless: `.accordion-item`, `.accordion-trigger`, `.accordion-panel` and `data-state` are the styling hooks.

```svelte example id="patterns-accordion"
<script lang="ts">
  import { Accordion } from 'svelte-widgets'

  const items = [
    { value: `install`, label: `Installation` },
    { value: `usage`, label: `Usage` },
    { value: `disabled`, label: `Unavailable`, disabled: true },
  ] as const
  let value = $state<string[]>([`install`])
</script>

<Accordion {items} mode="multiple" bind:value>
  {#snippet panel({ item })}
    <p>Content for {item.label}.</p>
  {/snippet}
</Accordion>
```

## FindBar

`FindBar` is an in-DOM find-in-page bar over `search_text`: it highlights every match under `root`, counts them, and walks them with Enter / Shift+Enter. Escape closes it, and `on_close` receives `{ via: 'close' | 'escape' }`. Matches wear a CSS Custom Highlight, which is document-global and can't be styled from inside the component, so add your own `::highlight(find-match)` rule. For custom chrome, `create_find_state` from `svelte-widgets/find-in-page` gives the same cursor with no markup.

The bar can sit inside `root`, as here: its own status text and controls are never searched.

```svelte example id="patterns-find-bar"
<script lang="ts">
  import { FindBar } from 'svelte-widgets'

  let root = $state<HTMLElement>()
  let open = $state(true)
</script>

<div bind:this={root} style="position: relative; padding-top: 3rem">
  {#if open}
    <FindBar {root} label="section" on_close={() => (open = false)} />
  {:else}
    <button onclick={() => (open = true)}>Find in section</button>
  {/if}
  <p>
    Ordered subsequence matching, whitespace collapsing and cross-node matches all come
    from <code>search_text</code>, so a query can straddle inline markup.
  </p>
  <details>
    <summary>Collapsed sections open on a jump</summary>
    <p>Just like the browser's own find-in-page.</p>
  </details>
</div>

<style>
  :global(::highlight(find-match)) {
    background: rgba(110, 168, 255, 0.35);
  }
</style>
```

## Dialog

`Dialog` is a centered native modal with bindable state and surface, composable trigger/header/footer snippets, focus restoration and nested-dialog stacking. `on_open` reports `{ via }` of `trigger` or `programmatic`, and `on_close` one of `pointer`, `escape`, `close` or `programmatic` (setting the bound `open` yourself); each change fires once and mounting reports nothing. Use `closedby="any"` (the default) for backdrop and Escape dismissal, `closedby="closerequest"` for Escape only, or `closedby="none"` to require an explicit close action. Keep nested dialogs and other overlays inside its content so the browser's modal top layer can make only the innermost one interactive.

```svelte example id="patterns-dialog"
<script lang="ts">
  import { Dialog, type DialogProps } from 'svelte-widgets'

  let open = $state(false)
  let last_close = $state(`none`)
  let closedby = $state<DialogProps[`closedby`]>(`any`)
</script>

<label
  >Dismissal policy
  <select bind:value={closedby}>
    <option value="any">Backdrop and Escape</option>
    <option value="closerequest">Escape only</option>
    <option value="none">Explicit close only</option>
  </select>
</label>
<Dialog
  bind:open
  {closedby}
  aria-labelledby="profile-dialog-title"
  on_close={({ via }) => (last_close = via)}
>
  {#snippet trigger(props)}
    <button {...props}>Edit profile</button>
  {/snippet}
  {#snippet header({ close })}
    <h2 id="profile-dialog-title" style="margin: 0">Edit profile</h2>
    <button onclick={close}>Close</button>
  {/snippet}
  <label>Display name <input value="Ada" /></label>
  <Dialog aria-label="Advanced profile settings">
    {#snippet trigger(props)}
      <button {...props}>Advanced</button>
    {/snippet}
    Nested modal content
  </Dialog>
  {#snippet footer({ close })}
    <button onclick={close}>Save</button>
  {/snippet}
</Dialog>

<p>Last close: <code>{last_close}</code></p>
```

## Sheet

`Sheet` composes `Dialog` as a side-positioned variant, so it shares the same snippets, close policies, `on_open`/`on_close` callbacks, focus restoration and nested-modal behavior. Keep overlays inside its dialog; portalling them to `body` moves them outside the modal subtree and makes them inert.

```svelte example id="patterns-sheet"
<script lang="ts">
  import { Sheet } from 'svelte-widgets'

  let open = $state(false)
</script>

<Sheet bind:open side="right" aria-label="Settings">
  {#snippet trigger(props)}
    <button {...props}>Open settings</button>
  {/snippet}
  {#snippet header({ close })}
    <strong>Settings</strong>
    <button onclick={close}>Close</button>
  {/snippet}
  <label>Project name <input value="Svelte Widgets" /></label>
  {#snippet footer({ close })}
    <button onclick={close}>Done</button>
  {/snippet}
</Sheet>
```
