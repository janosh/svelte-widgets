<script lang="ts" generics="Item extends import('../types').Option">
  import { tick, untrack } from 'svelte'
  import { highlight_matches as highlight } from '../attachments/highlight-matches'
  import { get_label, get_option_key, has_group } from '../utils'
  import type { OptionListProps } from '../types'
  import { merge_defaults, MULTI_SELECT_LABELS } from '../labels'
  import { create_option_loader } from './option-loader.svelte'
  import {
    group_options,
    next_option_index,
    option_disabled,
    option_matches,
    option_window,
    validate_option_list_config,
  } from './option-list'
  import OptionRows from './OptionRows.svelte'

  let {
    options = [],
    active_index = $bindable(null),
    active_option = $bindable(null),
    matching_options = $bindable([]),
    search_text = $bindable(``),
    input = $bindable(null),
    load_error = $bindable(null),
    load_options,
    key = get_option_key,
    fuzzy = true,
    filter_func = (item, query) => option_matches(item, query, fuzzy),
    max_options,
    virtual_list = false,
    auto_scroll = true,
    auto_active_first_option = true,
    collapsed_groups = $bindable(new Set<string>()),
    collapsible_groups = false,
    group_sort_order = `none`,
    ungrouped_position = `first`,
    search_matches_groups = false,
    search_expands_collapsed_groups = false,
    keyboard_expands_collapsed_groups = false,
    sticky_group_headers = false,
    on_group_toggle,
    on_activate,
    on_search,
    collapse_all_groups = $bindable(),
    expand_all_groups = $bindable(),
    on_collapse_all,
    on_expand_all,
    class: class_name,
    placeholder = null,
    autocomplete = `off`,
    disabled = false,
    loading = false,
    labels,
    highlight_matches = true,
    input_props = {},
    input_class,
    input_style,
    inputmode,
    pattern,
    id,
    outer_div = $bindable(null),
    outer_div_class,
    style,
    li_option_class,
    li_active_option_class,
    li_option_style,
    ul_options_class,
    ul_options_style,
    li_group_header_class,
    li_group_header_style,
    default_disabled_title = `This option is disabled`,
    no_matching_options_msg = `No matching options`,
    option,
    children: option_children,
    group_header,
    onkeydown,
    oninput,
    onfocus,
    onblur,
    onclick,
    on_execute,
    ...rest
  }: OptionListProps<Item> & { on_execute: (item: Item) => void } = $props()

  const unique_id = $props.id()
  const msg = $derived(merge_defaults(MULTI_SELECT_LABELS, labels))
  const base_id = $derived(id ?? `options-${unique_id}`)
  const query = $derived(search_text.trim() ? search_text : ``)
  let list = $state<HTMLUListElement>()
  let scroll_top = $state(0)
  let client_height = $state(0)
  const loader = create_option_loader<Item>({
    config: () => load_options,
    query: () => query,
    open: () => true,
    element: () => list,
    search_text: () => search_text,
    matching_options: () => matching_options,
    on_search: () => on_search,
  })
  $effect(() => {
    load_error = loader.error
  })
  $effect.pre(() => {
    matching_options = [
      ...options.filter(
        (item) =>
          filter_func(item, query) ||
          (search_matches_groups &&
            has_group(item) &&
            option_matches(item.group, query, fuzzy)),
      ),
      ...(loader.config ? loader.options : []),
    ]
  })
  const groups = $derived(
    group_options(matching_options, {
      collapsed: collapsed_groups,
      sort: group_sort_order,
      ungrouped: ungrouped_position,
    }),
  )
  const visible_options = $derived(
    groups
      .flatMap((group) => (collapsible_groups && group.collapsed ? [] : group.options))
      .slice(0, max_options ?? undefined),
  )
  type Row =
    | {
        kind: `option`
        item: Item
        index: number
        render_key: unknown
        group: string | null
      }
    | {
        kind: `group`
        group: string
        options: Item[]
        collapsed: boolean
        render_key: unknown
      }
  const group_keys = new Map<string, symbol>()
  const rows = $derived.by((): Row[] => {
    const result: Row[] = []
    let index = 0
    for (const { group, options: items, collapsed } of groups) {
      if (group !== null) {
        if (!group_keys.has(group)) group_keys.set(group, Symbol(group))
        result.push({
          kind: `group`,
          group,
          options: items,
          collapsed,
          render_key: group_keys.get(group),
        })
      }
      if (!(collapsible_groups && collapsed))
        for (const item of items) {
          if (index >= visible_options.length) break
          result.push({
            kind: `option`,
            item,
            index: index++,
            render_key: key(item),
            group,
          })
        }
    }
    return result
  })
  const validate_config = (has_grouped_options = options.some(has_group)) =>
    validate_option_list_config({
      max_options,
      load_options,
      virtual_list,
      sticky_group_headers,
      has_grouped_options,
    })
  untrack(validate_config)
  $effect(() => validate_config(groups.some(({ group }) => group !== null)))
  const viewport = $derived(
    option_window(virtual_list, scroll_top, client_height || 400, rows.length),
  )
  let previous_index: number | null = untrack(() => active_index)
  let previous_option: Item | null = null
  let previous_key: unknown
  let previous_options: Item[] | undefined
  $effect.pre(() => {
    const items = visible_options
    const requested_option = active_option
    const option_changed =
      requested_option !== null && requested_option !== previous_option
    const items_changed =
      previous_options && items !== previous_options && previous_key !== undefined
    if (active_index === previous_index && (option_changed || items_changed)) {
      const active_key = option_changed ? key(requested_option) : previous_key
      const found = items.findIndex((item) => key(item) === active_key)
      active_index = found === -1 ? null : found
    }
    if (
      active_index === null ||
      active_index < 0 ||
      active_index >= items.length ||
      option_disabled(items[active_index])
    ) {
      active_index = auto_active_first_option ? next_option_index(items, null, 1) : null
    }
    active_option = active_index === null ? null : items[active_index]
    previous_option = active_option
    previous_index = active_index
    previous_key = active_option === null ? undefined : key(active_option)
    previous_options = items
  })
  function toggle_group(group: string) {
    const next = new Set(collapsed_groups)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    collapsed_groups = next
    on_group_toggle?.({ group, collapsed: next.has(group) })
  }
  collapse_all_groups = () => {
    const names = groups.flatMap(({ group }) => (group === null ? [] : [group]))
    collapsed_groups = new Set(names)
    on_collapse_all?.({ groups: names })
  }
  expand_all_groups = () => {
    const names = [...collapsed_groups]
    collapsed_groups = new Set()
    on_expand_all?.({ groups: names })
  }
  $effect(() => {
    if (query && search_expands_collapsed_groups) untrack(() => expand_all_groups?.())
  })
  async function handle_keydown(
    event: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement },
  ) {
    if (!disabled && !event.isComposing) {
      if (event.key === `Enter`) {
        event.preventDefault()
        if (active_option !== null && !option_disabled(active_option))
          on_execute(active_option)
      } else if (event.key === `ArrowDown` || event.key === `ArrowUp`) {
        event.preventDefault()
        if (keyboard_expands_collapsed_groups) {
          expand_all_groups?.()
          await tick()
        }
        active_index = next_option_index(
          visible_options,
          active_index,
          event.key === `ArrowDown` ? 1 : -1,
        )
        active_option = active_index === null ? null : visible_options[active_index]
        on_activate?.({ option: active_option, index: active_index })
        if (auto_scroll && active_index !== null) {
          if (viewport && list) {
            const row_index = rows.findIndex(
              (row) => row.kind === `option` && row.index === active_index,
            )
            const top = row_index * viewport.item_height
            scroll_top = Math.min(
              top,
              Math.max(scroll_top, top + viewport.item_height - (client_height || 400)),
            )
            list.scrollTop = scroll_top
          }
          await tick()
          list?.querySelector(`.active`)?.scrollIntoView({ block: `nearest` })
        }
      }
    }
    onkeydown?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLDivElement })
  }
