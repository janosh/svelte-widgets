<script lang="ts" generics="Value extends string = string">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import type { TabItem } from './types'
  import { step_focus } from './utils'

  // Headless styling hooks: .tabs, .tabs-list, .tabs-tab and .tabs-panel.
  // Tabs and panels expose data-state="active|inactive".
  type Props = Omit<HTMLAttributes<HTMLDivElement>, `children`> & {
    items: readonly TabItem<Value>[]
    value?: Value
    activation?: `automatic` | `manual`
    orientation?: `horizontal` | `vertical`
    label?: string
    tab?: Snippet<[{ item: TabItem<Value>; selected: boolean; focused: boolean }]>
    panel?: Snippet<[{ item: TabItem<Value>; selected: boolean }]>
    on_change?: (value: Value) => void
  }

  let {
    items,
    value = $bindable(),
    activation = `automatic`,
    orientation = `horizontal`,
    label,
    tab,
    panel,
    on_change,
    ...rest
  }: Props = $props()

  const unique_id = $props.id()
  const base_id = `tabs-${unique_id}`
  const enabled_items = $derived(items.filter((item) => !item.disabled))
  const selected_value = $derived(
    enabled_items.some((item) => item.value === value) ? value : enabled_items[0]?.value,
  )
  // Keep controlled state aligned with the ARIA-selected fallback. This is state
  // normalization, not a user selection, so on_change intentionally does not run.
  $effect(() => {
    if (selected_value !== undefined && value !== selected_value) value = selected_value
  })
  // Manual activation lets focus move without selection. A writable derived follows an
  // externally controlled value again as soon as that value changes.
  let roving_value = $derived(selected_value)
  $effect(() => {
    if (!enabled_items.some((item) => item.value === roving_value))
      roving_value = selected_value
  })

  const tab_id = (item: TabItem<Value>) =>
    `${base_id}-tab-${encodeURIComponent(item.value)}`
  const panel_id = (item: TabItem<Value>) =>
    `${base_id}-panel-${encodeURIComponent(item.value)}`

  function select(next_value: Value) {
    if (next_value === value) return
    value = next_value
    on_change?.(next_value)
  }

  function focus(item: TabItem<Value>) {
    roving_value = item.value
    if (activation === `automatic`) select(item.value)
  }

  function handle_keydown(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    const { key } = event
    if (orientation === `horizontal` && (key === `ArrowUp` || key === `ArrowDown`)) return
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        `button[role="tab"]:not(:disabled)`,
      ),
    ]
    step_focus(event, buttons, { horizontal: orientation === `horizontal` })
  }
</script>

<div {...rest} class={[`tabs`, rest.class]}>
  <div
    class="tabs-list"
    role="tablist"
    aria-label={label}
    aria-orientation={orientation}
    tabindex="-1"
    onkeydown={handle_keydown}
  >
    {#each items as item (item.value)}
      {@const selected = item.value === selected_value}
      {@const focused = item.value === roving_value}
      <button
        class="tabs-tab"
        type="button"
        role="tab"
        id={tab_id(item)}
        aria-controls={panel_id(item)}
        aria-selected={selected}
        disabled={item.disabled}
        tabindex={focused ? 0 : -1}
        data-value={item.value}
        data-state={selected ? `active` : `inactive`}
        onfocus={() => focus(item)}
        onclick={() => select(item.value)}
      >
        {#if tab}
          {@render tab({ item, selected, focused })}
        {:else}
          {item.label ?? item.value}
        {/if}
      </button>
    {/each}
  </div>
  {#each items as item (item.value)}
    {@const selected = item.value === selected_value}
    <div
      class="tabs-panel"
      role="tabpanel"
      id={panel_id(item)}
      aria-labelledby={tab_id(item)}
      tabindex="0"
      hidden={!selected}
      data-state={selected ? `active` : `inactive`}
    >
      {@render panel?.({ item, selected })}
    </div>
  {/each}
</div>
