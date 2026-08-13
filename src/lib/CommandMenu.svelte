<script lang="ts" generics="Action extends CmdAction = CmdAction">
  import type { ComponentProps } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { SvelteMap } from 'svelte/reactivity'
  import { fade } from 'svelte/transition'
  import { is_dialog_backdrop_event } from './dialog'
  import MultiSelect from './MultiSelect.svelte'
  import { create_recent_list } from './storage'
  import type { CmdAction, MultiSelectProps } from './types'
  import type { Hotkey } from './utils'
  import {
    cmd_action_matches,
    chain_handlers,
    clamp_integer,
    format_cmd_metadata,
    format_shortcut,
    run_hotkeys,
  } from './utils'

  // MultiSelect's option snippet param (option + idx/selected/active/disabled)
  type OptionSnippetParams = Parameters<
    NonNullable<MultiSelectProps<Action>[`option`]>
  >[0]
  type AddParams = Parameters<NonNullable<MultiSelectProps<Action>[`onadd`]>>[0]
  type DialogEvent = Parameters<
    NonNullable<HTMLAttributes<HTMLDialogElement>[`oncancel`]>
  >[0]

  let {
    actions,
    activeIndex: active_idx = $bindable(null),
    activeOption: active_option = $bindable(null),
    triggers = [`k`],
    close_keys = [`Escape`],
    fade_duration_ms = 200,
    open = $bindable(false),
    dialog = $bindable(null),
    input = $bindable(null),
    aria_label = `Command menu`,
    filterFunc: filter_func,
    fuzzy = true,
    inputProps: input_props,
    input_aria_label = aria_label === `Command menu` ? `Search commands` : aria_label,
    matchingOptions: matching_actions = $bindable([]),
    noMatchingOptionsMsg: no_matching_options_msg = `No matching commands`,
    onadd,
    onkeydown,
    option: option_snippet,
    placeholder = `Type a command…`,
    searchText: search_text = $bindable(``),
    dialog_props,
    global_shortcuts = true,
    recent_actions_key = null,
    max_recent = 20,
    ...rest
  }: Omit<
    ComponentProps<typeof MultiSelect<Action>>,
    `activeOptionFallbackKey` | `autoActiveFirstOption` | `key` | `options`
  > & {
    actions: Action[]
    triggers?: string[]
    close_keys?: string[]
    fade_duration_ms?: number
    open?: boolean
    dialog?: HTMLDialogElement | null
    input?: HTMLInputElement | null
    input_aria_label?: string
    aria_label?: string
    placeholder?: string
    dialog_props?: HTMLAttributes<HTMLDialogElement>
    // run action.shortcut hotkeys globally while the menu is closed (default: true)
    global_shortcuts?: boolean
    // localStorage key to persist recently triggered actions. When set, recent
    // actions rank first in the dropdown (most recent on top). null = disabled
    recent_actions_key?: string | null
    max_recent?: number // cap on persisted recent actions (default: 20)
  } = $props()

  // === Recent actions (most-recently-used ranking) ===
  let recent_action_ids = $state<string[]>([])
  let backdrop_press_started = false

  const get_action_id = (action: CmdAction): string => `${action.id ?? action.label}`
  const recent_actions = $derived(
    recent_actions_key
      ? create_recent_list<string>({
          storage_key: recent_actions_key,
          max_items: clamp_integer(max_recent, 0, Infinity, 20),
          key_of: (action_id) => action_id,
          is_valid: (value): value is string => typeof value === `string`,
        })
      : null,
  )
  const action_id_counts = $derived.by(() => {
    const counts = new SvelteMap<string, number>()
    for (const action of actions) {
      const action_id = get_action_id(action)
      counts.set(action_id, (counts.get(action_id) ?? 0) + 1)
    }
    return counts
  })
  const action_ids_are_unique = $derived(action_id_counts.size === actions.length)
  const get_action_signature = (action: CmdAction): string =>
    JSON.stringify([
      action.id,
      action.label,
      action.description,
      action.badge,
      action.disabled,
      action.group,
      action.metadata,
      action.keywords,
      action.shortcut,
    ])
  const action_id_is_unique = (action: Action) =>
    action_id_counts.get(get_action_id(action)) === 1
  const get_action_key = (action: Action) =>
    action_id_is_unique(action) ? get_action_id(action) : action.action
  const get_action_fallback_key = (action: Action) =>
    action_id_is_unique(action) ? get_action_id(action) : get_action_signature(action)

  // load persisted recents (client-only since $effect doesn't run during SSR)
  $effect(() => {
    if (!recent_actions || !action_ids_are_unique) return
    recent_action_ids = recent_actions.load()
  })

  function record_recent(action: Action) {
    if (!recent_actions || !action_ids_are_unique) return
    recent_action_ids = recent_actions.remember(get_action_id(action), recent_action_ids)
  }

  // recently triggered actions first (most recent on top), rest keep original order
  const sorted_actions = $derived.by(() => {
    if (!recent_actions || !action_ids_are_unique || recent_action_ids.length === 0)
      return actions
    // drop stale persisted ids (actions removed/renamed since) so they don't
    // occupy low ranks and push real recents below non-recent actions
    const rank = new SvelteMap<string, number>()
    for (const action_id of recent_action_ids) {
      if (action_id_counts.has(action_id)) rank.set(action_id, rank.size)
    }
    return actions.toSorted(
      (left_action, right_action) =>
        (rank.get(get_action_id(left_action)) ?? actions.length) -
        (rank.get(get_action_id(right_action)) ?? actions.length),
    )
  })

  // Dynamic actions may contain metadata not present in the static action list.
  const has_action_meta = $derived(
    Boolean(rest.loadOptions) ||
      actions.some(
        (action) =>
          action.shortcut || action.description || action.badge || action.metadata,
      ),
  )
  // `$effect.pre` closes before `{#if open}` unmounts so native `onclose` still fires.
  $effect.pre(() => {
    if (!open && dialog?.open) dialog.close()
  })
  $effect(() => {
    if (!open) return
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
    if (input && document.activeElement !== input) input.focus()
  })

  function close_menu() {
    open = false
    active_idx = null
    active_option = null
    search_text = ``
  }

  function handle_dialog_close(event: Event) {
    if (open && event.currentTarget !== dialog) return
    close_menu()
  }

  // Cmd and Ctrl both open the menu on every platform, so `mod` is too narrow here
  const open_shortcuts = $derived(
    triggers.flatMap((key) => [`meta+${key}`, `ctrl+${key}`]),
  )
  const toggle_bindings = $derived<Hotkey[]>([
    { keys: open_shortcuts, handler: () => (open = true), enabled: !open },
    // Escape has to work while the search input has focus, hence allow_in_inputs
    { keys: close_keys, handler: close_menu, enabled: open, allow_in_inputs: true },
  ])
  const escape_closes = $derived(close_keys.includes(`Escape`))
  const custom_backdrop_dismiss = $derived(
    !escape_closes && dialog_props?.closedby === undefined,
  )
  // Bare action shortcuts stay inert while the menu is up: there the keyboard
  // belongs to the search input. An action without a shortcut has no keys to match.
  const key_bindings = $derived<Hotkey[]>([
    ...toggle_bindings,
    ...actions.map((action) => ({
      keys: action.shortcut ?? ``,
      enabled: global_shortcuts && !open && !action.disabled,
      handler: () => {
        record_recent(action)
        action.action(action.label)
      },
    })),
  ])

  function handle_dialog_cancel(event: DialogEvent) {
    if (!escape_closes) event.preventDefault()
    dialog_props?.oncancel?.(event)
  }

  const track_backdrop_press = (event: PointerEvent) => {
    backdrop_press_started =
      custom_backdrop_dismiss &&
      event.isPrimary &&
      is_dialog_backdrop_event(dialog, event)
  }
  const track_backdrop_release = (event: MouseEvent) => {
    if (backdrop_press_started && is_dialog_backdrop_event(dialog, event)) close_menu()
    backdrop_press_started = false
  }

  const run_toggle_hotkeys = (event: KeyboardEvent) => run_hotkeys(event, toggle_bindings)

  function handle_window_keydown(event: KeyboardEvent) {
    // a close key still lands after another handler already called preventDefault
    if (event.defaultPrevented && !(open && close_keys.includes(event.key))) return
    run_hotkeys(event, key_bindings)
  }

  function trigger_action_and_close(params: AddParams) {
    const { option } = params
    if (!option?.action || option.disabled) return
    record_recent(option)
    close_menu()
    option.action(option.label)
    onadd?.(params)
  }
