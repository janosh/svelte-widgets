<script lang="ts" generics="Value extends string = string">
  import type { Snippet } from 'svelte'
  import type { ButtonGroupOption, SelectionProps } from './types'
  import { selection_values } from './internal/selection'
  import { chain_handlers, step_focus } from './utils'
  import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements'
  import { tooltip, type TooltipOptions } from './attachments/index'
  import CircleSpinner from './CircleSpinner.svelte'
  import Icon from './Icon.svelte'
  import { merge_defaults, BUTTON_GROUP_LABELS, type ButtonGroupLabels } from './labels'

  type CommonProps<Value extends string> = {
    options: readonly (Value | ButtonGroupOption<Value>)[]
    label?: string // aria-label for the group, since a bare row of buttons has none
    labels?: Partial<ButtonGroupLabels> // overrides for the sort button's aria-label
    disabled?: boolean // disables every option, on top of per-option `disabled`
    // opt-in trailing asc/desc button; null (default) renders no arrow at all
    sort_order?: `asc` | `desc` | null
    // the sort arrow sits outside the radiogroup; style/attrs go here, not on the host
    sort_button_props?: Omit<HTMLButtonAttributes, `aria-label` | `disabled` | `type`>
    option?: Snippet<[{ option: ButtonGroupOption<Value>; selected: boolean }]>
    // Sibling of the button, not content of it, so an option can carry a trailing link or
    // badge without nesting interactive content in a button. Caveat in single-select mode:
    // a radiogroup owns only radios per ARIA, so anything focusable here is an extra tab stop
    // and an aria-required-children violation (hence the sort arrow sitting outside).
    option_suffix?: Snippet<[{ option: ButtonGroupOption<Value>; selected: boolean }]>
    // Content comes from each option's own `tooltip`; options control timing and placement.
    tooltip_options?: Omit<TooltipOptions, `content`>
    // a div can't sit inside phrasing content, so a group in a heading or paragraph needs
    // to be a span
    as?: string
  }
  let {
    options,
    value = $bindable(),
    mode = `single`,
    label,
    labels,
    disabled = false,
    sort_order = $bindable(null),
    sort_button_props,
    option,
    option_suffix,
    on_change,
    tooltip_options,
    as = `div`,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `children`> &
    CommonProps<Value> &
    SelectionProps<Value> = $props()

  const msg = $derived(merge_defaults(BUTTON_GROUP_LABELS, labels))

  const option_list = $derived(
    options.map((entry) => {
      if (typeof entry === `string`) return { value: entry }
      if (!entry || typeof entry.value !== `string`)
        throw new TypeError(`ButtonGroup: unsupported option ${JSON.stringify(entry)}`)
      return entry
    }),
  )
  const multiple = $derived(mode === `multiple`)
  // keyboard-reachable buttons in render order; the roving stop falls back to the first
  const enabled_options = $derived(
    disabled ? [] : option_list.filter((opt) => !opt.disabled),
  )
  const selected_values = $derived(selection_values(mode, value))
  const selected_set = $derived(new Set(selected_values))

  // Roving tabindex: one stop on the checked option. Falls back so a selection pointing at
  // no rendered option still leaves something tabbable.
  const roving_value = $derived.by(() => {
    if (multiple) return null
    const checked_option = enabled_options.find((opt) => opt.value === selected_values[0])
    return (checked_option ?? enabled_options[0])?.value
  })

  function select(next_value: Value) {
    if (!multiple && value === next_value) return
    value = multiple
      ? selected_set.has(next_value)
        ? selected_values.filter((entry) => entry !== next_value)
        : [...selected_values, next_value]
      : next_value
    ;(on_change as ((value: Value | Value[] | null) => void) | undefined)?.(value)
  }

  function handle_keydown(event: KeyboardEvent) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    // `[data-value]` excludes option_suffix buttons, which would desync focus from the
    // option it is meant to select
    const selector = `button[data-value]:not(:disabled)`
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(selector)]
    const next_value = step_focus(event, buttons, { horizontal: true })?.dataset.value
    // A radio group carries its selection with focus; independent toggles don't. Value is
    // read off the button so DOM order and the option list can't drift apart.
    if (!multiple && next_value !== undefined) select(next_value as Value)
  }
</script>

