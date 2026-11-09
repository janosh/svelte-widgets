<script lang="ts">
  // Date/time display-mode picker for a DataTable header: a calendar button opening a
  // listbox of the modes the column's kind supports. The host owns `open` (only one header
  // popover may be open at a time) and persists the chosen mode itself through `on_change`.
  import type { DateTimeFormatMode } from './data-table'
  import { DATETIME_MODE_LABELS } from './data'
  import { html_to_text } from '../utils'
  import Icon from '../Icon.svelte'
  import { anchored_popover, close_before_removal, tooltip } from '../attachments/index'
  import { Calendar } from '../icons'

  let {
    col_label,
    mode,
    options,
    open,
    on_toggle,
    on_change,
  }: {
    col_label: string
    mode: DateTimeFormatMode
    options: DateTimeFormatMode[]
    open: boolean
    on_toggle: () => void
    on_change: (mode: DateTimeFormatMode) => void
  } = $props()

  const label_id = $props.id()
  // Every event stops here so the sortable, draggable header underneath doesn't react
  const stop_event = (event: Event) => event.stopPropagation()
  let trigger = $state<HTMLButtonElement>()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="header-popover datetime-format-control"
  onclick={stop_event}
  oninput={stop_event}
  onkeydown={stop_event}
  onmousedown={stop_event}
  onpointerdown={stop_event}
>
  <button
    bind:this={trigger}
    type="button"
    class="datetime-format-trigger"
    aria-labelledby={label_id}
    aria-haspopup="listbox"
    aria-expanded={open}
    data-mode={mode}
    onclick={on_toggle}
    {@attach tooltip({
      content: `Date/time format: ${DATETIME_MODE_LABELS[mode]}`,
      placement: `top`,
    })}
  >
    <Icon icon={Calendar} />
    <span id={label_id} class="sr-only"
      >Date/time format for {html_to_text(col_label)}</span
    >
  </button>
  {#if open}
    <select
      class="datetime-format-select"
      aria-labelledby={label_id}
      value={mode}
      size={options.length}
      out:close_before_removal
      {@attach anchored_popover({ anchor: trigger, on_close: on_toggle })}
      onclick={on_toggle}
      onkeydown={(event) => {
        if (event.key === `Enter` || event.key === ` `) on_toggle()
      }}
      oninput={(event) => {
        // Chromium also fires input on arrow keys, so applying keeps the list open
        const picked = event.currentTarget.value as DateTimeFormatMode
        if (options.includes(picked)) on_change(picked)
      }}
    >
      {#each options as option (option)}
        <option value={option}>{DATETIME_MODE_LABELS[option]}</option>
      {/each}
    </select>
  {/if}
</span>

<style>
  /* wrapper, trigger and panel chrome come from DataTable's .header-popover rules */
  .datetime-format-trigger :global(svg) {
    width: 10px;
    height: 10px;
    opacity: 0.75;
    transform: translateY(-1px);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .datetime-format-select {
    min-width: max-content;
    max-width: 10em;
    padding: 2px;
    cursor: pointer;
    font-size: 0.9em;
    line-height: 1.35;
    outline: none;
    option {
      padding: 3px 8px;
    }
    option:checked {
      background: light-dark(rgba(74, 158, 255, 0.18), rgba(122, 179, 255, 0.28));
      box-shadow: 0 0 0 100vmax
        light-dark(rgba(74, 158, 255, 0.18), rgba(122, 179, 255, 0.28)) inset;
      color: inherit;
    }
  }
</style>
