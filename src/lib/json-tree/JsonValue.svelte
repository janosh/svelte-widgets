<script lang="ts">
  import { create_flash } from './feedback.svelte'
  import { tick } from 'svelte'
  import { get_json_tree_context, type JsonValueType } from './types'
  import {
    format_preview,
    is_css_color,
    is_url,
    parse_edited_value,
    values_equal,
  } from './utils'

  let {
    value,
    value_type,
    path,
  }: {
    value: unknown
    value_type: JsonValueType
    path: string
  } = $props()

  const ctx = get_json_tree_context()

  // Unmount-only teardown: an effect cleanup reruns per settings change (ctx.settings is a
  // fresh object each time), which cancelled the un-flash timer mid-flash.
  const changed_flash = create_flash(false, 1000)
  // Click-to-copy is delayed while editable so a double-click can cancel it. Cleared on unmount
  // only: the change-flash effect below re-runs on every value update and must not eat a
  // pending copy.
  let click_timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => () => clearTimeout(click_timer))

  // Expanded state for long strings
  let is_expanded = $state(false)
  const is_long_string = $derived(
    value_type === `string` && (value as string).length > ctx.settings.max_string_length,
  )

  // Flash when the value at this path differs from the last render
  $effect(() => {
    if (ctx.settings.highlight_changes) {
      const prev = ctx.prev_values.get(path)
      if (prev !== undefined && !values_equal(prev, value)) changed_flash.show(true)
      ctx.prev_values.set(path, value)
    }
  })

  // Trimmed string for URL/color detection (avoids using raw whitespace in href/style);
  // non-strings trim to `` which matches neither
  const trimmed_str = $derived(value_type === `string` ? (value as string).trim() : ``)
  const color_detected = $derived(is_css_color(trimmed_str) ? trimmed_str : null)

  function handle_click(event: MouseEvent) {
    event.stopPropagation()
    if (ctx.settings.editable && ctx.on_change) {
      clearTimeout(click_timer)
      const copy_pos = { clientX: event.clientX, clientY: event.clientY }
      click_timer = setTimeout(() => ctx.copy_value(path, value, copy_pos), 250)
    } else void ctx.copy_value(path, value, event)
  }

  // Strings use custom truncation, others use format_preview
  const display_value = $derived.by(() => {
    if (value_type !== `string`) return format_preview(value)
    const str = value as string
    return is_long_string && !is_expanded
      ? `"${str.slice(0, ctx.settings.max_string_length)}..."`
      : `"${str}"`
  })

  function toggle_expand(event: MouseEvent) {
    event.stopPropagation()
    is_expanded = !is_expanded
  }

  // === Inline Editing ===
  let editing = $state(false)
  let edit_text = $state(``)
  let edit_input = $state<HTMLInputElement | null>(null)

  function start_edit(event: MouseEvent) {
    if (!ctx.settings.editable || !ctx.on_change) return
    event.stopPropagation()
    clearTimeout(click_timer) // cancel pending click-to-copy
    // Pre-fill with raw value (strings without quotes)
    edit_text = value_type === `string` ? (value as string) : String(value)
    editing = true
    tick().then(() => edit_input?.select())
  }

  function commit_edit() {
    if (!editing) return
    editing = false
    const new_value = parse_edited_value(edit_text)
    if (!values_equal(new_value, value)) ctx.on_change?.(path, new_value, value)
  }

  function handle_edit_keydown(event: KeyboardEvent) {
    if (event.key === `Enter`) {
      event.preventDefault()
      commit_edit()
    } else if (event.key === `Escape`) {
      event.preventDefault()
      editing = false
    }
  }
</script>

