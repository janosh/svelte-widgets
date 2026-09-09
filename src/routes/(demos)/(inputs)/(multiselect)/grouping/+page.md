## Option Grouping

Group related options together with visual headers. Add a `group` key to option objects and they're automatically grouped with section headers. Requested in [GitHub issue #135](https://github.com/janosh/svelte-widgets/issues/135).

### Basic Grouping

```svelte example id="basic-grouping-demo"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

  const options: ObjectOption[] = Object.entries({
    Frontend: [`JavaScript`, `TypeScript`, `React`, `Vue`, `Svelte`, `Angular`],
    Backend: [`Python`, `Go`, `Rust`, `Java`, `Node.js`, `Ruby`],
    Database: [`PostgreSQL`, `MongoDB`, `Redis`, `MySQL`, `SQLite`],
    DevOps: [`Docker`, `Kubernetes`, `Terraform`, `AWS`],
  }).flatMap(([group, options]) => options.map((option) => ({ label: option, group })))

  let selected: ObjectOption[] = $state([])
  let search_matches_groups = $state(false)
</script>

<label>
  <input type="checkbox" bind:checked={search_matches_groups} />
  <code>search_matches_groups</code> — Type "Backend" to match all backend options
</label>

<MultiSelect
  {options}
  bind:selected
  {search_matches_groups}
  placeholder="Select technologies..."
/>

<p>Selected: {selected.map((opt) => opt.label).join(`, `) || `none`}</p>
```

> **Note:** Search filtering works automatically—empty groups are hidden when no options match.

### Collapsible Groups

Enable `collapsible_groups` to let users collapse/expand groups. Use `search_expands_collapsed_groups` or `keyboard_expands_collapsed_groups` for auto-expansion:

```svelte example id="collapsible-groups-demo"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

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
  let collapsed_groups: Set<string> = $state(new Set([`Dairy`])) // Dairy starts collapsed
  let search_expands_collapsed_groups = $state(true)
  let keyboard_expands_collapsed_groups = $state(true)
  let collapse_all_groups: (() => void) | undefined = $state()
  let expand_all_groups: (() => void) | undefined = $state()
</script>

<div style="display: flex; flex-wrap: wrap; gap: 1em; margin-bottom: 0.5em">
  <label>
    <input type="checkbox" bind:checked={search_expands_collapsed_groups} />
    <code>search_expands_collapsed_groups</code>
  </label>
  <label>
    <input type="checkbox" bind:checked={keyboard_expands_collapsed_groups} />
    <code>keyboard_expands_collapsed_groups</code>
  </label>
</div>

<div style="display: flex; gap: 1em; margin-bottom: 1em">
  <button onclick={() => collapse_all_groups?.()}>Collapse All</button>
  <button onclick={() => expand_all_groups?.()}>Expand All</button>
</div>

<MultiSelect
  {options}
  bind:selected
  collapsible_groups
  bind:collapsed_groups
  {search_expands_collapsed_groups}
  {keyboard_expands_collapsed_groups}
  bind:collapse_all_groups
  bind:expand_all_groups
  placeholder="Click headers or use arrow keys..."
/>

<p>Collapsed: {[...collapsed_groups].join(`, `) || `none`}</p>
```

### Per-Group Select All

Enable `group_select_all` to add a toggle button to each group header:

```svelte example id="group-select-all"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

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
  group_select_all
  keep_selected_in_dropdown="checkboxes"
  placeholder="Select colors..."
/>

<p>Selected: {selected.map((opt) => opt.label).join(`, `) || `none`}</p>
```

### Ungrouped Options & Sorting

Use `ungrouped_position` for options without a `group` key, and `group_sort_order` to sort groups:

```svelte example id="ungrouped-sorting"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

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
  let ungrouped_position: 'first' | 'last' = $state(`first`)
  let group_sort_order: 'none' | 'asc' | 'desc' = $state(`asc`)
</script>

<div style="display: flex; gap: 2em; margin-bottom: 1em">
  <label>
    ungrouped_position:
    <select bind:value={ungrouped_position}>
      <option value="first">first</option>
      <option value="last">last</option>
    </select>
  </label>
  <label>
    group_sort_order:
    <select bind:value={group_sort_order}>
      <option value="none">none</option>
      <option value="asc">asc</option>
      <option value="desc">desc</option>
    </select>
  </label>
</div>

<MultiSelect
  {options}
  bind:selected
  {ungrouped_position}
  {group_sort_order}
  placeholder="Select items..."
/>
```

### Sticky Headers & Dynamic Loading

Use `sticky_group_headers` for long lists. Grouping also works with `load_options`:

```svelte example id="sticky-dynamic"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { LoadOptionsParams, LoadOptionsResult, ObjectOption } from 'svelte-widgets'

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
      has_more: offset + limit < filtered.length,
    }
  }

  let selected: TeamMember[] = $state([])
  let sticky_group_headers = $state(true)
</script>

<label style="margin-bottom: 1em; display: block">
  <input type="checkbox" bind:checked={sticky_group_headers} />
  <code>sticky_group_headers</code>
</label>

<MultiSelect
  {load_options}
  bind:selected
  {sticky_group_headers}
  collapsible_groups
  group_select_all
  placeholder="Scroll to see sticky headers..."
/>
```

### Custom Group Header

Use the `group_header` snippet for complete control over header rendering:

```svelte example id="custom-group-header-demo"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

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
  collapsible_groups
  group_select_all
  placeholder="Select cities..."
  li_group_header_style="gap: 8px"
>
  {#snippet group_header({ group, options, collapsed })}
    <span style="font-size: 1.2em">{emojis[group]}</span>
    <strong>{group}</strong>
    <span style="opacity: 0.6; font-size: 0.85em">({options.length})</span>
    <span style="margin-left: auto">{collapsed ? `▶` : `▼`}</span>
  {/snippet}
</MultiSelect>
```

## Props Reference

| Prop                                | Type                              | Default   | Description                              |
| ----------------------------------- | --------------------------------- | --------- | ---------------------------------------- |
| `collapsible_groups`                | `boolean`                         | `false`   | Enable click-to-collapse groups          |
| `collapsed_groups`                  | `Set<string>`                     | `new Set` | Bindable set of collapsed group names    |
| `group_select_all`                  | `boolean`                         | `false`   | Add select/deselect all button per group |
| `ungrouped_position`                | `'first' \| 'last'`               | `'first'` | Where to render ungrouped options        |
| `group_sort_order`                  | `'none' \| 'asc' \| 'desc' \| fn` | `'none'`  | Sort groups alphabetically or custom     |
| `search_expands_collapsed_groups`   | `boolean`                         | `false`   | Auto-expand when search matches          |
| `search_matches_groups`             | `boolean`                         | `false`   | Include group name in search matching    |
| `keyboard_expands_collapsed_groups` | `boolean`                         | `false`   | Auto-expand on arrow key navigation      |
| `sticky_group_headers`              | `boolean`                         | `false`   | Keep headers visible when scrolling      |
| `li_group_header_class`             | `string`                          | `''`      | CSS class for group header `<li>`        |
| `li_group_header_style`             | `string \| null`                  | `null`    | Inline style for group headers           |
| `group_header`                      | `Snippet`                         | —         | Custom group header rendering            |
| `collapse_all_groups`               | `() => void`                      | —         | Bindable function to collapse all        |
| `expand_all_groups`                 | `() => void`                      | —         | Bindable function to expand all          |
| `on_group_toggle`                   | `fn`                              | —         | Callback when group toggled              |

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
