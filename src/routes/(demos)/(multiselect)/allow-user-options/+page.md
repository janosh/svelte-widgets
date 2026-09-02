## Allow Custom User Input

`allowUserOptions={true}` means users can enter custom options by entering text and hitting enter.

```svelte example id="foods"
<script lang="ts">
  import { MultiSelect, Toggle } from '$lib'
  import { foods } from '$site/options'

  let selected: string[] = $state(
    '🍇 Grapes, 🍈 Melon, 🍉 Watermelon, 🍊 Tangerine'.split(', '),
  )
  let duplicates = $state(false)
  let last_created: string | null = $state(null)
</script>

<MultiSelect
  options={foods}
  allowUserOptions
  {duplicates}
  bind:selected
  createOptionMsg={({ searchText }) => `Add '${searchText}' as custom food`}
  oncreate={({ option }) => (last_created = String(option))}
/>

{#if last_created}
  <p style="color: mediumseagreen; margin-top: 0.5em">
    ✓ Created custom option: {last_created}
  </p>
{/if}

<label for="duplicates" style="display: block; margin-top: 1em">
  Allow duplicates
  <Toggle bind:checked={duplicates} id="duplicates" />
</label>

<p style="margin-top: 0.5em">
  Selected ({selected.length}): {selected.join(', ') || 'none'}
</p>
```

## Append User Input

`allowUserOptions="append"` is similar to `true` but also adds user-entered custom options to the dropdown list. They'll remain there for re-selection if users remove their custom options from selected items.

```svelte example id="languages"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { languages } from '$site/options'
  import { LanguageSnippet } from '$site'

  let selected_append: string[] = $state(['Haskell', 'TypeScript'])
</script>

<MultiSelect
  options={languages}
  allowUserOptions="append"
  bind:selected={selected_append}
  createOptionMsg={({ searchText, options }) =>
    `Add '${searchText}' (${options.length} languages available)`}
>
  {#snippet children({ option })}
    <LanguageSnippet {option} />
  {/snippet}
</MultiSelect>

<p style="margin-top: 0.5em">Selected: {selected_append.join(', ')}</p>
```

## Start empty

You can start with no options and let users populate MultiSelect from scratch. In this case, MultiSelect acts more like a tagging component.

```svelte example id="no-default-options"
<script lang="ts">
  import { MultiSelect } from '$lib'

  let selected: string[] = $state([])
</script>

{#if selected?.length > 0}
  <pre><code>selected = {JSON.stringify(selected)}</code></pre>
{/if}

<MultiSelect
  allowUserOptions="append"
  bind:selected
  noMatchingOptionsMsg=""
  createOptionMsg={null}
/>
```

## Paste Multiple Values

`parse_paste` lets users paste comma or newline-separated text and split it into multiple options at once. Useful for email lists, tags, or any bulk input. Click a snippet below to copy, then paste into the input.

```svelte example id="parse-paste"
<script lang="ts">
  import { MultiSelect, CopyButton } from '$lib'

  let selected: string[] = $state([])
  let log: string[] = $state([])

  const snippets = [
    {
      label: `Comma-separated emails`,
      text: `alice@example.com, bob@test.org, carol@mail.net`,
    },
    { label: `Multi-word values`, text: `New York, Los Angeles, San Francisco` },
    { label: `Newline-separated`, text: `Red\nGreen\nBlue\nYellow` },
    { label: `Mixed commas & newlines`, text: `one, two\nthree, four` },
  ]
</script>

<div style="display: flex; flex-direction: column; gap: 0.4em; margin-bottom: 1em">
  {#each snippets as { label, text }}
    <div style="display: flex; align-items: center; gap: 0.5em">
      <CopyButton
        content={text}
        style="padding: 0.3em 0.7em; border-radius: 4px; border: 1px solid var(--sms-border, light-dark(lightgray, #555)); background: var(--sms-options-bg, light-dark(white, #333)); cursor: pointer; font-size: 0.85em; white-space: nowrap"
        labels={{ ready: label, success: `Copied!`, error: `Failed` }}
      />
      <code style="font-size: 0.85em; opacity: 0.7">{text}</code>
    </div>
  {/each}
</div>

<MultiSelect
  allowUserOptions="append"
  bind:selected
  noMatchingOptionsMsg=""
  createOptionMsg={null}
  parse_paste={(text) =>
    text
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)}
  oncreate={({ option }) => {
    if (String(option).length < 3) {
      log = [...log, `✗ rejected "${option}" (too short)`]
      return false
    }
    log = [...log, `+ ${option}`]
  }}
  onremove={({ option }) => (log = [...log, `- ${option}`])}
/>

<p style="margin-top: 0.5em">
  Selected ({selected.length}): {selected.join(', ') || 'none'}
</p>

{#if log.length > 0}
  <details open style="margin-top: 0.5em">
    <summary>Event log ({log.length})</summary>
    <pre style="max-height: 8em; overflow: auto; font-size: 0.85em"><code
        >{log.join('\n')}</code
      ></pre>
  </details>
{/if}
```
