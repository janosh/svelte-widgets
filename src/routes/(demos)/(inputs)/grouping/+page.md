## Option Grouping

Group related options together with visual headers. Add a `group` key to option objects and they're automatically grouped with section headers. Requested in [GitHub issue #135](https://github.com/janosh/svelte-widgets/issues/135).

### Basic Grouping

```svelte example id="basic-grouping-demo"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  const options: ObjectOption[] = Object.entries({
    Frontend: [`JavaScript`, `TypeScript`, `React`, `Vue`, `Svelte`, `Angular`],
    Backend: [`Python`, `Go`, `Rust`, `Java`, `Node.js`, `Ruby`],
    Database: [`PostgreSQL`, `MongoDB`, `Redis`, `MySQL`, `SQLite`],
    DevOps: [`Docker`, `Kubernetes`, `Terraform`, `AWS`],
  }).flatMap(([group, options]) => options.map((option) => ({ label: option, group })))

  let selected: ObjectOption[] = $state([])
  let searchMatchesGroups = $state(false)
</script>

<label>
  <input type="checkbox" bind:checked={searchMatchesGroups} />
  <code>searchMatchesGroups</code> — Type "Backend" to match all backend options
</label>

<MultiSelect
  {options}
  bind:selected
  {searchMatchesGroups}
  placeholder="Select technologies..."
/>

<p>Selected: {selected.map((opt) => opt.label).join(`, `) || `none`}</p>
```

> **Note:** Search filtering works automatically—empty groups are hidden when no options match.

### Collapsible Groups

Enable `collapsibleGroups` to let users collapse/expand groups. Use `searchExpandsCollapsedGroups` or `keyboardExpandsCollapsedGroups` for auto-expansion:

```svelte example id="collapsible-groups-demo"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  const options: ObjectOption[] = Object.entries({
    Fruits: `🍎 Apple,🍊 Orange,🍌 Banana,🍇 Grapes,🍓 Strawberry,🫐 Blueberry`.split(
      `,`,
    ),
    Vegetables: `🥕 Carrot,🥦 Broccoli,🌽 Corn,🥬 Lettuce,🍅 Tomato,🥒 Cucumber`.split(
      `,`,
    ),
    Dairy: `🥛 Milk,🧀 Cheese,🧈 Butter,🍦 Ice Cream,🥚 Eggs`.split(`,`),
    Meat: `🥩 Steak,🍗 Chicken,🥓 Bacon,🌭 Hot Dog,🍖 Ribs`.split(`,`),
  }).flatMap(([group, options]) => options.map((option) => ({ label: option, group })))

  let selected: ObjectOption[] = $state([])
  let collapsedGroups: Set<string> = $state(new Set([`Dairy`])) // Dairy starts collapsed
  let searchExpandsCollapsedGroups = $state(true)
  let keyboardExpandsCollapsedGroups = $state(true)
  let collapseAllGroups: (() => void) | undefined = $state()
  let expandAllGroups: (() => void) | undefined = $state()
</script>

<div style="display: flex; flex-wrap: wrap; gap: 1em; margin-bottom: 0.5em">
  <label>
    <input type="checkbox" bind:checked={searchExpandsCollapsedGroups} />
    <code>searchExpandsCollapsedGroups</code>
  </label>
  <label>
    <input type="checkbox" bind:checked={keyboardExpandsCollapsedGroups} />
    <code>keyboardExpandsCollapsedGroups</code>
  </label>
</div>

<div style="display: flex; gap: 1em; margin-bottom: 1em">
  <button onclick={() => collapseAllGroups?.()}>Collapse All</button>
  <button onclick={() => expandAllGroups?.()}>Expand All</button>
</div>

<MultiSelect
  {options}
  bind:selected
  collapsibleGroups
  bind:collapsedGroups
  {searchExpandsCollapsedGroups}
  {keyboardExpandsCollapsedGroups}
  bind:collapseAllGroups
  bind:expandAllGroups
  placeholder="Click headers or use arrow keys..."
/>

<p>Collapsed: {[...collapsedGroups].join(`, `) || `none`}</p>
```

### Per-Group Select All

Enable `groupSelectAll` to add a toggle button to each group header:

