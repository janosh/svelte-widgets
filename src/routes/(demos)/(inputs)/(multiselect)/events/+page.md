## MultiSelect Events

This demo logs common selection, dropdown, search, activation, and native input events.

```svelte example id="multiselect-events-demo"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  const colors =
    `Red Green Blue Yellow Purple Pink Brown Black White Gray Orange Cyan Magenta Silver Gold Turquoise Violet Lime Indigo Navy`.split(
      ` `,
    )

  interface EventLogEntry {
    event: string
    data: string
    timestamp: string
    number: number
  }

  let events: EventLogEntry[] = $state([])
  let event_counter = $state(0)
  let selected_options: string[] = $state([])
  let allow_user_options = $state(true)

  function log_event(event_name: string, data: unknown): void {
    event_counter++
    events = [
      {
        event: event_name,
        data: JSON.stringify(data, null, 2) ?? String(data),
        timestamp: new Date().toLocaleTimeString(),
        number: event_counter,
      },
      ...events.slice(0, 9), // Keep last 10 events
    ]
  }
</script>

{#snippet color_option(option: string, idx?: number)}
  <span style="display: inline-flex; align-items: center; gap: 5pt">
    {#if idx !== undefined}{idx + 1}{/if}
    <span style={`background: ${option}; width: 1em; height: 1em; border-radius: 2pt`}
    ></span>
    {option}
  </span>
{/snippet}

<div class="demo-grid">
  <section class="demo-section">
    Select options, remove them, use "Remove all", create custom options, navigate with
    arrow keys, and interact with the input. Try selecting 5 options and adding a 6th to
    trigger `on_max_reached`, or selecting the same option twice to see `on_duplicate`.

    <label style="display: block; margin-block: 1em">
      <input type="checkbox" bind:checked={allow_user_options} />
      Allow user options
    </label>

    <MultiSelect
      options={colors}
      placeholder="Select colors or type to create custom..."
      {allow_user_options}
      create_option_msg={({ search_text }) => `Create custom color '${search_text}'`}
      max_select={5}
      on_add={(data) => log_event('on_add', data)}
      on_remove={(data) => log_event('on_remove', data)}
      on_remove_all={(data) => log_event('on_remove_all', data)}
      on_change={(data) => log_event('on_change', data)}
      on_create={(data) => log_event('on_create', data)}
      on_open={(data) => log_event('on_open', data)}
      on_close={(data) => log_event('on_close', data)}
      on_search={(data) => log_event('on_search', data)}
      on_max_reached={(data) => log_event('on_max_reached', data)}
      on_duplicate={(data) => log_event('on_duplicate', data)}
      on_activate={(data) => log_event('on_activate', data)}
      onblur={(event: FocusEvent) =>
        log_event('onblur', {
          type: event.type,
          target: (event.target as HTMLElement)?.tagName,
        })}
      onclick={(event: MouseEvent) =>
        log_event('onclick', {
          type: event.type,
          target: (event.target as HTMLElement)?.tagName,
        })}
      onfocus={(event: FocusEvent) =>
        log_event('onfocus', {
          type: event.type,
          target: (event.target as HTMLElement)?.tagName,
        })}
      onkeydown={(event: KeyboardEvent) =>
        log_event('onkeydown', {
          type: event.type,
          key: event.key,
          code: event.code,
        })}
      bind:selected={selected_options}
    >
      {#snippet children({ idx, option })}
        {@render color_option(option, idx)}
      {/snippet}
    </MultiSelect>
  </section>

  <section class="event-log">
    <header class="log-header">
      <h3 style="margin: 0">Event Log</h3>
      <button
        onclick={() => {
          events = []
          event_counter = 0
        }}
      >
        Clear
      </button>
    </header>

    {#each events as entry}
      <article class="log-entry">
        <header class="entry-header">
          <span
            ><span style="color: light-dark(#999, #666)">#{entry.number}</span>
            <span class="event-name">{entry.event}</span></span
          >
          <span class="timestamp">{entry.timestamp}</span>
        </header>
        <pre class="log-data">{entry.data}</pre>
      </article>
    {:else}
      <p class="no-events">No events yet. Start clicking around!</p>
    {/each}
  </section>
</div>

<style>
  .demo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: 1em;
    margin: 2em 0;
  }
  .demo-section {
    background: light-dark(#f9f9f9, rgba(255, 255, 255, 0.05));
    padding: 1.5em;
    border-radius: 8px;
  }
  .event-log {
    background: light-dark(#f5f5f5, rgba(0, 0, 0, 0.3));
    border-radius: 8px;
    max-height: 60vh;
    overflow-y: auto;
    display: grid;
    gap: 1em;
  }
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--surface);
    height: max-content;
    padding: 1pt 9pt;
  }
  .log-entry {
    background: light-dark(#fff, rgba(255, 255, 255, 0.05));
    border-radius: 4px;
    padding: 1ex 1em;
    border-left: 3px solid #4299e1;
  }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5em;
  }
  .event-name {
    font-weight: bold;
    color: #4299e1;
    font-size: 0.9em;
  }
  .timestamp {
    font-size: 0.8em;
    color: light-dark(#666, #a0aec0);
  }
  .log-data {
    background: light-dark(#eee, rgba(0, 0, 0, 0.3));
    padding: 0.5em;
    border-radius: 3px;
    font-size: 0.8em;
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .no-events {
    color: light-dark(#666, #a0aec0);
    font-style: italic;
    text-align: center;
    padding: 2em;
  }
</style>
```

