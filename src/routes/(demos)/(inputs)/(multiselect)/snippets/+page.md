## Snippets

### Inline SVG as `"remove_icon"` snippet

```svelte example id="languages-1"
<script lang="ts">
  import { MultiSelect, Icon } from 'svelte-widgets'
  import { Collapse, Expand } from 'svelte-widgets/icons'
  const languages =
    `JavaScript TypeScript CoffeeScript Python Ruby C C# C++ Go Swift Java Rust Kotlin Haskell Scala Clojure Erlang Elixir F# Dart Elm Julia Lua R OCaml Perl PHP`
      .split(` `)
      .toSorted()
</script>

{#snippet language_option(option: string, idx?: number, style?: string)}
  {@const language = option.toLowerCase().replaceAll(`+`, `plus`).replace(`#`, `sharp`)}
  <span style={`display: inline-flex; align-items: center; gap: 5pt; ${style ?? ``}`}>
    {#if idx !== undefined}<strong>{idx + 1}</strong>{/if}
    <img
      src={`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${language}/${language}-original.svg`}
      alt={option}
      style={`height: 20px; ${option === `Rust` ? `filter: invert(1)` : ``}`}
      onerror={(event) => (event.currentTarget.hidden = true)}
    />
    {option}
  </span>
{/snippet}

<MultiSelect
  options={languages}
  max_select={5}
  placeholder="What languages do you know?"
  selected={['Python', 'TypeScript', 'Julia']}
>
  {#snippet children({ option })}
    {@render language_option(option)}
  {/snippet}
  {#snippet expand_icon({ open, disabled })}
    <Icon icon={open ? Collapse : Expand} style={disabled ? `opacity: 0.5` : null} />
  {/snippet}
  {#snippet remove_icon({ is_remove_all })}
    {#if is_remove_all}Clear all{:else}<svg
        aria-hidden="true"
        fill="currentColor"
        viewBox="0 0 24 24"
        width="1em"
        ><path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm4 11H8c-.55 0-1-.45-1-1s.45-1 1-1h8c.55 0 1 .45 1 1s-.45 1-1 1z"
        /></svg
      >{/if}
  {/snippet}
</MultiSelect>
```

### Simple HTML tag as `"remove_icon"` snippet

This example also moves the expand icon to the right side of the input via `expand_icon_position="right"`.

```svelte example id="languages-2"
<script lang="ts">
  import { MultiSelect, Icon } from 'svelte-widgets'
  import { Collapse, Expand } from 'svelte-widgets/icons'
  const languages =
    `JavaScript TypeScript CoffeeScript Python Ruby C C# C++ Go Swift Java Rust Kotlin Haskell Scala Clojure Erlang Elixir F# Dart Elm Julia Lua R OCaml Perl PHP`
      .split(` `)
      .toSorted()

  // local state synchronized with the component through bind:open
  let open = $state(false)
</script>

{#snippet language_option(option: string, idx?: number, style?: string)}
  {@const language = option.toLowerCase().replaceAll(`+`, `plus`).replace(`#`, `sharp`)}
  <span style={`display: inline-flex; align-items: center; gap: 5pt; ${style ?? ``}`}>
    {#if idx !== undefined}<strong>{idx + 1}</strong>{/if}
    <img
      src={`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${language}/${language}-original.svg`}
      alt={option}
      style={`height: 20px; ${option === `Rust` ? `filter: invert(1)` : ``}`}
      onerror={(event) => (event.currentTarget.hidden = true)}
    />
    {option}
  </span>
{/snippet}

<MultiSelect
  options={languages}
  max_select={5}
  placeholder="What languages do you know?"
  selected={[`Python`, `TypeScript`, `Julia`]}
  expand_icon_position="right"
  bind:open
>
  {#snippet selected_item({ option })}
    {@render language_option(option)}
  {/snippet}
  {#snippet option({ option, selected })}
    {@render language_option(option, undefined, selected ? `opacity: 0.6` : ``)}
  {/snippet}
  {#snippet expand_icon({ open: expandOpen, disabled })}
    <button type="button" {disabled}>
      <Icon icon={expandOpen ? Collapse : Expand} />
    </button>
  {/snippet}
  {#snippet remove_icon({ option: opt, is_remove_all })}
    <span style="width: 2ex" title={is_remove_all ? `Remove all` : `Remove ${opt}`}
      >✕</span
    >
  {/snippet}
</MultiSelect>
```

### `"user-msg"` snippet

```svelte example id="languages-3"
<script lang="ts">
  import { MultiSelect, Icon } from 'svelte-widgets'
  const languages =
    `JavaScript TypeScript CoffeeScript Python Ruby C C# C++ Go Swift Java Rust Kotlin Haskell Scala Clojure Erlang Elixir F# Dart Elm Julia Lua R OCaml Perl PHP`
      .split(` `)
      .toSorted()

  let selected: string[] = $state([`Python`, `TypeScript`, `Julia`])
  let search_text = $state(`Julia`)
</script>

{#snippet language_option(option: string, idx?: number, style?: string)}
  {@const language = option.toLowerCase().replaceAll(`+`, `plus`).replace(`#`, `sharp`)}
  <span style={`display: inline-flex; align-items: center; gap: 5pt; ${style ?? ``}`}>
    {#if idx !== undefined}<strong>{idx + 1}</strong>{/if}
    <img
      src={`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${language}/${language}-original.svg`}
      alt={option}
      style={`height: 20px; ${option === `Rust` ? `filter: invert(1)` : ``}`}
      onerror={(event) => (event.currentTarget.hidden = true)}
    />
    {option}
  </span>
{/snippet}

<MultiSelect
  options={languages}
  bind:search_text
  bind:selected
  max_select={5}
  placeholder="What languages do you know?"
  open
  allow_user_options
>
  {#snippet user_msg({ msg })}
    <span>{msg} {selected?.includes(search_text) ? '🤦' : '👷'}</span>
  {/snippet}
</MultiSelect>
```

### Rich option labels

Labels are plain text for filtering and accessibility. Use a `children` snippet for links, images, or other markup in both dropdown options and selected chips.

```svelte example id="rich-labels"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
</script>

<MultiSelect options={['Red Pill', 'Blue Pill']} max_select={1}>
  {#snippet children({ option })}
    <strong>{option}</strong>
    <a href="https://wikipedia.org/wiki/Red_pill_and_blue_pill">Explanation</a>
  {/snippet}
</MultiSelect>
```
