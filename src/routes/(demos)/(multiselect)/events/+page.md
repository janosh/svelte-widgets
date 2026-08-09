## MultiSelect Events

This demo logs common selection, dropdown, search, activation, and native input events.

```svelte example id="multiselect-events"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { ColorSnippet } from '$site'
  import { colors } from '$site/options'

  interface EventLogEntry {
    event: string
    data: string
    timestamp: string
    number: number
  }

  let events: EventLogEntry[] = $state([])
  let event_counter = $state(0)
  let selected_options: string[] = $state([])
  let allowUserOptions = $state(true)

  function log_event(event_name: string, data: unknown): void {
    event_counter++
    events = [
      {
        event: event_name,
        data: JSON.stringify(data, null, 2),
        timestamp: new Date().toLocaleTimeString(),
        number: event_counter,
      },
      ...events.slice(0, 9), // Keep last 10 events
    ]
  }
</script>

<div class="demo-grid">
  <section class="demo-section">
    Select options, remove them, use "Remove all", create custom options, navigate with
    arrow keys, and interact with the input. Try selecting 5 options and adding a 6th to
    trigger `onmaxreached`, or selecting the same option twice to see `onduplicate`.

    <label style="display: block; margin-block: 1em">
      <input type="checkbox" bind:checked={allowUserOptions} />
      Allow user options
    </label>

    <MultiSelect
      options={colors}
      placeholder="Select colors or type to create custom..."
      {allowUserOptions}
      createOptionMsg={({ searchText }) => `Create custom color '${searchText}'`}
      maxSelect={5}
      onadd={(data) => log_event('onadd', data)}
      onremove={(data) => log_event('onremove', data)}
      onremoveAll={(data) => log_event('onremoveAll', data)}
      onchange={(data) => log_event('onchange', data)}
      oncreate={(data) => {
        log_event('oncreate', data)
        return undefined
      }}
      onopen={(data) => log_event('onopen', data)}
      onclose={(data) => log_event('onclose', data)}
      onsearch={(data) => log_event('onsearch', data)}
      onmaxreached={(data) => log_event('onmaxreached', data)}
      onduplicate={(data) => log_event('onduplicate', data)}
      onactivate={(data) => log_event('onactivate', data)}
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
        <ColorSnippet {idx} {option} />
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
    grid-template-columns: 1fr 1fr;
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

The tables below list only the events wired up in the demo above. `MultiSelect` also emits `onselectAll`, `onrangeSelect`, `onreorder`, `ongroupToggle`, `oncollapseAll`, `onexpandAll`, `onparsed_paste`, `onundo` and `onredo` — see [`MultiSelectEvents`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/types.ts) for their payloads.

#### Custom Events

| Event          | Description                                      | Data Structure                                                                                                       |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `onadd`        | Fired when an option is added to selection       | `{ option: T, selected: T[] }`                                                                                       |
| `onremove`     | Fired when an option is removed from selection   | `{ option: T, selected: T[] }`                                                                                       |
| `onremoveAll`  | Fired when all options are removed               | `{ options: T[] }`                                                                                                   |
| `onchange`     | Fired for any selection change                   | `{ option?: T, options?: T[], type: 'add' \| 'remove' \| 'removeAll' \| 'selectAll' \| 'rangeSelect' \| 'reorder' }` |
| `oncreate`     | Fired when user creates a custom option          | `{ option: T }`                                                                                                      |
| `onopen`       | Fired when dropdown opens                        | `{ event: Event }`                                                                                                   |
| `onclose`      | Fired when dropdown closes                       | `{ event: Event }`                                                                                                   |
| `onsearch`     | Fired (debounced 150ms) when search text changes | `{ searchText: string, matchingOptions: T[] }`                                                                       |
| `onmaxreached` | Fired when user tries to exceed maxSelect        | `{ selected: T[], maxSelect: number, attemptedOption: T }`                                                           |
| `onduplicate`  | Fired when user tries to add duplicate           | `{ option: T }`                                                                                                      |
| `onactivate`   | Fired on keyboard navigation through options     | `{ option: T \| null, index: number \| null }`                                                                       |

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
    import type { MultiSelectEvents } from '$lib/types'

     const onadd: MultiSelectEvents['onadd'] = (data) => {
       console.log(`onadd`, data)
     }
   </script>

   <MultiSelect {onadd} options={[{ label: `foo` }]} />
   ```

   Native DOM event handlers like `onblur`, `onfocus`, `onkeydown`, etc. are forwarded from the `<input>` element and use standard DOM event types (e.g. `FocusEvent`, `KeyboardEvent`).

1. **Custom Options**: The `oncreate` event only fires when `allowUserOptions` is enabled and users type text that doesn't match existing options.

1. **New Events**: The `onsearch` event is debounced (150ms) to avoid excessive callbacks while typing. `onactivate` only fires during keyboard navigation (arrow keys), not on mouse hover. `onduplicate` only fires when `duplicates={false}` (the default).
