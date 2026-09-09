<script lang="ts">
  import { FileDetails } from '$lib'
  import language_snippet_src from '$site/LanguageSnippet.svelte?raw'
  import minus_icon_src from '$site/MinusIcon.svelte?raw'
</script>

## Snippets

### Svelte SVG component as `"removeIcon"` snippet

```svelte example id="languages-1"
<script lang="ts">
  import { MultiSelect, Icon } from '$lib'
  import { Collapse, Expand } from '$lib/icons'
  import { languages } from '$site/options'
  import { LanguageSnippet, MinusIcon } from '$site'
</script>

<MultiSelect
  options={languages}
  maxSelect={5}
  placeholder="What languages do you know?"
  selected={['Python', 'TypeScript', 'Julia']}
>
  {#snippet children({ option })}
    <LanguageSnippet {option} />
  {/snippet}
  {#snippet expandIcon({ open, disabled })}
    <Icon icon={open ? Collapse : Expand} style={disabled ? `opacity: 0.5` : null} />
  {/snippet}
  {#snippet removeIcon({ isRemoveAll })}
    {#if isRemoveAll}Clear all{:else}<MinusIcon width="1em" />{/if}
  {/snippet}
</MultiSelect>
```

<FileDetails files={[
{ title: `LanguageSnippet.svelte`, content: language_snippet_src },
{ title: `MinusIcon.svelte`, content: minus_icon_src },
]}>
{#snippet title_snippet({ title })}
<code>{title}</code>
{/snippet}
</FileDetails>

### Simple HTML tag as `"removeIcon"` snippet

This example also moves the expand icon to the right side of the input via `expandIconPosition="right"`.

```svelte example id="languages-2"
<script lang="ts">
  import { MultiSelect, Icon } from '$lib'
  import { Collapse, Expand } from '$lib/icons'
  import { languages } from '$site/options'
  import { LanguageSnippet } from '$site'

  // local state synchronized with the component through bind:open
  let open = $state(false)
</script>

<MultiSelect
  options={languages}
  maxSelect={5}
  placeholder="What languages do you know?"
  selected={[`Python`, `TypeScript`, `Julia`]}
  expandIconPosition="right"
  bind:open
>
  {#snippet selectedItem({ option })}
    <LanguageSnippet {option} />
  {/snippet}
  {#snippet option({ option, selected })}
    <LanguageSnippet {option} style={selected ? `opacity: 0.6` : ``} />
  {/snippet}
  {#snippet expandIcon({ open: expandOpen, disabled })}
    <button type="button" {disabled}>
      <Icon icon={expandOpen ? Collapse : Expand} />
    </button>
  {/snippet}
  {#snippet removeIcon({ option: opt, isRemoveAll })}
    <span style="width: 2ex" title={isRemoveAll ? `Remove all` : `Remove ${opt}`}>✕</span>
  {/snippet}
</MultiSelect>
```

### `"user-msg"` snippet

```svelte example id="languages-3"
<script lang="ts">
  import { MultiSelect, Icon } from '$lib'
  import { languages } from '$site/options'
  import { LanguageSnippet } from '$site'

  let selected: string[] = $state([`Python`, `TypeScript`, `Julia`])
  let searchText = $state(`Julia`)
</script>

<MultiSelect
  options={languages}
  bind:searchText
  bind:selected
  maxSelect={5}
  placeholder="What languages do you know?"
  open
  allowUserOptions
>
  {#snippet userMsg({ msg })}
    <span>{msg} {selected?.includes(searchText) ? '🤦' : '👷'}</span>
  {/snippet}
</MultiSelect>
```

### Rich option labels

Labels are plain text for filtering and accessibility. Use a `children` snippet for links, images, or other markup in both dropdown options and selected chips.

```svelte example id="rich-labels"
<script lang="ts">
  import { MultiSelect } from '$lib'
</script>

<MultiSelect options={['Red Pill', 'Blue Pill']} maxSelect={1}>
  {#snippet children({ option })}
    <strong>{option}</strong>
    <a href="https://wikipedia.org/wiki/Red_pill_and_blue_pill">Explanation</a>
  {/snippet}
</MultiSelect>
```
