<script lang="ts">
  import { MultiSelect } from '$lib'
  import { get_label } from '$lib/utils'
  import { languages, octicons } from '$site/options'

  let open_modal = $state(false)
  let selected_languages = $state<string[]>([])
  let selected_octicons = $state<string[]>([])
  let modal_element = $state<HTMLDivElement>()

  function close_modal(): void {
    open_modal = false
    document.querySelector<HTMLButtonElement>(`#open-modal`)?.focus()
  }

  function handle_modal_keydown(event: KeyboardEvent): void {
    if (!open_modal) return
    if (event.key === `Escape`) {
      const multiselect =
        event.target instanceof HTMLElement
          ? event.target.closest(`div.multiselect`)
          : null
      if (multiselect?.querySelector(`[role="combobox"][aria-expanded="true"]`)) return
      return close_modal()
    }
    if (event.key !== `Tab` || !modal_element) return

    const focusable_elements = [
      ...modal_element.querySelectorAll<HTMLElement>(
        `button, input:not([tabindex="-1"]), [tabindex="0"]`,
      ),
    ]
    const active_idx = focusable_elements.indexOf(document.activeElement as HTMLElement)
    const boundary_idx = event.shiftKey ? 0 : focusable_elements.length - 1
    if (active_idx !== -1 && active_idx !== boundary_idx) return

    event.preventDefault()
    focusable_elements.at(event.shiftKey ? -1 : 0)?.focus()
  }
</script>

<svelte:window onkeydowncapture={handle_modal_keydown} />

<h2>Portalled MultiSelect in Modal Demo</h2>

<button
  id="open-modal"
  onclick={() => (open_modal = true)}
  style="padding: 3pt 6pt; margin: 1em auto"
>
  Open Modal
</button>

{#if open_modal}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -- backdrop click-outside is a pointer convenience; Escape (svelte:window) covers keyboard users. role=button here would invalidly nest the dialog inside an interactive widget -->
  <div
    class="modal-backdrop"
    onclick={(event) => {
      if (event.target === event.currentTarget) close_modal()
    }}
    role="presentation"
  >
    <div
      bind:this={modal_element}
      class="modal-content modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      {@attach (node) => node.focus()}
    >
      <h2 id="modal-title">Modal: Languages & Octicons</h2>
      <MultiSelect
        bind:selected={selected_languages}
        options={languages}
        portal={{ active: true }}
        placeholder="Choose languages..."
        style="margin-bottom: 1em"
      />
      <MultiSelect
        bind:selected={selected_octicons}
        options={octicons}
        portal={{ active: true }}
        placeholder="Choose octicons..."
      />
      <p>Selected Languages: {selected_languages.map(get_label).join(`, `) || `None`}</p>
      <p>Selected Octicons: {selected_octicons.map(get_label).join(`, `) || `None`}</p>
      <button onclick={close_modal}>Close Modal</button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: grid;
    place-items: center;
  }
  .modal-content {
    background-color: var(--modal-bg, #2d2d2d);
    padding: 10px 20px 20px;
    border-radius: 8pt;
  }
  .modal-content h2 {
    margin-top: 0;
  }
  .modal-content button {
    background-color: #555;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4pt;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-top: 1em; /* Add some space above the close button */
  }
  .modal-content button:hover {
    background-color: #666;
  }
</style>