### Covered Event Reference

The tables below list only the events wired up in the demo above. `MultiSelect` also emits `on_select_all`, `on_range_select`, `on_reorder`, `on_group_toggle`, `on_collapse_all`, `on_expand_all`, and `on_parsed_paste` — see [`MultiSelectEvents`](https://github.com/janosh/svelte-widgets/blob/-/src/lib/types.ts) for their payloads.

#### Custom Events

| Event            | Description                                      | Data Structure                                                                                                          |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `on_add`         | Fired when an option is added to selection       | `{ option: T, selected: T[] }`                                                                                          |
| `on_remove`      | Fired when an option is removed from selection   | `{ option: T, selected: T[] }`                                                                                          |
| `on_remove_all`  | Fired when all options are removed               | `{ options: T[] }`                                                                                                      |
| `on_change`      | Fired for any selection change                   | `{ option?: T, options?: T[], type: 'add' \| 'remove' \| 'remove_all' \| 'select_all' \| 'range_select' \| 'reorder' }` |
| `on_create`      | Fired when user creates a custom option          | `{ option: T }`                                                                                                         |
| `on_open`        | Fired when dropdown opens                        | `{ event: Event }`                                                                                                      |
| `on_close`       | Fired when dropdown closes                       | `{ event: Event }`                                                                                                      |
| `on_search`      | Fired (debounced 150ms) when search text changes | `{ search_text: string, matching_options: T[] }`                                                                        |
| `on_max_reached` | Fired when user tries to exceed max_select       | `{ selected: T[], max_select: number, attempted_option: T }`                                                            |
| `on_duplicate`   | Fired when user tries to add duplicate           | `{ option: T }`                                                                                                         |
| `on_activate`    | Fired on keyboard navigation through options     | `{ option: T \| null, index: number \| null }`                                                                          |

#### Native DOM Events

| Event       | Description         |
| ----------- | ------------------- |
| `onblur`    | Input loses focus   |
| `onclick`   | Input is clicked    |
| `onfocus`   | Input gains focus   |
| `onkeydown` | Key is pressed down |

### Event Handling Tips

1. **Type Safety**: For better type checking in TypeScript projects, use the `MultiSelectEvents` interface:

   ```ts
   <script lang="ts">
    import type { MultiSelectEvents } from 'svelte-widgets'

     const on_add: MultiSelectEvents['on_add'] = (data) => {
       console.log(`on_add`, data)
     }
   </script>

   <MultiSelect {on_add} options={[{ label: `foo` }]} />
   ```

   Native DOM event handlers like `onblur`, `onfocus`, `onkeydown`, etc. are forwarded from the `<input>` element and use standard DOM event types (e.g. `FocusEvent`, `KeyboardEvent`).

1. **Custom Options**: The `on_create` event only fires when `allow_user_options` is enabled and users type text that doesn't match existing options.

1. **Search and Navigation**: The `on_search` event is debounced (150ms) to avoid excessive callbacks while typing. `on_activate` only fires during keyboard navigation (arrow keys), not on mouse hover. `on_duplicate` fires when a duplicate is rejected with `duplicates={false}` (the default) or `duplicates="case-insensitive"`.
