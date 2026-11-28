## Dialogs

A promise-based prompt queue and three headless DOM helpers that go with it.

### `request_choice` and `ConfirmDialog`

`request_choice(body, title, choices, dismiss_id)` returns a promise that resolves to the id of the picked choice, so asking a question reads like a function call. Mount one `ConfirmDialog` high in the tree and any code below it can ask.

- **Requests queue rather than overlap.** Only the head of the queue is on screen and the buttons are rebuilt between questions, so a click meant for one prompt cannot answer the next. Press _Ask both at once_ below and answer fast to see the second question survive a double-click.
- **`dismiss_id` decides what Escape means.** A dismissal resolves with that id, never with the accented choice, so a stray keypress is never read as consent.

Any number of choices works. `ask_confirm(body, title, confirm_label = 'OK', cancel_label = 'Cancel')` is the two-button shorthand and resolves to a boolean. A body can be text or a trusted Svelte snippet. `ask_prompt(body, title, options)` adds a text field, returns `string | null` and keeps the dialog open while its validator returns an error message. `input_props` on `ConfirmDialog` applies to every prompt's field; a request's own placeholder wins when set, and `oninput` chains so validation still clears.

`ConfirmDialog`, `CommandMenu` and `Dialog` are native modal dialogs using `closedby` for Escape and backdrop dismissal, so the browser owns top-layer stacking, modality and light-dismiss order. The backdrop dims by default: `backdrop_dim={false}` turns that off, `backdrop_blur` adds blur, and the `--*-backdrop` and `--*-backdrop-filter` CSS variables set their intensity.

```svelte example id="confirm-dialog-demo"
<script lang="ts">
  import ConfirmDialog from 'svelte-widgets/ConfirmDialog.svelte'
  import { ask_confirm, ask_prompt, request_choice } from 'svelte-widgets/dialogs'

  let answers = $state<string[]>([])
  const record = (answer: string) => (answers = [answer, ...answers].slice(0, 5))

  const ask_delete = async () => {
    const ok = await ask_confirm(`Delete all build artifacts?`, `Clean up`, `Delete`)
    record(`ask_confirm resolved ${ok}`)
  }

  const ask_quit = async () => {
    const answer = await request_choice(
      `Your changes have not been saved.`,
      `Quit editor`,
      [
        { id: `cancel`, label: `Keep editing` },
        { id: `discard`, label: `Discard`, tone: `danger` },
        { id: `save`, label: `Save and quit`, tone: `accent` },
      ],
      `cancel`,
    )
    record(`request_choice resolved ${answer}`)
  }

  const ask_name = async () => {
    const name = await ask_prompt(`Choose a display name.`, `Profile`, {
      input_label: `Display name`,
      placeholder: `Ada`,
      validate: (value) =>
        value.trim().length < 2 ? `Enter at least two characters` : undefined,
    })
    record(`ask_prompt resolved ${name ?? `canceled`}`)
  }

  const ask_rich = async () => {
    const ok = await ask_confirm(
      { kind: `snippet`, snippet: rich_body },
      `Publish package`,
      `Publish`,
    )
    record(`rich ask_confirm resolved ${ok}`)
  }
</script>

{#snippet rich_body()}
  <p>Publish <strong>svelte-widgets</strong> with the current changelog?</p>
{/snippet}

<ConfirmDialog />

<div style="display: flex; gap: 6pt; flex-wrap: wrap">
  <button type="button" onclick={ask_delete}>Ask to delete</button>
  <button type="button" onclick={ask_quit}>Ask to quit</button>
  <button type="button" onclick={ask_name}>Ask for a name</button>
  <button type="button" onclick={ask_rich}>Ask with rich body</button>
  <button
    type="button"
    onclick={() => {
      ask_delete()
      ask_quit()
    }}
  >
    Ask both at once
  </button>
</div>

<p style="margin: 8pt 0 0"><strong>Answers</strong> (newest first):</p>
{#if answers.length}
  <ul style="margin: 6pt 0 0; padding-left: 1.25em">
    {#each answers as answer, idx (idx)}
      <li><code>{answer}</code></li>
    {/each}
  </ul>
{:else}
  <p style="margin: 6pt 0 0; opacity: 0.8">Nothing answered yet.</p>
{/if}
```