</script>

<svelte:window onkeydown={handle_window_keydown} />

{#snippet action_item({ option }: OptionSnippetParams)}
  {@const metadata = format_cmd_metadata(option.metadata)}
  <span class="cmd-action">
    <span class="cmd-label">
      {option.label}
      {#if option.description}
        <small class="cmd-description">{option.description}</small>
      {/if}
    </span>
    {#if metadata || option.badge || option.shortcut}
      <span class="cmd-meta">
        {#if metadata}<small class="cmd-metadata">{metadata}</small>{/if}
        {#if option.badge}<span class="cmd-badge">{option.badge}</span>{/if}
        {#if option.shortcut}
          <span class="cmd-shortcut" aria-hidden="true">
            {#each format_shortcut(option.shortcut) as part, idx (idx)}
              <kbd>{part}</kbd>
            {/each}
          </span>
        {/if}
      </span>
    {/if}
  </span>
{/snippet}

{#if open}
  <dialog
    bind:this={dialog}
    closedby={dialog_props?.closedby ?? (escape_closes ? `any` : `none`)}
    transition:fade={{ duration: fade_duration_ms }}
    aria-label={aria_label}
    {...dialog_props}
    onclose={chain_handlers(handle_dialog_close, dialog_props?.onclose)}
    oncancel={handle_dialog_cancel}
    onpointerdown={chain_handlers(track_backdrop_press, dialog_props?.onpointerdown)}
    onpointercancel={chain_handlers(
      () => (backdrop_press_started = false),
      dialog_props?.onpointercancel,
    )}
    onclick={chain_handlers(track_backdrop_release, dialog_props?.onclick)}
  >
    <MultiSelect
      {...rest}
      options={sorted_actions}
      bind:activeIndex={active_idx}
      bind:activeOption={active_option}
      activeOptionFallbackKey={get_action_fallback_key}
      autoActiveFirstOption
      bind:input
      bind:matchingOptions={matching_actions}
      bind:searchText={search_text}
      filterFunc={filter_func ??
        ((action, search) => cmd_action_matches(action, search, fuzzy))}
      {fuzzy}
      inputProps={{ 'aria-label': input_aria_label, ...input_props }}
      noMatchingOptionsMsg={no_matching_options_msg}
      {placeholder}
      key={get_action_key}
      onadd={trigger_action_and_close}
      onkeydown={chain_handlers(run_toggle_hotkeys, onkeydown)}
      option={option_snippet ?? (has_action_meta ? action_item : undefined)}
      --sms-bg="var(--sms-options-bg)"
      --sms-width="var(--cmd-width, min(38rem, 90vw))"
      --sms-max-width="none"
      --sms-placeholder-color="lightgray"
      --sms-padding="3pt"
      --sms-options-margin="1px 0"
      --sms-options-border-radius="0 0 1ex 1ex"
    />
  </dialog>
{/if}

<style>
  .cmd-action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
    min-width: 0;
  }
  .cmd-description {
    display: block;
    opacity: 0.6;
    font-size: var(--cmd-description-font-size, 0.75em);
  }
  .cmd-meta {
    display: flex;
    min-width: 0;
    flex-shrink: 0;
    align-items: center;
    gap: 0.5em;
  }
  .cmd-metadata {
    max-width: var(--cmd-metadata-max-width, 14em);
    overflow: hidden;
    opacity: 0.6;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmd-badge {
    padding: 0.05em 0.4em;
    border-radius: 999px;
    background: var(--cmd-badge-bg, color-mix(in srgb, currentColor 10%, transparent));
    opacity: 0.7;
    font-size: var(--cmd-badge-font-size, 0.7em);
  }
  .cmd-shortcut {
    flex-shrink: 0;
    display: flex;
    gap: 2pt;
  }
  .cmd-shortcut kbd {
    background: var(
      --cmd-kbd-bg,
      light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.15))
    );
    border-radius: 3pt;
    padding: 0 4pt;
    font-size: var(--cmd-kbd-font-size, 0.8em);
    line-height: 1.5;
  }
  :where(dialog) {
    position: fixed;
    top: 30%;
    left: 0;
    right: 0;
    bottom: auto;
    margin: 0 auto;
    border: none;
    padding: var(--cmd-dialog-padding, 6pt);
    background-color: transparent;
    display: flex;
    /* Let command results/popovers escape the dialog; default clipping hides suggestions. */
    overflow: visible;
    color: light-dark(#222, #eee);
    z-index: var(--cmd-menu-z-index, 10);
    font-size: 2.4ex;
  }
</style>