```svelte example id="group-select-all"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  const options: ObjectOption[] = Object.entries({
    Primary: [`Red`, `Blue`, `Yellow`],
    Secondary: [`Orange`, `Green`, `Purple`],
    Tertiary: [`Vermilion`, `Amber`, `Chartreuse`, `Teal`, `Violet`, `Magenta`],
    Neutrals: [`White`, `Black`, `Gray`, `Silver`, `Beige`],
  }).flatMap(([group, options]) => options.map((option) => ({ label: option, group })))

  let selected: ObjectOption[] = $state([])
</script>

<MultiSelect
  {options}
  bind:selected
  groupSelectAll
  keepSelectedInDropdown="checkboxes"
  placeholder="Select colors..."
/>

<p>Selected: {selected.map((opt) => opt.label).join(`, `) || `none`}</p>
```

### Ungrouped Options & Sorting

Use `ungroupedPosition` for options without a `group` key, and `groupSortOrder` to sort groups:

```svelte example id="ungrouped-sorting"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  // Ungrouped options (no group key) mixed with grouped options
  const ungrouped: ObjectOption[] = [
    `⭐ Featured Item`,
    `🔥 Popular Choice`,
    `✨ Editor's Pick`,
  ].map((label) => ({ label }))
  const grouped: ObjectOption[] = Object.entries({
    'Z Animals': [`Zebra`, `Zorse`, `Zebu`],
    'A Fruits': [`Apple`, `Apricot`, `Avocado`],
    'L Animals': [`Lion`, `Leopard`, `Lemur`],
    'M Fruits': [`Mango`, `Melon`, `Mulberry`],
  }).flatMap(([group, opts]) => opts.map((label) => ({ label, group })))
  const options: ObjectOption[] = [...ungrouped, ...grouped]

  let selected: ObjectOption[] = $state([])
  let ungroupedPosition: 'first' | 'last' = $state(`first`)
  let groupSortOrder: 'none' | 'asc' | 'desc' = $state(`asc`)
</script>

<div style="display: flex; gap: 2em; margin-bottom: 1em">
  <label>
    ungroupedPosition:
    <select bind:value={ungroupedPosition}>
      <option value="first">first</option>
      <option value="last">last</option>
    </select>
  </label>
  <label>
    groupSortOrder:
    <select bind:value={groupSortOrder}>
      <option value="none">none</option>
      <option value="asc">asc</option>
      <option value="desc">desc</option>
    </select>
  </label>
</div>

<MultiSelect
  {options}
  bind:selected
  {ungroupedPosition}
  {groupSortOrder}
  placeholder="Select items..."
/>
```

### Sticky Headers & Dynamic Loading

Use `stickyGroupHeaders` for long lists. Grouping also works with `loadOptions`:

```svelte example id="sticky-dynamic"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { LoadOptionsParams, LoadOptionsResult, ObjectOption } from '$lib/types'

  interface TeamMember extends ObjectOption {
    name: string
  }

  const departments: string[] =
    `Engineering,Design,Marketing,Sales,HR,Finance,Legal,Operations`.split(`,`)
  const server_data: TeamMember[] = departments.flatMap((dept) =>
    Array.from({ length: 8 }, (_, idx) => ({
      label: `${dept.slice(0, 3)}-${String(idx + 1).padStart(3, `0`)}`,
      name: `${dept} Team Member ${idx + 1}`,
      group: dept,
    })),
  )

  async function load_options(
    params: LoadOptionsParams,
  ): Promise<LoadOptionsResult<TeamMember>> {
    const { search, offset, limit } = params
    await new Promise((resolve) => setTimeout(resolve, 200))
    const filtered = search
      ? server_data.filter(
          (user) =>
            user.name.toLowerCase().includes(search.toLowerCase()) ||
            (user.group?.toLowerCase().includes(search.toLowerCase()) ?? false),
        )
      : server_data
    return {
      options: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
    }
  }

  let selected: TeamMember[] = $state([])
  let stickyGroupHeaders = $state(true)
</script>

<label style="margin-bottom: 1em; display: block">
  <input type="checkbox" bind:checked={stickyGroupHeaders} />
  <code>stickyGroupHeaders</code>
</label>

