## ButtonGroup

The n-way sibling of [`Toggle`](extras#toggle): a row of buttons over a fixed set of
options, either as a segmented control (pick one) or a filter row (pick any).

Options come in whichever shape you already have them in — bare values, a
`Record<value, label>`, `[value, label]` pairs, or objects carrying a `tooltip`,
`icon`, `disabled` or `loading` flag.

### Single select

`multiple` defaults to `false`, so the group is a `radiogroup` of `role="radio"`
buttons: one tab stop for the whole group, arrow keys walk it (wrapping at both ends,
skipping disabled options) and carry the selection with focus, Home and End jump to
either end.

`sort_order` is opt-in — leave it `null` (the default) and no arrow renders.
Style the arrow with `sort_button_props` (it sits outside the radiogroup, so host `style` does not reach it).

```svelte example id="button-group-single"
<script lang="ts">
  import { GitHub } from '$lib/icons'
  import ButtonGroup, { type ButtonGroupOption } from '$lib/ButtonGroup.svelte'

  const options: ButtonGroupOption[] = [
    {
      value: `commits`,
      label: `commits`,
      tooltip: `Total commits to the default branch`,
    },
    { value: `stars`, label: `stars`, icon: GitHub },
    { value: `title`, label: `title` },
    { value: `size`, label: `size`, disabled: true },
  ]
  let sort_by = $state(`commits`)
  let sort_order = $state<`asc` | `desc`>(`desc`)
</script>

<ButtonGroup
  {options}
  bind:selected={sort_by}
  bind:sort_order
  label="Sort projects by"
  style="--btn-group-gap: 6pt"
/>

<p>
  sorting by <code>{sort_by}</code> in <code>{sort_order}</code>ending order
</p>
```

### Multi-select

`multiple` swaps the semantics rather than just the bookkeeping: the container becomes
a plain `group` of independent toggle buttons carrying `aria-pressed`, each its own tab
stop, since there is nothing mutually exclusive left for a radio group to announce.
`selected` is an array here.

The `option` snippet replaces a button's contents, `on_change` fires with the new
selection, and every color is a `--btn-group-*` custom property.

```svelte example id="button-group-multi"
<script lang="ts">
  import ButtonGroup from '$lib/ButtonGroup.svelte'

  const tags: Record<string, string> = {
    svelte: `Svelte`,
    kit: `SvelteKit`,
    ts: `TypeScript`,
    css: `CSS`,
  }
  const tag_counts: Record<string, number> = { svelte: 12, kit: 8, ts: 17, css: 5 }
  let active = $state([`svelte`])
</script>

<ButtonGroup
  options={tags}
  multiple
  bind:selected={active}
  label="Filter by tag"
  style="--btn-group-btn-radius: 1em; --btn-group-btn-active-bg: cornflowerblue; --btn-group-btn-active-color: white"
>
  {#snippet option({ option: opt, selected })}
    {opt.label}
    <span style="opacity: 0.6">{selected ? `×` : `+`}</span>
  {/snippet}
  {#snippet option_suffix({ option: opt })}
    <span style="padding-right: 6pt; opacity: 0.6">{tag_counts[opt.value]}</span>
  {/snippet}
</ButtonGroup>

<p>filters: {active.length ? active.join(`, `) : `none`}</p>
```

`option_suffix` renders as a **sibling** instead, wrapped with the button in a `.option`
span, as shown by the counts above. Prefer non-interactive suffixes in single-select
`radiogroup` mode; a focusable suffix adds a non-radio tab stop.
Without `option_suffix`, buttons remain direct `.options` children, preserving
`.options > button` selectors.

### Styling

Everything themable hangs off `--btn-group-*`: `display`, `gap`, `padding`, `bg`,
`border`, `radius` and `justify-content` on the container, and `btn-padding`,
`btn-radius`, `btn-bg`, `btn-color`, `btn-border`, `btn-gap`, `btn-cursor`,
`btn-transition`, `btn-hover-bg`, `btn-hover-color`, `btn-hover-transform`,
`btn-active-bg`, `btn-active-color`, `btn-active-border-color`, `btn-disabled-opacity`,
`btn-font-family`, `btn-font-size` on the buttons. When `option_suffix` wraps an option,
`--btn-group-option-btn-padding-right` (default `0.5ex`) tightens the button's right
padding so the suffix sits in that gap. The component lays its buttons out in a wrapping
flex row and takes no position of its own, so placing it is the call site's job. Pass
`style` (or any other host attribute) through `...rest` on the root.

Two only pay off together: a hover lift needs `btn-hover-transform` _and_
`btn-transition`, since neither animates alone. `btn-hover-color` falls back to
`btn-color`, so setting only the resting color keeps it through hover.

Font size needs no property of its own — the buttons resolve theirs to `inherit`, so
`style="font-size: 1.2em"` on the group reaches them. Weight and style are the exception:
they are declared nowhere, so your own `button {}` rule still wins, which also puts them
out of reach of inheritance, since the user-agent `button` rule sets them directly. Style
the buttons from your own stylesheet to change either.

The root is a `<div>`. Pass `as="span"` where a div would be invalid, such as inside a
heading or a paragraph.

Per-option tooltips come from each option's `tooltip` field. `tooltip_options` forwards
everything else to the [`tooltip`](attachments/tooltip) attachment, so
`tooltip_options={{ allow_html: true }}` renders rich content instead of escaping it.
Only turn that on for trusted or sanitized markup — an HTML tooltip built from
user-controlled text is an XSS vector.
