## FileInput

A native file picker and drop zone with shared type, size and count validation. Parsing and uploading stay caller-owned; the component wraps your `on_files` callback with processing state, cancellation, rejection messages and retry.

### Minimal example

Choose or drop up to three text files. A new accepted selection replaces the previous files rather than appending. If no incoming file passes validation, the current selection stays.

```svelte example id="file-input-basic"
<script lang="ts">
  import { FileInput } from 'svelte-widgets'

  let files = $state<File[]>([])
</script>

<FileInput
  bind:files
  accept=".txt,.csv,text/plain,text/csv"
  multiple
  max_files={3}
  max_size={1000000}
  label="Choose text files"
/>
<p>{files.length ? `${files.length} files selected` : `No files selected yet.`}</p>
```

### Parse JSON with cancellation and retry

Select a valid JSON file to preview it, or a malformed one to see the error state. Throwing from `on_files` shows the error with a Retry button. The signal aborts when accepted files replace the selection, the operation is cancelled, a file is removed, the input becomes disabled or the component unmounts. `File.text()` cannot be cancelled, so check the signal before publishing its result.

```svelte example id="file-input-json"
<script lang="ts">
  import { FileInput, JsonTree } from 'svelte-widgets'

  let preview = $state<{ value: unknown }>()

  async function read_json(files: File[], signal: AbortSignal): Promise<void> {
    preview = undefined
    const text = await files[0].text()
    signal.throwIfAborted()
    preview = { value: JSON.parse(text) }
  }
</script>

<FileInput
  accept=".json,application/json"
  max_size={1000000}
  label="Choose a JSON file"
  on_files={read_json}
  on_remove={() => (preview = undefined)}
/>
{#if preview}
  <JsonTree value={preview.value} />
{:else}
  <p>No JSON preview available.</p>
{/if}
```

For uploads, build a `FormData`, pass the signal to `fetch` and throw when `response.ok` is false. Retry calls `on_files` again with the current files. Cancellation only ends the component's processing state; your callback must respect the signal to avoid stale results.

### Main API

| Prop                                        | Purpose                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bind:files`                                | Current accepted `File[]`, initially empty.                                                                |
| `accept`                                    | Comma-separated extensions, MIME types or MIME wildcards. Checked for both picker and drops.               |
| `multiple={false}`, `max_files`, `max_size` | Per-selection count and per-file byte limits, default unlimited. Without `multiple`, one file is accepted. |
| `on_files(files, signal)`                   | Parse or upload accepted files, synchronously or asynchronously.                                           |
| `on_reject(rejections)`                     | Called only when files are rejected, with `{ file, reason }` entries (reason `type`, `size` or `count`).   |
| `on_remove(file)`                           | Observe removal from the default file list.                                                                |
| `children(files)`                           | Replace the default list with a custom preview; provide your own removal controls if needed.               |
| `label`, `remove_label`, `disabled`         | Picker label, removal button text and disabled state.                                                      |

### Keyboard and feedback

Tab reaches the native file picker and the remove, cancel and retry buttons, so drag and drop is optional. Validation failures are announced through a status region, and asynchronous errors use TaskStatus. Client-side `accept` checks are user feedback only; validate content and limits again at your upload endpoint.

## ExportDestination

The save-side counterpart: a file name field plus, where the File System Access API is usable (not in frames cross-origin to the top page), a destination choice: browser downloads (default), a picked folder, or a native Save As dialog per file. `FileExportState` from `svelte-widgets/browser` holds the destination and validates the name. Its `run(task)` passes the task `{ filename, destination, open }`, so an export writing several files can refuse Save As (one dialog per click) before asking. `open(filename, mime, signal?)` checks the name before anything is encoded (a folder refuses existing names, best effort since the API has no exclusive create; Save As confirms overwrites in its own dialog) and resolves to a writer the task calls with the finished data. A dismissed Save As dialog (`open` rejects with `ExportCancelledError`) or the abort of a signal passed to `open` ends the export without an error message, and a picked file the export never wrote is removed while still empty.

```svelte example id="export-destination"
<script lang="ts">
  import { ExportDestination } from 'svelte-widgets'
  import { FileExportState } from 'svelte-widgets/browser'

  const export_state = new FileExportState(() => `notes`)
  const save_notes = () =>
    export_state.run(async ({ filename, open }) => {
      const write = await open(`${filename}.txt`, `text/plain`)
      await write(`Hello`)
    })
</script>

<ExportDestination state={export_state} />
<button onclick={save_notes} disabled={export_state.disabled}>Save as .txt</button>
```
