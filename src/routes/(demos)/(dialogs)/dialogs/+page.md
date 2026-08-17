## Dialogs

A promise-based prompt queue and three headless DOM helpers that go with it.

### `request_choice` and `ConfirmDialog`

`request_choice(message, title, choices, dismiss_id)` returns a promise that resolves to
the id of the choice the user picked, so asking a question reads like a function call
instead of a callback dance. Mount one `ConfirmDialog` high in the tree and any code
below it can ask.

Two details carry their weight:

- **Requests queue rather than overlap.** Two prompts racing in one modal would leave the
  second answered by a click meant for the first, so only the head of the queue is on
  screen and the buttons are rebuilt between questions. Press _Ask both at once_ below and
  answer fast to see the second question survive a double-click.
- **`dismiss_id` decides what Escape means.** A dismissal resolves with that id, never with
  the accented choice, so a stray keypress is never read as consent.

Choices are arbitrary in number. `ask_confirm(body, title, confirm_label = 'OK')` is the two-button shorthand and resolves to a boolean. A body can be text or a trusted Svelte snippet. `ask_prompt(body, title, options)` adds a text field, returns `string | null` and keeps the dialog open when its validator returns an error message. Configure the shared prompt field with `input_props` on `ConfirmDialog`; these attributes apply to every prompt, request-specific placeholders win when set, and `oninput` chains so validation still clears.

`ConfirmDialog`, `CommandMenu`, and `Dialog` use native modal dialogs with `closedby` for Escape and backdrop dismissal; the browser owns top-layer stacking, modality, and light-dismiss ordering. Their backdrop dims the page by default; set `backdrop_dim={false}` to disable it or `backdrop_blur` to opt into blur. The existing `--*-backdrop` and `--*-backdrop-filter` CSS variables control intensity.

```svelte example id="confirm-dialog-demo"
<script lang="ts">
  import ConfirmDialog from '$lib/ConfirmDialog.svelte'
  import { ask_confirm, ask_prompt, request_choice } from '$lib/dialogs.svelte'

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

### `print_element`

Printing a single element well takes two things the print dialog gives no other handle
on. `filename` swaps `document.title` for the duration, since that is where browsers get
the suggested PDF name from, and `single_page` measures the element and injects an
`@page` rule sized to it so a long element prints as one continuous sheet instead of
being chopped across pages. Both are undone on `afterprint`.

`page_width_mm` defaults to A4 portrait, and `px_per_inch` to the CSS definition of 96.

```svelte example id="print-element-demo"
<script lang="ts">
  import { format_print_filename, print_element } from '$lib/print'

  let receipt = $state<HTMLElement | null>(null)
  let single_page = $state(true)
  const filename = $derived(format_print_filename(`widgets-demo`))
</script>

<div style="display: flex; gap: 12pt; align-items: center; flex-wrap: wrap">
  <button
    type="button"
    onclick={() => receipt && print_element(receipt, { filename, single_page })}
  >
    Print the box below
  </button>
  <label>
    <input type="checkbox" bind:checked={single_page} />
    single_page
  </label>
  <code>{filename}.pdf</code>
</div>

<section
  bind:this={receipt}
  style="margin-block-start: 8pt; padding: 8pt; border: 1px solid gray; border-radius: 4pt"
>
  <h3 style="margin: 0">Printable region</h3>
  <p style="margin: 4pt 0 0">
    Only this box is measured. With <code>single_page</code> on, the page is sized to its height
    so nothing spills onto a second sheet.
  </p>
</section>
```

### `create_clipboard_feedback`

Reactive "recently copied" state keyed by string, for UIs that render their own copy
affordances and only need the state `CopyButton` keeps internally. Each key runs its own
timer, and re-copying a key restarts that timer so the checkmark cannot blink out early.

```svelte example id="clipboard-feedback-demo"
<script lang="ts">
  import { create_clipboard_feedback } from '$lib/clipboard.svelte'

  const { copied, copy } = create_clipboard_feedback(1500, (error) =>
    console.error(error),
  )
  const commands = [
    [`install`, `npm install svelte-widgets`],
    [`test`, `npx vp test --run`],
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

`DataTransfer.files` stops at the top level: drop a directory and it reports a single
zero-byte file named after the directory. This walks the drop with `webkitGetAsEntry`
instead, expanding directories depth-first (draining `readEntries`, which hands back at
most 100 children per call), and falls back to the flat file list when the entry API
yields nothing. It rejects rather than returning a partial list when a tree nests past 32
levels or expands past 20 000 directories — the entry API resolves symlinks, so a link to
an ancestor would otherwise recurse without end — which is why the handler below catches.

```svelte example id="file-drop-demo"
<script lang="ts">
  import { files_from_data_transfer } from '$lib/file-drop'

  let dropped = $state<File[]>([])
  let is_dragging = $state(false)
  let drop_error = $state(``)

  const handle_drop = async (event: DragEvent) => {
    event.preventDefault()
    is_dragging = false
    if (!event.dataTransfer) return
    // rejects on a tree that nests or branches past its caps, which a symlink cycle
    // reaches — unhandled, the drop would look like it silently did nothing
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