</script>

<div
  {...rest}
  class={[`option-list`, outer_div_class, class_name]}
  bind:this={outer_div}
  {style}
>
  <input
    bind:this={input}
    bind:value={search_text}
    {...input_props}
    {autocomplete}
    {disabled}
    {inputmode}
    {pattern}
    {id}
    class={input_class}
    style={input_style}
    placeholder={typeof placeholder === `object` ? placeholder?.text : placeholder}
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded="true"
    aria-controls="{base_id}-listbox"
    aria-activedescendant={active_index === null
      ? undefined
      : `${base_id}-opt-${active_index}`}
    aria-busy={loading || loader.loading}
    onkeydown={handle_keydown}
    {oninput}
    {onfocus}
    {onblur}
    {onclick}
  />
  <ul
    class={[`options`, ul_options_class]}
    id="{base_id}-listbox"
    role="listbox"
    bind:this={list}
    bind:clientHeight={client_height}
    style={ul_options_style}
    onscroll={(event) => {
      scroll_top = event.currentTarget.scrollTop
      loader.on_scroll(event)
    }}
    {@attach highlight({
      query,
      disabled: !highlight_matches,
      fuzzy,
      css_class: `sms-search-matches`,
      scroll_to_match: false,
    })}
  >
    <OptionRows {rows} window={viewport}>
      {#snippet children(row)}
        {#if row.kind === `group`}
          <li
            class={[
              `group-header`,
              li_group_header_class,
              { sticky: sticky_group_headers },
            ]}
            role="presentation"
            style={li_group_header_style}
          >
            <span id="{base_id}-group-{encodeURIComponent(row.group)}">
              {#if group_header}{@render group_header({
                  group: row.group,
                  options: row.options,
                  collapsed: row.collapsed,
                })}{:else}{row.group}{/if}
            </span>
            {#if collapsible_groups}<button
                type="button"
                aria-expanded={!row.collapsed}
                onclick={() => toggle_group(row.group)}
                aria-label={msg.group(row.group)}>{row.collapsed ? `▸` : `▾`}</button
              >{/if}
          </li>
        {:else}
          {@const disabled_option = disabled || option_disabled(row.item)}
          <li
            id="{base_id}-opt-{row.index}"
            role="option"
            aria-selected="false"
            aria-disabled={disabled_option || undefined}
            aria-describedby={row.group === null
              ? undefined
              : `${base_id}-group-${encodeURIComponent(row.group)}`}
            aria-posinset={row.index + 1}
            aria-setsize={visible_options.length}
            class={[
              li_option_class,
              { active: active_index === row.index, disabled: disabled_option },
              active_index === row.index && li_active_option_class,
            ]}
            style={li_option_style}
            title={disabled_option ? default_disabled_title : undefined}
            onmousemove={() => {
              if (!disabled_option) active_index = row.index
            }}
            onclick={() => {
              if (!disabled_option) on_execute(row.item)
            }}
            onkeydown={(event) => {
              if (!disabled_option && [`Enter`, ` `].includes(event.key)) {
                event.preventDefault()
                on_execute(row.item)
              }
            }}
          >
            {#if option}{@render option({
                option: row.item,
                idx: row.index,
                selected: false,
                active: active_index === row.index,
                disabled: disabled_option,
              })}
            {:else if option_children}{@render option_children({
                option: row.item,
                idx: row.index,
                type: `option`,
              })}
            {:else}{get_label(row.item)}{/if}
          </li>
        {/if}
      {/snippet}
    </OptionRows>
    {#if !visible_options.length && !loader.loading && !loader.error}<li
        class="user-msg"
        role="option"
        aria-selected="false"
      >
        {no_matching_options_msg}
      </li>{/if}
    {#if loading || loader.loading}<li role="status">{msg.loading_more}</li>{/if}
  </ul>
  {#if loader.error}<div class="load-error">
      <span role="alert">{msg.loading_failed}</span><button
        type="button"
        onclick={() => {
          input?.focus()
          void loader.load(!loader.options.length)
        }}>{msg.retry}</button
      >
    </div>{/if}
</div>

<style>
  .option-list {
    width: var(--sms-width, 100%);
    background: var(--sms-bg, Canvas);
    color: CanvasText;
    border-radius: 6px;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    border: none;
    border-radius: inherit;
    padding: 0.6em;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
    max-height: var(--sms-options-max-height, 40vh);
    background: var(--sms-options-bg, Canvas);
  }
  li {
    padding: 0.35em 0.6em;
    cursor: pointer;
  }
  li.active {
    background: var(
      --sms-li-active-bg,
      color-mix(in srgb, currentColor 12%, transparent)
    );
  }
  li.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  li.group-header {
    font-size: 0.85em;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
  }
  li.sticky {
    position: sticky;
    top: 0;
    background: var(--sms-options-bg, Canvas);
  }
  .load-error {
    display: flex;
    gap: 1em;
    padding: 0.5em;
  }
</style>
