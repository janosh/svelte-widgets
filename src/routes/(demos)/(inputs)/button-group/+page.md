## ButtonGroup

The n-way sibling of [`Toggle`](extras#toggle): a row of buttons over a fixed set of options, either as a segmented control (pick one) or a filter row (pick any).

`options` is an array of strings or objects with a required `value` and optional `label`, `tooltip`, `icon`, `disabled` and `loading` fields.

### Single select

`mode` defaults to `"single"`: a `radiogroup` of `role="radio"` buttons with one tab stop for the whole group. Arrow keys walk it (wrapping at both ends, skipping disabled options) and carry the selection with focus; Home and End jump to either end.

`sort_order` is opt-in: at its default `null`, no sort arrow renders. Style the arrow with `sort_button_props`, since it sits outside the radiogroup where host `style` does not reach.

```svelte example id="button-group-single"
<script lang="ts">
  import { GitHub } from 'svelte-widgets/icons'
  import { ButtonGroup, type ButtonGroupOption } from 'svelte-widgets'

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
  bind:value={sort_by}
  bind:sort_order
  label="Sort projects by"
  style="--btn-group-gap: 6pt"
/>

<p>
  sorting by <code>{sort_by}</code> in <code>{sort_order}</code>ending order
</p>
```

### Multi-select

`mode="multiple"` swaps the semantics too: the container becomes a plain `group` of independent `aria-pressed` toggle buttons, each its own tab stop, and `value` is an array.

The `option` snippet replaces a button's contents, `on_change` fires with the new selection, and every color is a `--btn-group-*` custom property.

```svelte example id="button-group-multi"
<script lang="ts">
  import ButtonGroup from 'svelte-widgets/ButtonGroup.svelte'

  const tags = [
    { value: `svelte`, label: `Svelte` },
    { value: `kit`, label: `SvelteKit` },
    { value: `ts`, label: `TypeScript` },
    { value: `css`, label: `CSS` },
  ]
  const tag_counts: Record<string, number> = { svelte: 12, kit: 8, ts: 17, css: 5 }
  let active = $state([`svelte`])
</script>

<ButtonGroup
  options={tags}
  mode="multiple"
  bind:value={active}
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

`option_suffix` renders as a **sibling** of the button instead, both wrapped in a `.option` span, like the counts above. In single-select mode prefer non-interactive suffixes, since a focusable one adds a non-radio tab stop. An option's `tooltip` then shows on hover anywhere in the pill, suffix included, and on focus of its button. Without `option_suffix`, buttons stay direct `.options` children, so `.options > button` selectors keep working.

### Styling

Everything themable hangs off `--btn-group-*`: `display`, `gap`, `padding`, `bg`, `border`, `radius`, `justify-content` and `flex-wrap` (default `wrap`; `balance` evens out the wrapped rows where supported) on the container, and `btn-padding`, `btn-radius`, `btn-bg`, `btn-color`, `btn-border`, `btn-gap`, `btn-cursor`, `btn-transition`, `btn-hover-bg`, `btn-hover-color`, `btn-hover-transform`, `btn-active-bg`, `btn-active-color`, `btn-active-border-color`, `btn-disabled-opacity`, `btn-font-family`, `btn-font-size` on the buttons. When `option_suffix` wraps an option, `--btn-group-option-btn-padding-right` (default `0.5ex`) tightens the button's right padding so the suffix sits in that gap. The component takes no position of its own, so placing it is the call site's job; `style` and other host attributes go to the root.

A hover lift needs both `btn-hover-transform` and `btn-transition`, since neither animates alone. `btn-hover-color` falls back to `btn-color`, so setting only the resting color keeps it through hover.

Font size and family default to `inherit`, so `style="font-size: 1.2em"` on the group reaches the buttons. Weight and style are not declared, so the user-agent `button` rule sets them (blocking inheritance) and your own `button {}` rule wins; change them from your stylesheet.

The root is a `<div>`; pass `as="span"` where a div would be invalid, such as inside a heading or paragraph.

`tooltip_options` forwards everything but the per-option `tooltip` text to the [`tooltip`](attachments/tooltip) attachment. Tooltips render plain text; use `Popover` for formatted content or interactive controls.
