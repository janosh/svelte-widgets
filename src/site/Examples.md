## 🚀 &thinsp; Getting Started

One live example per component. Each links to its full page.

### MultiSelect

Type to filter, click or arrow-key to pick. `selected` is bindable in both directions.
[MultiSelect docs &rarr;](multiselect)

```svelte example
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  const fruits: string[] = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry']
  let selected: string[] = $state([])
</script>

<MultiSelect id="fruits" bind:selected options={fruits} placeholder="Choose fruits..." />

<p>You selected: {JSON.stringify(selected)}</p>
```

### CommandMenu

A command palette with fuzzy search over your actions. `triggers` binds it to a modifier
chord, or drive `open` yourself. [CommandMenu docs &rarr;](command-menu)

```svelte example
<script lang="ts">
  import { CommandMenu } from 'svelte-widgets'

  let open = $state(false)
  let last_run = $state(``)
  const actions = [`Toggle theme`, `Copy link`, `Open settings`, `Sign out`].map(
    (label) => ({ label, action: () => (last_run = label) }),
  )
</script>

<button onclick={() => (open = true)}>Open command menu</button>
<CommandMenu {actions} bind:open triggers={[]} />

{#if last_run}<p>ran: <code>{last_run}</code></p>{/if}
```

### Popover

A floating surface that positions itself where it fits, traps Tab and closes on Escape or
an outside press. [Popover docs &rarr;](popover)

```svelte example
<script lang="ts">
  import { Popover } from 'svelte-widgets'
</script>

<Popover placement="bottom" align="start">
  {#snippet trigger(props)}
    <button {...props}>Open popover</button>
  {/snippet}
  <p style="margin: 0 0 6pt">Tab is trapped in here.</p>
  <label>Name <input placeholder="type something" /></label>
</Popover>
```

### ActionMenu

Shows the same action list from a button trigger or a right-click region. Takes the same
actions as `CommandMenu`. [ActionMenu docs &rarr;](popover#actionmenu)

```svelte example
<script lang="ts">
  import { ActionMenu } from 'svelte-widgets'

  let last_run = $state(``)
  const record = (label: string) => (last_run = label)
  const actions = [
    { label: `Cut`, shortcut: `mod+x`, action: record },
    { label: `Copy`, shortcut: `mod+c`, action: record },
    { label: `Paste`, shortcut: `mod+v`, action: record },
  ]
</script>

<ActionMenu {actions}>
  {#snippet trigger(props)}
    <button {...props}>Actions</button>
  {/snippet}
</ActionMenu>

<ActionMenu {actions}>
  <div
    style="display: grid; place-items: center; height: 6em; border: 1px dashed gray; border-radius: 5pt"
  >
    Right-click me
  </div>
</ActionMenu>

{#if last_run}<p>ran: <code>{last_run}</code></p>{/if}
```

### Nav

A navigation bar with dropdowns, active-route styling and a mobile burger menu.
[Nav docs &rarr;](nav)

```svelte example
<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { Nav } from 'svelte-widgets'

  const resolve_path = resolve as (path: string) => string
  // real routes so the prerender crawl doesn't trip over dead links
  const routes = [`/`, `/multiselect`, `/popover`, `/toc`].map(resolve_path)
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav {routes} {page} {link_props} />
```

### Toc

Finds the headings itself, watches for late-rendered ones and tracks which is in view. The
one on the right of this page is a `Toc`. [Toc docs &rarr;](toc)

```svelte example
<script lang="ts">
  import { Toc } from 'svelte-widgets'
</script>

<div class="toc-demo" style="display: flex; gap: 2em">
  <article style="flex: 1">
    <h3 id="toc-demo-getting-started">Getting started</h3>
    <p>Scoped with <code>headingSelector</code> so it ignores the rest of the page.</p>
    <h3>Configuration</h3>
    <p>Pass <code>collapseSubheadings</code> to fold levels under their parent.</p>
    <h3>Troubleshooting</h3>
    <p>Set <code>warnOnEmpty</code> to hear about a selector that matches nothing.</p>
  </article>

  <Toc
    headingSelector=".toc-demo h3"
    breakpoint={0}
    title="On this page"
    style="position: static; width: 12em"
  />
</div>
```

### Masonry

Balances items across as many columns as the container fits, measuring each one so uneven
heights pack tightly. [Masonry docs &rarr;](masonry)

```svelte example
<script lang="ts">
  import { Masonry } from 'svelte-widgets'

  // deterministic pseudo-random heights so the packing is visible but stable
  const items = Array.from({ length: 9 }, (_, idx) => ({
    id: idx,
    height: 40 + ((idx * 37) % 90),
  }))
</script>

<Masonry {items} minColWidth={120} gap={10}>
  {#snippet children({ item })}
    <div
      style="height: {item.height}px; display: grid; place-items: center; border-radius: 4pt; background: var(--surface)"
    >
      {item.id + 1}
    </div>
  {/snippet}
</Masonry>
```

### CopyButton

Copies its `content` and cycles through success and error states. Every code block on this site has one. [CopyButton docs &rarr;](action-button#copybutton)

```svelte example
<script lang="ts">
  import { CopyButton } from 'svelte-widgets'
</script>

<CopyButton content="npm install -D svelte-widgets" />
```

### The rest

`ThemeToggle`, `Toggle`, `Icon`, `CircleSpinner`, `FileDetails`, `PrevNext`,
`SubpageGrid`, `GitHubCorner` and `CodeExample` are demoed together on the
[extras page](extras), and the ten attachments have
[their own page](attachments).
