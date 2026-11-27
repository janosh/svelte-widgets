<script lang="ts">
  import type { FileExportState } from './browser/file-export.svelte.ts'
  import { file_pickers, PICKER_ID } from './internal/file-pickers'
  import { to_error } from './utils'

  let {
    state: export_state,
    disabled = false,
  }: { state: FileExportState; disabled?: boolean } = $props()
  let choosing = $state(false)
  const pickers = file_pickers()
  async function choose_folder() {
    if (!pickers.directory || choosing) return
    choosing = true
    export_state.error = ``
    const { destination } = export_state
    try {
      export_state.destination = await pickers.directory({
        id: PICKER_ID,
        mode: `readwrite`,
        startIn: typeof destination === `string` ? `downloads` : destination,
      })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === `AbortError`)) {
        export_state.error = to_error(error).message
        console.error(`Cannot choose export folder:`, error)
      }
    } finally {
      choosing = false
    }
  }
</script>

<fieldset class="export-destination" disabled={disabled || export_state.busy || choosing}>
  <label>
    File name
    <input
      type="text"
      bind:value={export_state.filename}
      aria-invalid={Boolean(export_state.filename_error)}
      title="Base file name; the selected format adds its extension"
    />
  </label>
  <!-- Only a browser with a file picker has a destination to choose; elsewhere exports go
    where the browser or the host app's download hook sends them, which this row cannot name -->
  {#if pickers.directory || pickers.save}
    {@const { destination } = export_state}
    <div class="destination-row">
      <span>Save to</span>
      <span
        class="folder-name"
        title={typeof destination === `string` ? undefined : destination.name}
      >
        {destination === `downloads`
          ? `Browser downloads`
          : destination === `save-as`
            ? `Ask for each file`
            : `${destination.name}/`}
      </span>
      <!-- one toggle per destination, always rendered so a click never removes the focused
        button; aria-pressed marks the current one -->
      {#if pickers.directory}
        <button
          type="button"
          aria-pressed={typeof destination !== `string`}
          onclick={choose_folder}
          title="Choose a folder before exporting">Choose folder…</button
        >
      {/if}
      {#if pickers.save}
        <button
          type="button"
          aria-pressed={destination === `save-as`}
          onclick={() => (export_state.destination = `save-as`)}
          title="Open a Save As dialog for every export">Ask each time</button
        >
      {/if}
      <button
        type="button"
        aria-pressed={destination === `downloads`}
        onclick={() => (export_state.destination = `downloads`)}
        title="Save to browser downloads">Downloads</button
      >
    </div>{/if}
</fieldset>
{#if export_state.filename_error || export_state.error}
  <div role="alert">{export_state.filename_error || export_state.error}</div>
{/if}

<style>
  .export-destination {
    display: grid;
    gap: 0.5em;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    width: 100%;
    label,
    .destination-row {
      display: flex;
      align-items: center;
      gap: 0.5em;
      flex-wrap: wrap;
    }
    input {
      flex: 1;
      min-width: 0;
      font: inherit;
      line-height: normal; /* the shorthand above resets it to the pane's taller 1.5 */
    }
    .folder-name {
      flex: 1;
      overflow-wrap: anywhere;
    }
  }
</style>