<MultiSelect
  loadOptions={load_options}
  bind:selected
  {stickyGroupHeaders}
  collapsibleGroups
  groupSelectAll
  placeholder="Scroll to see sticky headers..."
/>
```

### Custom Group Header

Use the `groupHeader` snippet for complete control over header rendering:

```svelte example id="custom-group-header-demo"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  const options: ObjectOption[] = Object.entries({
    USA: [`New York`, `Los Angeles`, `Chicago`, `Houston`, `Phoenix`],
    UK: [`London`, `Manchester`, `Birmingham`, `Leeds`],
    Japan: [`Tokyo`, `Osaka`, `Kyoto`, `Yokohama`],
    France: [`Paris`, `Lyon`, `Marseille`, `Toulouse`],
    Germany: [`Berlin`, `Munich`, `Hamburg`, `Frankfurt`],
  }).flatMap(([group, options]) => options.map((option) => ({ label: option, group })))

  const emojis: Record<string, string> = {
    USA: `🇺🇸`,
    UK: `🇬🇧`,
    Japan: `🇯🇵`,
    France: `🇫🇷`,
    Germany: `🇩🇪`,
  }
  let selected: ObjectOption[] = $state([])
</script>

<MultiSelect
  {options}
  bind:selected
  collapsibleGroups
  groupSelectAll
  placeholder="Select cities..."
  liGroupHeaderStyle="gap: 8px"
>
  {#snippet groupHeader({ group, options, collapsed })}
    <span style="font-size: 1.2em">{emojis[group]}</span>
    <strong>{group}</strong>
    <span style="opacity: 0.6; font-size: 0.85em">({options.length})</span>
    <span style="margin-left: auto">{collapsed ? `▶` : `▼`}</span>
  {/snippet}
</MultiSelect>
```

## Props Reference

| Prop                             | Type                              | Default   | Description                              |
| -------------------------------- | --------------------------------- | --------- | ---------------------------------------- |
| `collapsibleGroups`              | `boolean`                         | `false`   | Enable click-to-collapse groups          |
| `collapsedGroups`                | `Set<string>`                     | `new Set` | Bindable set of collapsed group names    |
| `groupSelectAll`                 | `boolean`                         | `false`   | Add select/deselect all button per group |
| `ungroupedPosition`              | `'first' \| 'last'`               | `'first'` | Where to render ungrouped options        |
| `groupSortOrder`                 | `'none' \| 'asc' \| 'desc' \| fn` | `'none'`  | Sort groups alphabetically or custom     |
| `searchExpandsCollapsedGroups`   | `boolean`                         | `false`   | Auto-expand when search matches          |
| `searchMatchesGroups`            | `boolean`                         | `false`   | Include group name in search matching    |
| `keyboardExpandsCollapsedGroups` | `boolean`                         | `false`   | Auto-expand on arrow key navigation      |
| `stickyGroupHeaders`             | `boolean`                         | `false`   | Keep headers visible when scrolling      |
| `liGroupHeaderClass`             | `string`                          | `''`      | CSS class for group header `<li>`        |
| `liGroupHeaderStyle`             | `string \| null`                  | `null`    | Inline style for group headers           |
| `groupHeader`                    | `Snippet`                         | —         | Custom group header rendering            |
| `collapseAllGroups`              | `() => void`                      | —         | Bindable function to collapse all        |
| `expandAllGroups`                | `() => void`                      | —         | Bindable function to expand all          |
| `ongroupToggle`                  | `fn`                              | —         | Callback when group toggled              |

### CSS Variables

| Variable                         | Default                  | Description      |
| -------------------------------- | ------------------------ | ---------------- |
| `--sms-group-header-font-weight` | `600`                    | Font weight      |
| `--sms-group-header-font-size`   | `0.9em`                  | Font size        |
| `--sms-group-header-color`       | `light-dark(#666, #aaa)` | Text color       |
| `--sms-group-header-bg`          | `transparent`            | Background       |
| `--sms-group-header-padding`     | `2pt 1ex`                | Padding          |
| `--sms-group-header-hover-bg`    | `light-dark(...)`        | Hover background |
| `--sms-group-item-padding-left`  | `1.5ex`                  | Option indent    |