{#if editing}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    bind:this={edit_input}
    type="text"
    class={[`edit-input`, value_type]}
    bind:value={edit_text}
    onkeydown={handle_edit_keydown}
    onblur={commit_edit}
    style:width="{Math.max(edit_text.length + 2, 6)}ch"
    autofocus
  />
{:else}
  <span
    class="json-value {value_type}"
    class:changed={changed_flash.value}
    class:editable={ctx.settings.editable}
    onclick={handle_click}
    ondblclick={start_edit}
    oncontextmenu={(event) => {
      ctx.show_context_menu(event, path, value, false, false)
    }}
    onkeydown={(event) => {
      if (event.key === `Enter` || event.key === ` `) {
        event.preventDefault()
        ctx.copy_value(path, value)
      }
    }}
    role="button"
    tabindex="-1"
    title={ctx.settings.editable ? `Double-click to edit` : undefined}
  >
    {#if color_detected}
      <span class="color-swatch" style:background={color_detected}></span>
    {/if}
    {#if is_url(trimmed_str)}
      <a
        href={encodeURI(trimmed_str)}
        class="url-link"
        target="_blank"
        rel="noopener noreferrer"
        onclick={(event) => event.stopPropagation()}
        title="Open URL in new tab"
      >
        {display_value}
      </a>
    {:else}
      {display_value}
    {/if}
    {#if is_long_string}
      <button
        type="button"
        class="expand-btn"
        onclick={toggle_expand}
        title={is_expanded ? `Collapse string` : `Show full string`}
      >
        {is_expanded ? `▲` : `...`}
      </button>
    {/if}
    {#if ctx.settings.show_data_types && value_type !== `null` && value_type !== `undefined`}
      <span class="type-annotation">{value_type}</span>
    {/if}
  </span>
{/if}

<style>
  /* Type-specific colors shared between display and edit input */
  :is(.json-value, .edit-input) {
    &.string {
      color: var(--jt-string, light-dark(#a31515, #ce9178));
    }
    &.number {
      color: var(--jt-number, light-dark(#098658, #b5cea8));
    }
    &.boolean {
      color: var(--jt-boolean, light-dark(#0000ff, #569cd6));
    }
    &.null {
      color: var(--jt-null, light-dark(#808080, #808080));
    }
  }
  .json-value {
    cursor: pointer;
    border-radius: 2px;
    transition:
      background-color 0.15s,
      color 0.15s;
    &:hover {
      background: var(
        --jt-hover-bg,
        light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.08))
      );
    }
    &.string {
      word-break: break-word;
    }
    &:is(.null, .undefined) {
      font-style: italic;
    }
    &.date {
      color: var(--jt-date, light-dark(#098658, #dcdcaa));
    }
    &.regexp {
      color: var(--jt-regexp, light-dark(#811f3f, #d16969));
    }
    &.symbol {
      color: var(--jt-symbol, light-dark(#267f99, #4ec9b0));
    }
    &.bigint {
      color: var(--jt-bigint, light-dark(#098658, #b5cea8));
    }
    &.function {
      color: var(--jt-function, light-dark(#795e26, #dcdcaa));
      font-style: italic;
    }
    &.error {
      color: var(--jt-error, light-dark(#a31515, #f48771));
    }
    &.changed {
      animation: value-change 1s ease-out;
    }
    &.editable {
      cursor: default;
    }
  }
  @keyframes value-change {
    0% {
      background: var(--jt-change-flash, light-dark(#c8e6c9, #1b5e20));
    }
    100% {
      background: transparent;
    }
  }
  .expand-btn {
    color: var(--jt-expand-btn, light-dark(#0066cc, #4fc3f7));
    font-size: 0.85em;
    padding: 0 2px;
    margin-left: 2px;
    &:hover {
      text-decoration: underline;
    }
  }
  .type-annotation {
    font-size: 0.7em;
    color: var(--jt-type-annotation, light-dark(#808080, #6a6a6a));
    margin-left: 4px;
    opacity: 0.7;
  }
  .url-link {
    color: var(--jt-url, light-dark(#0066cc, #4fc3f7));
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
  .edit-input {
    font: inherit;
    font-family: var(--jt-font-family, 'SF Mono', Monaco, 'Courier New', monospace);
    padding: 0 2px;
    border: 1px solid var(--jt-edit-border, light-dark(#4a90d9, #4a90d9));
    border-radius: 2px;
    background: var(--jt-edit-bg, light-dark(#fff, #1a1a2e));
    outline: none;
    min-width: 4ch;
  }
  .color-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px solid light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.3));
    vertical-align: middle;
    margin-right: 4px;
  }
</style>
