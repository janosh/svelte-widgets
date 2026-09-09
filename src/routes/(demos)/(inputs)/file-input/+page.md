## FileInput

A native file picker and drop zone sharing type, size and count validation. File parsing and uploading remain caller-owned; the component provides processing, cancellation, rejection messages and retry around your `on_files` callback.

### Minimal example

Choose or drop up to three text files. A new accepted selection replaces the previous files; it does not append to them. Rejected files leave the current selection intact when no incoming files pass validation.

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

Select a valid JSON file to preview it, or a malformed one to exercise the error state. Throwing from `on_files` displays the error with a Retry button. The supplied signal is aborted when accepted files replace the selection, the operation is cancelled, a file is removed, the input becomes disabled or the component unmounts. `File.text()` itself cannot be cancelled, so check the signal before publishing its result.

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

For uploads, build a `FormData` and pass the signal to `fetch`; throw when `response.ok` is false. Retry calls `on_files` again with the current accepted files. Cancellation stops the component's processing state, but your callback must respect the signal to prevent stale results.

### Main API

| Prop                                        | Purpose                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bind:files`                                | Current accepted `File[]`, initially empty.                                                  |
| `accept`                                    | Comma-separated extensions, MIME types or MIME wildcards. Checked for both picker and drops. |
| `multiple={false}`, `max_files`, `max_size` | Per-selection count and per-file byte limits. Limits otherwise default to infinity.          |
| `on_files(files, signal)`                   | Parse or upload accepted files, synchronously or asynchronously.                             |
| `on_reject(rejections)`                     | Receive `{ file, reason }` entries with reason `type`, `size` or `count`.                    |
| `on_remove(file)`                           | Observe removal from the default file list.                                                  |
| `children(files)`                           | Replace the default list with a custom preview; provide your own removal controls if needed. |
| `label`, `remove_label`, `disabled`         | Picker label, removal button text and disabled state.                                        |

### Keyboard and feedback

Tab reaches the native file picker and removal, cancel or retry buttons. Activate them with the browser's usual keyboard controls; drag and drop is optional. Validation failures are announced through a status region, and asynchronous errors use TaskStatus. Client-side `accept` checks are for user feedback; validate content and limits again at your upload endpoint.
