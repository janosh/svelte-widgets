## `file_drop`

`file_drop` expands directories, applies file-input MIME/extension filtering and reports processing errors. Drops without accepted files are ignored. `on_files` receives an `AbortSignal`; each newer accepted drop or cleanup/recreation cooperatively aborts the previous callback. `disabled` is read on every drag event, so passing a getter (`get disabled() { return busy }`) toggles it without recreating the attachment. A disabled zone shows the no-drop cursor and leaves drops to any drop zone around it. Pass `on_urls` to also accept link drags: a drop carrying no files delivers its `text/uri-list` entries instead. URLs bypass `accept`, which only filters files. Pass `queue: true` to deliver every drop in order, each once the previous callback settles, instead of a newer drop superseding the one before it; queued callbacks' signals abort only on teardown. A drop that an inner element or a capture-phase handler already default-prevented is treated as claimed and only resets the drag state.

```svelte example id="attachments-file-drop"
<script lang="ts">
  import { file_drop } from 'svelte-widgets/attachments'
  import { filter_accepted_files } from 'svelte-widgets/file-drop'

  let names = $state<string[]>([])
  let drag_active = $state(false)
  const accepted_file_types = `image/*,.pdf`
  const allow_multiple = true
  const show_files = (files: File[]) => (names = files.map(({ name }) => name))
</script>

<label
  data-active={drag_active}
  style="display: block; padding: 1rem; border: 1px dashed currentColor"
  {@attach file_drop({
    accept: accepted_file_types,
    multiple: allow_multiple,
    on_drag_active: (active) => (drag_active = active),
    on_files: async (files, signal) => {
      // `signal` aborts on a newer drop and on teardown, but not for the picker below, which
      // could win a race with this await; every writer replaces `names`, so its identity
      // settles who was last
      const reported = names
      await Promise.all(files.map((file) => file.arrayBuffer()))
      if (!signal.aborted && names === reported) show_files(files)
    },
    on_error: (error) => (names = [`Error: ${String(error)}`]),
  })}
>
  {drag_active
    ? `Release files`
    : `Drop images or PDFs (${accepted_file_types}; multiple: ${allow_multiple})`}
  <input
    type="file"
    accept={accepted_file_types}
    multiple={allow_multiple}
    onchange={(event) =>
      show_files(
        filter_accepted_files(
          event.currentTarget.files ?? [],
          accepted_file_types,
          allow_multiple,
        ),
      )}
  />
</label>
<p aria-live="polite">{names.join(`, `) || `No files selected`}</p>
```
