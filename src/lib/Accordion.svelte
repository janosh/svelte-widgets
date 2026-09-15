<script lang="ts" generics="Value extends string = string">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import type { AccordionItem, SelectionProps } from './types'
  import { selection_values } from './internal/selection'
  import { chain_handlers, step_focus } from './utils'

  // Headless styling hooks: .accordion, .accordion-item, .accordion-heading,
  // .accordion-trigger and .accordion-panel. Items and panels expose data-state.
  type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6
  type Props = Omit<HTMLAttributes<HTMLDivElement>, `children`> & {
    items: readonly AccordionItem<Value>[]
    heading_level?: HeadingLevel
    trigger?: Snippet<[{ item: AccordionItem<Value>; open: boolean }]>
    panel?: Snippet<[{ item: AccordionItem<Value>; open: boolean }]>
    collapsible?: boolean
  } & SelectionProps<Value>

  let {
    items,
    mode = `single`,
    collapsible = true,
    value = $bindable(),
    heading_level = 3,
    trigger,
    panel,
    on_change,
    ...rest
  }: Props = $props()

  const unique_id = $props.id()
  const base_id = `accordion-${unique_id}`
  const multiple = $derived(mode === `multiple`)
  const open_values = $derived(selection_values(mode, value))
  const open_set = $derived(new Set(open_values))
  function toggle(item: AccordionItem<Value>) {
    const is_open = open_set.has(item.value)
    if (!multiple && is_open && !collapsible) return
    const next_value = multiple
      ? is_open
        ? open_values.filter((entry) => entry !== item.value)
        : [...open_values, item.value]
      : is_open
        ? null
        : item.value
    value = next_value
    ;(on_change as ((value: Value | Value[] | null) => void) | undefined)?.(next_value)
  }

  function handle_keydown(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    const root = event.currentTarget
    const { target } = event
    // A nested accordion's own root claims its triggers, so the outer root ignores them.
    if (
      !(target instanceof HTMLButtonElement) ||
      !target.classList.contains(`accordion-trigger`) ||
      target.closest(`.accordion`) !== root
    )
      return
    const buttons = [
      ...root.querySelectorAll<HTMLButtonElement>(
        `:scope > .accordion-item > .accordion-heading > button.accordion-trigger:not(:disabled)`,
      ),
    ]
    step_focus(event, buttons)
  }
</script>

<div
  {...rest}
  class={[`accordion`, rest.class]}
  onkeydown={chain_handlers(handle_keydown, rest.onkeydown)}
>
  {#each items as item (item.value)}
    {@const encoded_value = encodeURIComponent(item.value)}
    {@const trigger_id = `${base_id}-trigger-${encoded_value}`}
    {@const panel_id = `${base_id}-panel-${encoded_value}`}
    {@const open = open_set.has(item.value)}
    <div class="accordion-item" data-state={open ? `open` : `closed`}>
      <svelte:element this={`h${heading_level}`} class="accordion-heading">
        <button
          class="accordion-trigger"
          type="button"
          id={trigger_id}
          aria-controls={panel_id}
          aria-expanded={open}
          aria-disabled={item.disabled ||
            (open && !multiple && !collapsible) ||
            undefined}
          disabled={item.disabled}
          onclick={() => toggle(item)}
        >
          {#if trigger}
            {@render trigger({ item, open })}
          {:else}
            {item.label ?? item.value}
          {/if}
        </button>
      </svelte:element>
      <div
        class="accordion-panel"
        role="region"
        id={panel_id}
        aria-labelledby={trigger_id}
        hidden={!open}
        data-state={open ? `open` : `closed`}
      >
        {@render panel?.({ item, open })}
      </div>
    </div>
  {/each}
</div>
