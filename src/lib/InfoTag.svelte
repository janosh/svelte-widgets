<!-- Label/value Tag that copies its value on click (or runs onclick) and flashes a checkmark,
  with an optional hover popover. Other props (color, variant, disabled, on_remove, ...) go to
  Tag. label, value and title render as trusted HTML: sanitize untrusted input first. -->
<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte'
  import { create_clipboard_feedback } from './browser/clipboard.svelte.ts'
  import Icon from './Icon.svelte'
  import { Check } from './icons'
  import { INFO_TAG_LABELS, merge_defaults } from './labels'
  import type { InfoTagLabels, TagLabels } from './labels'
  import Popover from './Popover.svelte'
  import Tag from './Tag.svelte'
  import type { PopoverTriggerProps } from './types'
  import { html_to_text } from './utils'

  let {
    label,
    value,
    copy_value,
    title,
    onclick,
    on_copy_error = () => {},
    labels,
    children,
    class: class_name,
    ...rest
  }: Omit<
    ComponentProps<typeof Tag>,
    `label` | `children` | `title` | `labels` | `href`
  > & {
    label: string // Label text (trusted HTML)
    value: string | number | undefined // Emphasized value (trusted HTML)
    copy_value?: string | number // Copied on click instead of the value's text
    title?: string // Hover popover content (trusted HTML)
    on_copy_error?: (error: unknown, text: string) => void // Clipboard write failed
    labels?: Partial<InfoTagLabels & TagLabels>
    children?: Snippet // Extra content after the value
  } = $props()

  const msg = $derived(merge_defaults(INFO_TAG_LABELS, labels))
  const { copied, copy } = create_clipboard_feedback(1000, (...args) =>
    on_copy_error(...args),
  )
  // the clipboard takes plain text, so an HTML value (Fe<sub>2</sub>O<sub>3</sub>) copies as it reads
  const to_copy = $derived(
    copy_value ?? (typeof value === `string` ? html_to_text(value) : value),
  )
  const action = $derived(
    onclick ??
      (to_copy === undefined ? undefined : () => void copy(String(to_copy), `value`)),
  )
</script>

<!-- a title-only tag has no button, so it takes focus itself to keep its popover keyboard-reachable -->
{#snippet tag(trigger_props?: PopoverTriggerProps)}
  <Tag
    {...trigger_props}
    tabindex={trigger_props && !action ? 0 : undefined}
    role={trigger_props && !action ? `button` : undefined}
    {...rest}
    {labels}
    class={[`info-tag`, class_name]}
    onclick={action}
  >
    {@html label}
    <em style="font-style: normal; font-weight: 600">{@html value ?? ``}</em>
    {#if copied.has(`value`)}<Icon icon={Check} class="copy-checkmark" />{/if}
    {@render children?.()}
  </Tag>
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
  /* the pill is the checkmark's containing block, so it overlays the value without a shift */
  :global(.tag.info-tag) {
    position: relative;
  }
  :global(.info-tag .copy-checkmark) {
    position: absolute;
    top: 50%;
    right: 3pt;
    width: 12px;
    height: 12px;
    padding: 2pt;
    border-radius: 50%;
    color: white;
    background: var(--success-color, #10b981);
    transform: translateY(-50%);
    animation: pop-in 0.15s ease-out;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(-50%) scale(0.5);
    }
  }
</style>
