<script>
  // eslint-disable-next-line import/no-unassigned-import -- styles this route's math demo
  import 'temml/dist/Temml-Local.css'
</script>

## Extras

The small components that ship alongside the headline ones. Each is a named export from
the package root:

```svelte
<script>
  import { Icon, Spinner, ThemeToggle, Toggle } from 'svelte-widgets'
</script>
```

### `Toggle`

A checkbox styled as a switch. `checked` is bindable and the children snippet receives it, so the label can react to the state. Everything else spreads onto the wrapping `<label>`.

```svelte example id="toggle-demo"
<script lang="ts">
  import { Toggle } from 'svelte-widgets'

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

Cycles light → system → dark → light, writes the choice to `localStorage.theme`, and sets `colorScheme` plus `data-theme` on `<html>`. The button stays hidden until mounted so SSR cannot flash a stale icon, and mounted toggles synchronize changes across tabs. Headless consumers can call `watch_theme()` to initialize the theme and follow both system preference and cross-tab changes, then call its returned cleanup function on teardown; flash-free first paint still requires equivalent [synchronous logic in the HTML shell](https://github.com/janosh/svelte-widgets/blob/main/src/app.html#L16) because hydration is too late.

```svelte example id="theme-toggle-demo"
<script lang="ts">
  import { ThemeToggle } from 'svelte-widgets'
</script>

<ThemeToggle
  style="font-size: 2em"
  tooltip={{ placement: `right` }}
  icon_props={{ style: `color: var(--accent)` }}
/>
```

### `Icon`

Renders one glyph from the bundled icon set at `1em` square, inheriting `currentColor`. Pass the glyph value (`<Icon icon={Info} />`), not a name.

```svelte example id="icon-demo"
<script lang="ts">
  import { CopyButton, Icon } from 'svelte-widgets'
  import * as icons from 'svelte-widgets/icons'
  import type { IconData } from 'svelte-widgets/icons'

  // Vite's dev SSR namespace keeps export order but browsers sort ESM namespace keys, so sort
  // explicitly or server and client render different icons at each position
  const catalog = Object.entries<IconData>(icons).toSorted(([name_a], [name_b]) =>
    name_a < name_b ? -1 : 1,
  )
  // zero-width spaces let long CamelCase names wrap between words instead of mid-word
  const wrappable = (name: string) => name.replace(/(?<=[a-z\d])(?=[A-Z])/g, `​`)
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
  style="display: grid; grid-template-columns: repeat(auto-fill, minmax(12em, 1fr)); gap: 0.6em; --card-bg: var(--sms-options-bg, light-dark(white, #333))"
