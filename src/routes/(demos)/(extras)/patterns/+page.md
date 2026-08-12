## Tabs

`Tabs` keeps selection bindable and supports automatic or manual keyboard activation. It intentionally ships no visual chrome; style `.tabs-list`, `.tabs-tab`, `.tabs-panel` and their `data-state` attributes.

```svelte example id="patterns-tabs"
<script lang="ts">
  import { Tabs } from '$lib'

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

`Accordion` uses real heading buttons and regions. Set `multiple` to bind an array of open values, or set `collapsible={false}` in single mode to keep the open item from closing itself. It is also headless: `.accordion-item`, `.accordion-trigger`, `.accordion-panel` and `data-state` are the styling hooks.

```svelte example id="patterns-accordion"
<script lang="ts">
  import { Accordion } from '$lib'

  const items = [
    { value: `install`, label: `Installation` },
    { value: `usage`, label: `Usage` },
    { value: `disabled`, label: `Unavailable`, disabled: true },
  ] as const
  let value = $state<string[]>([`install`])
</script>

<Accordion {items} multiple bind:value>
  {#snippet panel({ item })}
    <p>Content for {item.label}.</p>
  {/snippet}
</Accordion>
```

## FindBar

`FindBar` is an in-DOM find-in-page bar over `search_text`: it highlights every match under `root`, counts them, and walks them with Enter / Shift+Enter. Matches wear a CSS Custom Highlight, which is document-global and so cannot be styled from inside the component — add your own `::highlight(find-match)` rule. Where the chrome does not fit, `create_find_state` from `svelte-widgets/find-in-page` gives you the same cursor with no markup.

Because this example renders the bar inside `root`, `also_ignore=".find-bar"` keeps its status text and controls out of the searchable section content.

```svelte example id="patterns-find-bar"
<script lang="ts">
  import { FindBar } from '$lib'

  let root = $state<HTMLElement>()
  let open = $state(true)
</script>

<div bind:this={root} style="position: relative; padding-top: 3rem">
  {#if open}
    <FindBar
      {root}
      label="section"
      also_ignore=".find-bar"
      on_close={() => (open = false)}
    />
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

`Dialog` is a centered native modal with bindable state and surface, composable trigger/header/footer snippets, focus restoration and nested-dialog stacking. `on_close` reports `pointer`, `escape` or `close` for dismissals started inside the dialog; it does not fire when you set the bound `open` state to `false` yourself. Turn off `close_on_backdrop` or `close_on_escape` when dismissal would lose work. Keep nested dialogs and other overlays inside its content so the browser's modal top layer can make only the innermost one interactive.

```svelte example id="patterns-dialog"
<script lang="ts">
  import { Dialog } from '$lib'

  let open = $state(false)
  let nested_open = $state(false)
  let last_close = $state(`none`)
</script>

<Dialog
  bind:open
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
  <Dialog bind:open={nested_open} aria-label="Advanced profile settings">
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

`Sheet` uses a native modal `<dialog>`, dismisses from its backdrop or Escape and returns focus to its trigger. Keep overlays inside its dialog; portalling them to `body` moves them outside the modal subtree and makes them inert.

```svelte example id="patterns-sheet"
<script lang="ts">
  import { Sheet } from '$lib'

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
