<script>
  // eslint-disable-next-line import/no-unassigned-import -- styles this route's KaTeX demo
  import 'katex/dist/katex.min.css'
</script>

## Extras

The small components that ship alongside the headline ones. Each is a named export from
the package root:

```svelte
<script>
  import { CircleSpinner, Icon, ThemeToggle, Toggle } from 'svelte-widgets'
</script>
```

### `Toggle`

A checkbox styled as a switch. `checked` is bindable and the children snippet receives it,
so the label can react to the state. Everything else spreads onto the wrapping `<label>`.

```svelte example id="toggle-demo"
<script lang="ts">
  import { Toggle } from '$lib'

  let [notifications, telemetry] = $state([true, false])
</script>

<div style="display: flex; flex-direction: column; gap: 8pt">
  <Toggle bind:checked={notifications} style="gap: 8pt">
    {#snippet children({ checked })}
      Notifications <em>({checked ? `on` : `off`})</em>
    {/snippet}
  </Toggle>

  <Toggle
    bind:checked={telemetry}
    style="gap: 8pt"
    --toggle-background="forestgreen"
    --toggle-knob-width="4em"
  >
    Telemetry (custom CSS vars)
  </Toggle>
</div>
```

### `ThemeToggle`

Cycles light → system → dark → light, writes the choice to `localStorage.theme`, and sets `colorScheme` plus `data-theme` on `<html>`. The button stays hidden until mounted so SSR cannot flash a stale icon, and mounted toggles synchronize changes across tabs. Headless consumers can install `listen_theme_storage()` directly; flash-free first paint still requires equivalent synchronous logic in the HTML shell because hydration is too late.

```svelte example id="theme-toggle-demo"
<script lang="ts">
  import { ThemeToggle } from '$lib'
</script>

<ThemeToggle
  style="font-size: 2em"
  tooltip={{ placement: `right` }}
  icon_props={{ style: `color: var(--accent)` }}
/>
```

### `Icon`

Renders one glyph from the bundled icon set at `1em` square, inheriting `currentColor`.
Pass the glyph value (`<Icon icon={Info} />`), not a name.

```svelte example id="icon-demo"
<script lang="ts">
  import { CopyButton, Icon } from '$lib'
  import * as icons from '$lib/icons'
  import type { IconData } from '$lib/icons'

  const catalog = Object.entries<IconData>(icons)
  let query = $state(``)
  let filtered_catalog = $derived(
    catalog.filter(([name]) => name.toLowerCase().includes(query.trim().toLowerCase())),
  )
</script>

<label style="display: grid; gap: 0.3em; max-width: 28em">
  Search {catalog.length} icons
  <input type="search" bind:value={query} placeholder="Try GitHub, arrow, file…" />
</label>

<p aria-live="polite">{filtered_catalog.length} matching icons</p>

<div
  style="display: grid; grid-template-columns: repeat(auto-fill, minmax(10em, 1fr)); gap: 0.6em"
>
  {#each filtered_catalog as [name, icon] (name)}
    <CopyButton
      content={`import { ${name} } from 'svelte-widgets/icons'`}
      title={`Copy ${name} import`}
      aria-label={`Copy ${name} import`}
      style="display: flex; align-items: center; gap: 0.5em; padding: 0.65em; border: 1px solid var(--sms-border, light-dark(lightgray, #555)); border-radius: 5px; background: var(--sms-options-bg, light-dark(white, #333)); color: inherit; cursor: pointer; text-align: left"
    >
      {#snippet children({ state })}
        <Icon {icon} style="font-size: 1.5em" />
        <code>{name}</code>
        <small
          style="margin-inline-start: auto"
          style:visibility={state === `ready` ? `hidden` : `visible`}
          >{state === `error` ? `Failed` : `Copied`}</small
        >
      {/snippet}
    </CopyButton>
  {:else}
    <p>No icons match “{query}”.</p>
  {/each}
</div>
```

### `CircleSpinner`

A dependency-free loading indicator. `size`, `color` and `duration` are plain CSS strings,
so any unit works.

```svelte example id="spinner-demo"
<script lang="ts">
  import { CircleSpinner } from '$lib'
</script>

<CircleSpinner />
<CircleSpinner size="2em" color="tomato" />
<CircleSpinner size="3em" color="mediumseagreen" duration="0.6s" />
```

### `FileDetails`

A list of collapsible `<details>`, one per file, with a button that opens or closes all of
them at once. Content is syntax-highlighted using `language` (or `default_lang`).

```svelte example id="file-details-demo"
<script lang="ts">
  import { FileDetails } from '$lib'

  const files = [
    {
      title: `+page.svelte`,
      content: `<script>\n  import { Toggle } from 'svelte-widgets'\n<\/script>\n\n<Toggle />`,
    },
    {
      title: `vite.config.ts`,
      content: `export default { plugins: [] }`,
      language: `ts`,
    },
  ]
</script>

<FileDetails {files} />
```

### `PrevNext`

Sequential navigation with wraparound. Pass `items` as hrefs or `[href, label]` tuples and
the `current` href; arrow keys navigate too unless you pass `onkeyup={null}`. The links at
the bottom of every demo page on this site are a `PrevNext` fed by the demo route list.

```svelte example id="prev-next-demo"
<script lang="ts">
  import { PrevNext } from '$lib'

  // relative hrefs so the links survive the docs site's base path
  const chapters = [
    [`toc`, `Toc`],
    [`masonry`, `Masonry`],
    [`popover`, `Popover`],
  ]
</script>

<PrevNext items={chapters} current="masonry" onkeyup={null} />
```

### `SubpageGrid`

A card grid for linking to child pages, built from `[title, href, description]` tuples.
The [MultiSelect overview](multiselect) is one.

```svelte
<SubpageGrid
  title="MultiSelect Overview"
  subtitle="Keyboard-friendly, accessible multi-select."
  subpages={[
    [`Form`, `/form`, `Form integration and native validation behavior.`],
    [`Events`, `/events`, `Event callbacks and payloads.`],
  ]}
/>
```

### `GitHubCorner`

The animated Octocat ribbon, `position: fixed` in a corner of the viewport. The one in the
top right of this page links to this repo.

```svelte
<GitHubCorner href="https://github.com/janosh/svelte-widgets" corner="top-right" />
```

Colors come from `--github-corner-bg` and `--github-corner-color`, or the `fill` and
`color` props for one-off overrides.

### `CodeExample`

The wrapper the [live-examples plugin](https://github.com/janosh/svelte-widgets/blob/-/src/lib/live-examples/readme.md)
mounts around every runnable code fence in these docs. Every "View code" button on this
site is one. Set it up once in `svelte.config.ts` rather than using it directly:

```ts
import { CodeExample } from 'svelte-widgets'

export default { Wrapper: CodeExample }
```

Fence metadata drives it: `collapsible` hides the source behind a button, `code_above`
puts the source before the rendered example, and `repl`/`github` add external links.

## Build-time helpers

### `katex_preprocess`

The docs site's `svelte.config.ts` wraps mdsvex with `katex_preprocess()`, turning inline
math such as $e^{i\pi} + 1 = 0$ and display math into static KaTeX markup:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

Import `katex/dist/katex.min.css` once in the app to style the generated markup.