>
  {#each filtered_catalog as [name, icon] (name)}
    <CopyButton
      content={`import { ${name} } from 'svelte-widgets/icons'`}
      title={`Copy ${name} import`}
      aria-label={`Copy ${name} import`}
      style="position: relative; display: grid; padding: 0.65em; width: 100%; white-space: normal; border: 1px solid var(--sms-border, light-dark(lightgray, #555)); border-radius: 5px; background: var(--card-bg); color: inherit; cursor: pointer"
    >
      {#snippet children({ state })}
        <Icon {icon} style="font-size: 1.5em; flex: none" />
        <code style="line-height: 1.3">{wrappable(name)}</code>
        <small
          style="position: absolute; inset: 0; display: grid; place-items: center; background: var(--card-bg)"
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

### `Spinner`

A dependency-free loading indicator. `size`, `color` and `duration` are plain CSS strings, so any unit works; unset ones fall back to `--spinner-size`, `--spinner-color` and `--spinner-duration`. It is a polite status region named by `text` (or `Loading`); pass `status={false}` when the surrounding control announces its own busy state.

```svelte example id="spinner-demo"
<script lang="ts">
  import { Spinner } from 'svelte-widgets'
</script>

<Spinner />
<Spinner size="2em" color="tomato" />
<Spinner size="3em" color="mediumseagreen" duration="0.6s" text="Loading data" />
```

### `FileDetails`

A list of collapsible `<details>`, one per file, with a button that opens or closes all of them at once. Code is plain by default. Pass a `highlight(code, language, signal)` callback to color it; the example uses `default_highlighter` from `svelte-widgets/highlight`, which requires the optional peer `@wooorm/starry-night`. Highlighter failures appear alongside the source. Titles are plain text; use `title_snippet({ title, idx, content, language })` for rich rendering. The `files` array is read-only input; DOM references stay internal.

```svelte example id="file-details-demo"
<script lang="ts">
  import { FileDetails } from 'svelte-widgets'
  import { default_highlighter } from 'svelte-widgets/highlight'

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

<FileDetails {files} highlight={default_highlighter.highlight} />
```

### `Tag`

An inline pill for categories, statuses, filters and counts. It is a static `<span>` by default, a link with `href` and a button with `onclick`. `active` fills it like `solid`; on a button it also sets `aria-pressed`, making a toggle. `on_remove` adds a remove button named after the tag's content, whether `label` or `children`. `variant` is `soft` (tint, default), `solid` (fill) or `outline`; on a fill the text color is picked for contrast from the painted background, so `color` takes any CSS color including `var()`. `icon` leads, `count` trails, and a `children` snippet replaces the `label` text. `class` and `style` land on the pill, other attributes on its link, button or label. For text overlaid on a plot or image, use [`GlassChip`](workbench#layout-primitives) instead.

```svelte example id="tag-demo"
<script lang="ts">
  import { Tag } from 'svelte-widgets'
  import { Star, Tag as TagIcon } from 'svelte-widgets/icons'

  const topics = [`svelte`, `typescript`, `css`, `a11y`]
  let selected = $state<string[]>([`svelte`])
  let filters = $state([`open source`, `stars > 100`, `updated this year`])
</script>

<div style="display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center">
  <Tag label="soft" />
  <Tag label="solid" variant="solid" color="#1769aa" />
  <Tag label="solid light" variant="solid" color="gold" />
  <Tag label="outline" variant="outline" color="seagreen" />
  <Tag label="stars" icon={Star} count={1234} --tag-font-size="0.7em" />
  <Tag label="docs link" href="extras#tag" icon={TagIcon} --tag-font-size="1em" />
  <Tag label="disabled" onclick={() => {}} disabled />
</div>

<p>Toggle tags filter by topic:</p>
<div role="group" aria-label="Topics" style="display: flex; flex-wrap: wrap; gap: 0.5em">
  {#each topics as topic (topic)}
    {@const active = selected.includes(topic)}
    <Tag
      label={topic}
      {active}
      onclick={() =>
        (selected = active
          ? selected.filter((other) => other !== topic)
          : [...selected, topic])}
    />
  {/each}
</div>
<p>Selected: {selected.join(`, `) || `none`}</p>

<p>Removable filter chips:</p>
<ul style="display: flex; flex-wrap: wrap; gap: 0.5em; list-style: none; padding: 0">
  {#each filters as filter (filter)}
    <li>
      <Tag
        label={filter}
        variant="outline"
        on_remove={() => (filters = filters.filter((other) => other !== filter))}
      />
    </li>
  {:else}
    <li>
      <button onclick={() => (filters = [`open source`, `stars > 100`])}
        >Reset filters</button
      >
    </li>
  {/each}
</ul>
```

Style it with `--tag-color` (the fill/tint/border), `--tag-bg`, `--tag-active-bg`, `--tag-text-color`, `--tag-border-radius`, `--tag-padding`, `--tag-font-size` and friends; the full list is on the [theming page](theming).

### `InfoTag`

A [`Tag`](#tag) for a property: `label` reads as a caption and `value` is emphasized. Clicking copies the value's plain text (or `copy_value`) and flashes a checkmark; an `onclick` replaces the copy. `title` opens a hover popover. Every other prop goes to `Tag`, so `color`, `variant`, `disabled` and `on_remove` work as there. `label`, `value` and `title` render as trusted HTML for sub- and superscripts, so sanitize untrusted input before passing it.

```svelte example id="info-tag-demo"
<script lang="ts">
  import { InfoTag } from 'svelte-widgets'

  let tags = $state([`mp-149`, `mp-13`, `mp-2534`])
</script>

<div style="display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center">
  <InfoTag label="E<sub>g</sub>:" value="1.12 eV" title="<b>Band gap</b> from PBE" />
  <InfoTag label="Stable:" value="yes" color="mediumseagreen" variant="solid" />
  <InfoTag label="Area:" value="42 m<sup>2</sup>" variant="outline" />
  <InfoTag label="Locked:" value="42" disabled />
</div>

<p>Removable tags, copying a longer ID than they show:</p>
<div style="display: flex; flex-wrap: wrap; gap: 0.5em">
  {#each tags as id (id)}
    <InfoTag
      label="ID:"
      value={id}
      copy_value="https://materialsproject.org/materials/{id}"
      on_remove={() => (tags = tags.filter((other) => other !== id))}
    />
  {:else}
    <button onclick={() => (tags = [`mp-149`, `mp-13`])}>Reset</button>
  {/each}
</div>
```

### `InfoCard`

A grid of label/value rows under an optional `title`, for property sheets and metadata. Numbers and number arrays go through `format` (default `format_num` from `svelte-widgets/format`); a row's own `format` wins. `unit` trails the value, `tooltip` titles it, and rows with no `value` are hidden, showing `fallback` when none remain. Labels, string values and `title` render as trusted HTML.

```svelte example id="info-card-demo"
<script lang="ts">
  import { InfoCard } from 'svelte-widgets'

  const items = [
    { label: `Band gap`, value: 1.1234, unit: `eV` },
    { label: `Density`, value: 2.329, unit: `g/cm³` },
    { label: `Lattice`, value: [5.431, 5.431, 5.431], unit: `Å` },
    {
      label: `Volume`,
      value: 160.2,
      format: (num: number) => num.toFixed(0),
      unit: `Å³`,
    },
    { label: `Space group`, value: `Fd-3m`, tooltip: `No. 227` },
    { label: `Magnetic moment`, value: null }, // hidden: no value
  ]
</script>

<InfoCard {items} title="Si<sub>8</sub>" />
<InfoCard items={[]} fallback="No properties computed yet" />
```

Set its box (background, padding, gap, width) with `style` or `class`, its column width with `--info-card-min-col-width` and the value chips with `--info-card-value-bg`.

### `ShortcutsList`

A collapsed `<details>` listing keyboard shortcuts, e.g. at the bottom of a settings or help pane. Each entry's `keys` uses the [`hotkey` grammar](attachments/hotkey) and renders with `format_shortcut`, so `mod` shows as `⌘` on Apple keyboards and `Ctrl` elsewhere. An array lists alternatives; `keys_label` replaces the keys for gestures the grammar can't spell. `summary` renames the toggle and `bind:open` expands it.

```svelte example id="shortcuts-list-demo"
<script lang="ts">
  import { ShortcutsList } from 'svelte-widgets'

  const shortcuts = [
    { keys: `mod+k`, label: `Open command menu` },
    { keys: [`ArrowLeft`, `ArrowRight`], label: `Previous / next frame` },
    { keys: `shift+?`, label: `Show help` },
    { keys: `Escape`, label: `Close the open pane` },
    { keys: [], keys_label: `⌘/Ctrl + scroll`, label: `Zoom` },
  ]
</script>

<ShortcutsList {shortcuts} open />
```

### `PrevNext`

Sequential navigation with wraparound. Pass `items` as `{ href, label }` objects and the `current` href. A nonempty list must contain `current`. Use `children({ kind, item, index, total })` to customize both links and `between` for content between them. `labels` translates the previous/next headings; `as` changes the wrapper element. Navigation uses ordinary links; apps own keyboard shortcuts, preloading, and router behavior. The links at the bottom of every demo page use this component.

```svelte example id="prev-next-demo"
<script lang="ts">
  import { PrevNext } from 'svelte-widgets'

  // relative hrefs so the links survive the docs site's base path
  const chapters = [
    { href: `toc`, label: `Toc` },
    { href: `masonry`, label: `Masonry` },
    { href: `popover`, label: `Popover` },
  ]
</script>

<PrevNext items={chapters} current="masonry" />
```

### `SubpageGrid`

A card grid using `{ href, label, description, icon? }` objects. Like Footer and PrevNext, it accepts native `target`, `rel`, and `title` on each link. The [MultiSelect overview](multiselect) uses it.

```svelte
<SubpageGrid
  title="MultiSelect Overview"
  subtitle="Keyboard-friendly, accessible multi-select."
  subpages={[
    {
      label: `Form`,
      href: `/form`,
      description: `Form integration and native validation behavior.`,
    },
    { label: `Events`, href: `/events`, description: `Event callbacks and payloads.` },
  ]}
/>
```

### `GitHubCorner`

The animated Octocat ribbon, `position: fixed` in a corner of the viewport. The one in the
top right of this page links to this repo.

```svelte
<GitHubCorner href="https://github.com/janosh/svelte-widgets" corner="top-right" />
```

Colors come from `--github-corner-bg` and `--github-corner-color` (plus their `-hover` variants), or the `fill` and `color` props for one-off overrides, which set those same properties.

### `CodeExample`

The wrapper the [Markdown integration](markdown) mounts around runnable code fences. Configure it through `create_markdown({ examples: { wrapper: ["svelte-widgets", "CodeExample"] } })` and pass that engine to `markdown_vite(engine)`. Every "View code" button on this site uses this component.

Fence metadata drives it: `collapsible` hides the source behind a button, `code_above` puts the source before the rendered example, and `repl`/`github` accept resolved URLs, for example `github="https://github.com/org/repo/blob/main/src/example.svelte"`. Resolve repository paths in the caller or build configuration; `repo`, `file`, and boolean `github` metadata are no longer supported.

### `start_polling`

`start_polling` from `svelte-widgets/browser` runs a task on an interval only while the page is visible, unless `while_hidden`. Returning to the tab (or, with `catch_up_on_focus`, to the window) runs it at once, or with `catch_up_after_ms` only once the last run is that old, and re-arms the interval, so the catch-up is not followed by a timed run a moment later. `first_delay_ms` sets the first timed run, `0` to run right away. A run never overlaps the previous one: ticks, returns and `run_now()` landing while a returned promise is pending are skipped. Its `AbortSignal` aborts on stop, and a task returning `false` marks a skipped run that does not reset the catch-up age. The returned function stops polling, which makes it a ready-made `$effect` cleanup; its `run_now()` runs at once and restarts the interval, e.g. for a refresh button.

```svelte example id="poll-demo"
<script lang="ts">
  import { start_polling } from 'svelte-widgets/browser'

  let [runs, last_run] = $state([0, `never`])
  let interval_ms = $state(2000)

  $effect(() =>
    start_polling(
      async (signal) => {
        await new Promise((resolve) => setTimeout(resolve, 300)) // a fetch(url, { signal })
        if (signal.aborted) return
        runs += 1
        last_run = new Date().toLocaleTimeString()
      },
      { interval_ms, first_delay_ms: 0, catch_up_after_ms: interval_ms },
    ),
  )
</script>

<label>
  Interval
  <select bind:value={interval_ms}>
    <option value={1000}>1 s</option>
    <option value={2000}>2 s</option>
    <option value={5000}>5 s</option>
  </select>
</label>
<p aria-live="polite">
  {runs} runs, last at {last_run}. Switch tabs and come back: hidden time is skipped.
</p>
```

## Build-time helpers

### Markdown and math

The docs site's `create_markdown({ math: true })` engine turns inline math such as $e^{i\pi} + 1 = 0$ and display math into static MathML:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

Browsers render MathML natively. Import a Temml stylesheet such as `temml/dist/Temml-Local.css` once in the app to tune spacing and use the system's math font.