{#snippet option_button(opt: ButtonGroupOption<Value>, is_selected: boolean)}
  <button
    type="button"
    role={multiple ? undefined : `radio`}
    aria-checked={multiple ? undefined : is_selected}
    aria-pressed={multiple ? is_selected : undefined}
    tabindex={multiple ? undefined : opt.value === roving_value ? 0 : -1}
    disabled={disabled || opt.disabled}
    aria-busy={opt.loading || undefined}
    data-value={opt.value}
    onclick={() => select(opt.value)}
    {@attach tooltip({ ...tooltip_options, content: opt.tooltip })}
  >
    {#if option}
      {@render option({ option: opt, selected: is_selected })}
    {:else}
      {#if opt.icon}<Icon icon={opt.icon} />{/if}
      {opt.label ?? opt.value}
      {#if opt.loading !== undefined}
        <!-- decoration for sighted users; `aria-busy` on the button is what AT reads -->
        <CircleSpinner
          size="0.8em"
          aria-hidden="true"
          style={`visibility: ${opt.loading ? `visible` : `hidden`}`}
        />
      {/if}
    {/if}
  </button>
{/snippet}

<svelte:element this={as} {...rest} class={[`button-group`, rest.class]}>
  <!-- span, not div: it is display: flex either way and stays valid when `as` is a span -->
  <span
    class="options"
    role={multiple ? `group` : `radiogroup`}
    aria-label={label}
    onkeydown={handle_keydown}
  >
    {#each option_list as opt (opt.value)}
      {@const is_selected = selected_set.has(opt.value)}
      {#if option_suffix}
        <!-- opt-in: the extra level breaks consumers' `.options > button` selectors -->
        <span class="option">
          {@render option_button(opt, is_selected)}
          {@render option_suffix({ option: opt, selected: is_selected })}
        </span>
      {:else}
        {@render option_button(opt, is_selected)}
      {/if}
    {/each}
  </span>
  {#if sort_order}
    <button
      {...sort_button_props}
      type="button"
      {disabled}
      aria-label={sort_order === `asc` ? msg.sort_ascending : msg.sort_descending}
      class={[`sort-order`, sort_button_props?.class]}
      onclick={chain_handlers(
        () => (sort_order = sort_order === `asc` ? `desc` : `asc`),
        sort_button_props?.onclick,
      )}
    >
      {sort_order === `asc` ? `↑` : `↓`}
    </button>
  {/if}
</svelte:element>

<style>
  .button-group {
    display: var(--btn-group-display, inline-flex);
    flex-wrap: wrap;
    align-items: center;
    gap: var(--btn-group-gap, 4pt);
    padding: var(--btn-group-padding, 0);
    background: var(--btn-group-bg, transparent);
    border: var(--btn-group-border, none);
    border-radius: var(--btn-group-radius, 4pt);
    .options {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: var(--btn-group-justify-content, flex-start);
      gap: inherit;
    }
    /* the pill: the `option_suffix` wrapper if present, else the button. Box and state colors
       live here so slotted content sits inside the pill; padding stays on the button so its
       edges still toggle. */
    .option,
    button:not(.option > button) {
      display: inline-flex;
      align-items: center;
      background: var(--btn-group-btn-bg, transparent);
      color: var(--btn-group-btn-color, inherit);
      border: var(--btn-group-btn-border, 1px solid transparent);
      border-radius: var(--btn-group-btn-radius, 3pt);
      /* `all 0s` is the browser default, so the knob is inert until a consumer sets it */
      transition: var(--btn-group-btn-transition, all 0s);
      /* checked excluded here, not by source order: :hover plus this :not() outranks the
         checked rule below, so hovering a selected option would lighten it */
      &:hover:not(
          :disabled,
          [aria-checked='true'],
          [aria-pressed='true'],
          :has(> button:is(:disabled, [aria-checked='true'], [aria-pressed='true']))
        ) {
        background: var(
          --btn-group-btn-hover-bg,
          light-dark(rgba(0, 0, 0, 0.07), rgba(255, 255, 255, 0.12))
        );
        /* chains to btn-color so leaving this unset keeps the resting color on hover */
        color: var(--btn-group-btn-hover-color, var(--btn-group-btn-color, inherit));
        transform: var(--btn-group-btn-hover-transform, none);
      }
      /* the checked state lives on the button; `:has` lifts it onto the wrapper */
      &:is([aria-checked='true'], [aria-pressed='true']),
      &:has(> button:is([aria-checked='true'], [aria-pressed='true'])) {
        background: var(
          --btn-group-btn-active-bg,
          light-dark(rgba(0, 0, 0, 0.13), rgba(255, 255, 255, 0.22))
        );
        color: var(--btn-group-btn-active-color, inherit);
        border-color: var(--btn-group-btn-active-border-color, transparent);
      }
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: var(--btn-group-btn-gap, 0.4em);
      padding: var(--btn-group-btn-padding, 2pt 6pt);
      /* longhands, not the `font` shorthand: this selector outranks a consumer's own
         `button {}` rule, so the shorthand silently reset their weight and style */
      font-family: var(--btn-group-btn-font-family, inherit);
      font-size: var(--btn-group-btn-font-size, inherit);
      cursor: var(--btn-group-btn-cursor, pointer);
    }
    /* after `button`'s padding shorthand so padding-right survives. Inside a pill the button
       drops its box; dropping the border (rather than making it transparent) keeps the pill
       the size of an unwrapped one and lets the button fill it, so edge clicks still toggle.
       Right padding shrinks so a trailing suffix sits in that former gap. */
    .option > button {
      background: none;
      color: inherit;
      border: none;
      border-radius: inherit;
      padding-right: var(--btn-group-option-btn-padding-right, 0.5ex);
    }
    button:disabled {
      opacity: var(--btn-group-btn-disabled-opacity, 0.5);
      cursor: not-allowed;
    }
  }
</style>
