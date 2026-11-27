<script lang="ts">
  import type { ExportTarget, FileExportState } from './browser/file-export.svelte.ts'
  import { file_pickers, PICKER_ID } from './internal/file-pickers'
  import { to_error } from './utils'

  let {
    state: export_state,
    disabled = false,
  }: { state: FileExportState; disabled?: boolean } = $props()
  let choosing = $state(false)
  // the last chosen folder, kept so its radio can be picked again after another destination
  let folder = $state.raw<FileSystemDirectoryHandle | null>(null)
  const pickers = file_pickers()
  const name = $props.id()
  const options = $derived<[ExportTarget, string][]>([
    [`downloads`, `Downloads`],
    ...(pickers.save
      ? [[`save-as`, `Ask each time`] satisfies [ExportTarget, string]]
      : []),
    ...(folder ? [[folder, `${folder.name}/`] satisfies [ExportTarget, string]] : []),
  ])
  async function choose_folder() {
    if (!pickers.directory || choosing) return
    choosing = true
    export_state.error = ``
    try {
      folder = await pickers.directory({
        id: PICKER_ID,
        mode: `readwrite`,
        startIn: folder ?? `downloads`,
      })
      export_state.destination = folder
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
    where the browser or the host app's download hook sends them, which this group cannot name -->
  {#if pickers.directory || pickers.save}
    <fieldset class="destination">
      <legend>Save to</legend>
      {#each options as [value, label] (label)}
        <label
          ><input
            type="radio"
            {name}
            checked={export_state.destination === value}
            onchange={() => (export_state.destination = value)}
          />{label}</label
        >
      {/each}
      {#if pickers.directory}
        <button type="button" onclick={choose_folder}>Choose folder…</button>
      {/if}
    </fieldset>
  {/if}
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
    .destination {
      display: flex;
      align-items: center;
      gap: 0.5em;
      flex-wrap: wrap;
    }
    .destination {
      border: 0;
      padding: 0;
      margin: 0;
      legend {
        float: left;
      }
    }
    input {
      flex: 1;
      min-width: 0;
      font: inherit;
      line-height: normal; /* the shorthand above resets it to the pane's taller 1.5 */
    }
  }
</style>
