<!-- Label/value pill that copies its value on click (or runs onclick), with semantic color
  variants, sizes, an optional hover popover and remove button. label, value and title render
  as trusted HTML: sanitize untrusted input before passing it. For a plain category or filter
  chip, use Tag. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { create_clipboard_feedback } from './browser/clipboard.svelte'
  import Icon from './Icon.svelte'
  import { Check, Cross } from './icons'
  import { INFO_TAG_LABELS, merge_defaults, type InfoTagLabels } from './labels'
  import Popover from './Popover.svelte'
  import type { InfoTagSize, InfoTagVariant } from './types'
  import { html_to_text } from './utils'

  let {
    label,
    value,
    copy_value,
    title,
    variant = `default`,
    size = `md`,
    disabled = false,
    onclick,
    on_remove,
    on_copy_error = () => {},
    labels,
    children,
    ...rest
  }: {
    label: string // Label text (trusted HTML)
    value: string | number | undefined // Emphasized value (trusted HTML)
    copy_value?: string | number // Copied on click instead of the value's text
    title?: string // Hover popover content (trusted HTML)
    variant?: InfoTagVariant // Semantic color
    size?: InfoTagSize
    disabled?: boolean // Blocks click, copy and remove
    onclick?: (event: MouseEvent) => void // Replaces copy-to-clipboard
    on_remove?: () => void // Adds a remove button
    on_copy_error?: (error: unknown, text: string) => void // Clipboard write failed
    labels?: Partial<InfoTagLabels>
    children?: Snippet // Extra content after the value
  } & Omit<
    HTMLAttributes<HTMLSpanElement>,
    `onclick` | `onkeydown` | `title` | `children`
  > = $props()

  const msg = $derived(merge_defaults(INFO_TAG_LABELS, labels))
  // one key, since a tag copies a single value; `copied` handles the timed reset
  const { copied, copy } = create_clipboard_feedback(1000, (error, text) =>
    on_copy_error(error, text),
  )
  // the clipboard takes plain text, so an HTML value (Fe<sub>2</sub>O<sub>3</sub>) copies as it reads
  const to_copy = $derived(
    copy_value ?? (typeof value === `string` ? html_to_text(value) : value),
  )
  const has_action = $derived(Boolean(onclick) || to_copy !== undefined)

  function handle_click(event: MouseEvent): void {
    if (disabled) return
    if (onclick) onclick(event)
    else if (to_copy !== undefined) void copy(String(to_copy), `value`)
  }

  function handle_keydown(event: KeyboardEvent & { currentTarget: HTMLElement }): void {
    if (
      event.target !== event.currentTarget ||
      disabled ||
      (event.key !== `Enter` && event.key !== ` `)
    )
      return
    event.preventDefault()
    event.currentTarget.click()
  }

  function handle_remove(event: MouseEvent): void {
    event.stopPropagation()
    on_remove?.()
  }
</script>

{#snippet tag(trigger_props: HTMLAttributes<HTMLSpanElement> = {})}
  <span
    {...trigger_props}
    {...has_action ? { role: `button`, tabindex: disabled ? -1 : 0 } : {}}
    onclick={handle_click}
    onkeydown={handle_keydown}
    aria-disabled={disabled}
    {...rest}
    class={[`info-tag`, variant, size, { disabled }, rest.class]}
  >
    {@html label}
    <em>{@html value ?? ``}</em>
    {#if copied.has(`value`)}
      <Icon icon={Check} class="copy-checkmark" />
    {/if}
    {#if on_remove && !disabled}
      <button
        type="button"
        class="remove"
        onclick={handle_remove}
        aria-label={msg.remove}
      >
        <Icon icon={Cross} />
      </button>
    {/if}
    {@render children?.()}
  </span>
{/snippet}

{#if title}
  <Popover
    trigger_mode="hover"
    trap_focus={false}
    open_delay_ms={200}
    aria-label={msg.details}
  >
    {#snippet trigger(trigger_props)}{@render tag(trigger_props)}{/snippet}
    {@html title}
  </Popover>
{:else}
  {@render tag()}
{/if}

<style>
  .info-tag {
    position: relative;
    transition: all 0.12s;
    border: 1px solid color-mix(in srgb, var(--info-tag-color) 25%, transparent);
    white-space: nowrap;
    &[role='button'] {
      cursor: pointer;
    }
    em {
      font-style: normal;
      font-weight: 600;
      color: var(--info-tag-color);
    }
    &[role='button']:hover:not(.disabled) {
      background: color-mix(in srgb, var(--info-tag-color) 18%, transparent);
      border-color: color-mix(in srgb, var(--info-tag-color) 40%, transparent);
    }
    &.sm {
      font-size: 0.72em;
      padding: 0 5pt;
      border-radius: 4px;
    }
    &.md {
      font-size: 0.8em;
      padding: 1pt 6pt;
      border-radius: 5px;
    }
    &.lg {
      font-size: 0.9em;
      padding: 3pt 8pt;
      border-radius: 6px;
    }
    &.default {
      --info-tag-color: var(--accent, #4db6ff);
    }
    &.success {
      --info-tag-color: var(--success-color, #10b981);
    }
    &.warning {
      --info-tag-color: var(--warning-color, #f59e0b);
    }
    &.error {
      --info-tag-color: var(--error-color, #ef4444);
    }
    &.info {
      --info-tag-color: var(--info-color, #3b82f6);
    }
    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    &[role='button']:active:not(.disabled) {
      transform: scale(0.97);
    }
    :global(.copy-checkmark) {
      position: absolute;
      top: 50%;
      right: 3pt;
      width: 12px;
      height: 12px;
      transform: translateY(-50%);
      color: white;
      background: var(--success-color, #10b981);
      border-radius: 50%;
      padding: 2pt;
      animation: pop-in 0.15s ease-out;
    }
  }
  .remove {
    display: inline-flex;
    vertical-align: middle;
    align-items: center;
    justify-content: center;
    background: rgba(128, 128, 128, 0.1);
    border: none;
    cursor: pointer;
    padding: 2pt;
    margin-left: 2pt;
    border-radius: 50%;
    color: inherit;
    opacity: 0.5;
    position: relative;
    :global(svg) {
      width: 10px;
      height: 10px;
    }
    /* the visible x is ~15px; an invisible halo widens the tap target without growing the tag */
    &::before {
      content: '';
      position: absolute;
      inset: -8px;
    }
    &:hover {
      opacity: 1;
      background: color-mix(in srgb, var(--error-color, #ef4444) 20%, transparent);
      color: var(--error-color, #ef4444);
    }
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(-50%) scale(0.5);
    }
  }
</style>