### `print_page`

Prints the page with an optional suggested PDF filename, temporarily setting `document.title` and restoring it after printing, cancellation or an error. Control visible content and pagination with your own `@media print` CSS.

```svelte example id="print-page-demo"
<script lang="ts">
  import { format_print_filename, print_page } from 'svelte-widgets/browser'
</script>

<button
  type="button"
  onclick={() => print_page({ filename: format_print_filename(`widgets-demo`) })}
>
  Print this page
</button>
```

### `create_clipboard_feedback`

`create_clipboard_feedback(duration_ms = 1000, on_error?)` returns reactive "recently copied" state keyed by string, for UIs that render their own copy affordances where `CopyButton`'s markup is in the way. Each key runs its own timer, and re-copying a key restarts it so the checkmark cannot blink out early. Without `on_error`, a failed write throws. For a one-off copy with a toast beside the anchor, call `copy_text(text, { anchor })` from `svelte-widgets/browser` instead.

```svelte example id="clipboard-feedback-demo"
<script lang="ts">
  import { create_clipboard_feedback } from 'svelte-widgets/browser'

  const { copied, copy } = create_clipboard_feedback(1500, (error) =>
    console.error(error),
  )
  const commands = [
    [`install`, `npm install svelte-widgets`],
    [`test`, `npx vitest run`],
    [`build`, `npx vp build`],
  ]
</script>

<table>
  <tbody>
    {#each commands as [key, command] (key)}
      <tr>
        <td><code>{command}</code></td>
        <td>
          <button class="copy-feedback" type="button" onclick={() => copy(command, key)}>
            <span>{copied.has(key) ? `Copied!` : `Copy`}</span>
            <span class="copy-width" aria-hidden="true">Copied!</span>
          </button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .copy-feedback {
    display: inline-grid;
    white-space: nowrap;
    > span {
      grid-area: 1 / 1;
    }
    > .copy-width {
      visibility: hidden;
    }
  }
</style>
```

### `files_from_data_transfer`

`DataTransfer.files` stops at the top level: a dropped directory shows up as one zero-byte file. This walks the drop with `webkitGetAsEntry` instead, expanding directories depth-first (draining `readEntries`, which returns at most 100 children per call), and falls back to the flat file list when the entry API yields nothing. It rejects rather than returning a partial list when a tree nests past 32 levels or expands past 20 000 directories (the entry API resolves symlinks, so a link to an ancestor would recurse forever), hence the `try` in the handler below.

```svelte example id="file-drop-demo"
<script lang="ts">
  import { files_from_data_transfer } from 'svelte-widgets/file-drop'

  let dropped = $state<File[]>([])
  let is_dragging = $state(false)
  let drop_error = $state(``)

  const handle_drop = async (event: DragEvent) => {
    event.preventDefault()
    is_dragging = false
    if (!event.dataTransfer) return
    // rejects past its nesting/branching caps, which a symlink cycle reaches; unhandled, the
    // drop would look like it silently did nothing
    try {
      dropped = await files_from_data_transfer(event.dataTransfer)
      drop_error = ``
    } catch (error) {
      drop_error = String(error)
    }
  }
</script>

<div
  role="region"
  aria-label="File drop zone"
  ondrop={handle_drop}
  ondragover={(event) => {
    event.preventDefault()
    is_dragging = true
  }}
  ondragleave={() => (is_dragging = false)}
  style="padding: 2em; text-align: center; border: 2px dashed {is_dragging
    ? `cornflowerblue`
    : `gray`}; border-radius: 6pt"
>
  Drop files or whole folders here
</div>

{#if drop_error}
  <p style="margin: 8pt 0 0; color: tomato">{drop_error}</p>
{/if}

{#if dropped.length}
  <p style="margin: 8pt 0 0">{dropped.length} files:</p>
  <ul style="margin: 6pt 0 0; padding-left: 1.25em; max-height: 12em; overflow: auto">
    {#each dropped as file (file)}
      <li><code>{file.name}</code> — {file.size} bytes</li>
    {/each}
  </ul>
{/if}
```
