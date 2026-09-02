<script lang="ts">
  import type { Snippet } from 'svelte'
  import { untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { Reset } from './icons'
  import {
    merge_defaults,
    SETTINGS_SECTION_LABELS,
    type SettingsSectionLabels,
  } from './labels'
  import { is_object, observe_subtree } from './utils'

  type SettingMetadata = Readonly<
    Record<string, string | { readonly description: string } | undefined>
  >

  let {
    title,
    labels,
    current_values = {},
    reset_values,
    children,
    layout = `flow`,
    on_reset,
    on_reset_key,
    setting_metadata,
    descriptions_open = $bindable(false),
    ...rest
  }: HTMLAttributes<HTMLElementTagNameMap[`section`]> & {
    title: string
    // the Explain/Reset strings; the interpolating ones receive `title` verbatim
    labels?: Partial<SettingsSectionLabels>
    // Omit for action-only sections with nothing to diff. Values may be primitives, arrays,
    // plain objects, Date or RegExp; Map, Set and typed arrays are unsupported.
    current_values?: Record<string, unknown>
    // Reset baseline: keys absent here count as additions and are removed on reset; keys not
    // in current_values are ignored.
    reset_values?: Record<string, unknown>
    children: Snippet
    // `grid` aligns every direct label/.setting row on one [label][value][wide control]
    // rhythm instead of wherever each label's text ends; `flow` leaves layout to the caller.
    layout?: `flow` | `grid`
    // Omit to reset every changed key through `on_reset_key`. Pass one only when reset has to
    // do more than restore values (clearing validation state, say).
    on_reset?: () => void
    // Rows opt in with `data-key`. Receives the mounted reference value and whether that key
    // originally existed, so callers can restore or delete it exactly.
    on_reset_key?: (
      key: string,
      reference_value: unknown,
      reference_present: boolean,
    ) => void
    // Accepts schema objects directly as well as a compact key-to-description map.
    setting_metadata?: SettingMetadata
    descriptions_open?: boolean
  } = $props()

  const msg = $derived(merge_defaults(SETTINGS_SECTION_LABELS, labels))

  const validate_object_shape = (value: object): void => {
    if (value instanceof Set || value instanceof Map) {
      throw new TypeError(`SettingsSection values must not contain Set or Map instances`)
    }
    if (value instanceof Date || value instanceof RegExp || Array.isArray(value)) return
    const prototype = Object.getPrototypeOf(value)
    if (prototype && prototype !== Object.prototype) {
      throw new TypeError(`SettingsSection values must be plain objects`)
    }
  }

  const deep_copy = (value: unknown): unknown => {
    if (!is_object(value)) return value
    validate_object_shape(value)
    if (value instanceof Date) return new Date(value)
    if (value instanceof RegExp) return new RegExp(value)
    if (Array.isArray(value)) return value.map(deep_copy)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deep_copy(item)]),
    )
  }

  const validate_value_shape = (value: unknown): void => {
    if (!is_object(value)) return
    validate_object_shape(value)
    if (value instanceof Date || value instanceof RegExp) return
    if (Array.isArray(value)) {
      for (const item of value) validate_value_shape(item)
      return
    }
    for (const item of Object.values(value)) validate_value_shape(item)
  }

  // Capture reset values once at mount - must NOT be $derived or it tracks changes.
  const reference_values = untrack(() => {
    if (!reset_values) return deep_copy(current_values) as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(current_values)
        .filter((key) => Object.hasOwn(reset_values, key))
        .map((key) => [key, deep_copy(reset_values[key])]),
    )
  })

  // per-instance id so aria-labelledby stays valid with multiple sections on a page
  const section_id = $props.id()
  const title_id = `settings-section-title-${section_id}`

  const scalar_of = (value: object): number | string | undefined =>
    value instanceof Date
      ? value.getTime()
      : value instanceof RegExp
        ? String(value)
        : undefined

  // Order-independent deep equality over the shapes `deep_copy` preserves
  const setting_equal = (left: unknown, right: unknown): boolean => {
    if (left === right || Object.is(left, right)) return true
    if (!is_object(left) || !is_object(right)) return false
    const [left_scalar, right_scalar] = [scalar_of(left), scalar_of(right)]
    if (left_scalar !== undefined || right_scalar !== undefined)
      return Object.is(left_scalar, right_scalar)
    if (Array.isArray(left) || Array.isArray(right)) {
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((item, idx) => setting_equal(item, right[idx]))
      )
    }
    const left_entries = Object.entries(left)
    return (
      left_entries.length === Object.keys(right).length &&
      left_entries.every(
        ([key, value]) => Object.hasOwn(right, key) && setting_equal(value, right[key]),
      )
    )
  }

  // Key presence counts on its own: additions/removals differ even when the value is undefined
  const changed_keys = $derived.by(() => {
    validate_value_shape(current_values)
    return Object.keys({ ...reference_values, ...current_values }).filter(
      (key) =>
        Object.hasOwn(reference_values, key) !== Object.hasOwn(current_values, key) ||
        !setting_equal(reference_values[key], current_values[key]),
    )
  })
  let has_descriptions = $state(false)
  const show_reset = $derived(
    changed_keys.length > 0 && Boolean(on_reset || on_reset_key),
  )

  const reset_key = (key: string): void => {
    if (!on_reset_key || !changed_keys.includes(key)) return
    const reference_present = Object.hasOwn(reference_values, key)
    on_reset_key(key, deep_copy(reference_values[key]), reference_present)
  }

  // Our buttons may sit inside a <summary> or <label>, neither of which should react to them
  const swallow_click = (action: () => void) => (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    action()
  }

  const handle_reset = swallow_click(() => {
    if (on_reset) on_reset()
    // snapshot: each reset_key shrinks changed_keys as the caller writes the value back
    else for (const key of changed_keys.slice()) reset_key(key)
  })

  const DESCRIPTION_SELECTOR = `:scope > .settings-row-description`
  const RESET_SELECTOR = `:scope > .setting-reset-button`

  // A <label> only names its first control, so a slider paired with a number input goes
  // unnamed. Recording the text we set lets a later pass rename or revoke it registry-free,
  // even on rows Svelte already detached.
  const AUTO_LABEL_ATTR = `data-auto-label`

  const release_auto_label = (control: Element): void => {
    if (control.getAttribute(`aria-label`) === control.getAttribute(AUTO_LABEL_ATTR)) {
      control.removeAttribute(`aria-label`)
    }
    control.removeAttribute(AUTO_LABEL_ATTR)
  }

  // Only explicitly keyed rows are enhanced; without either opt-in prop the DOM is untouched.
  const enhance_rows = (section: HTMLElement): (() => void) => {
    // Plain Map, not SvelteMap: `refresh` reads and writes this inside an effect, which
    // reactive entries would turn into an endless loop.
    const original_descriptions = new Map<HTMLElement, string | null>()
    // What this attachment last wrote to each row's `data-description`; anything else on the
    // attribute came from the caller and is re-snapshotted rather than overwritten.
    const written_descriptions = new Map<HTMLElement, string | null>()

    const remove_reset_button = (row: HTMLElement): void => {
      const button = row.querySelector(RESET_SELECTOR)
      // Resetting removes this button, so a keyboard user who just pressed it would land on
      // <body>. Hand focus to the row's own control instead.
      const had_focus = button !== null && button === document.activeElement
      button?.remove()
      row.classList.remove(`has-setting-reset`)
      if (!had_focus) return
      const control = row.querySelector<HTMLElement>(`input, select, textarea, button`)
      if (control) control.focus()
      else if (row.tabIndex >= 0) row.focus()
    }

    const cleanup_enhancement = (row: HTMLElement, original: string | null): void => {
      row.querySelector(DESCRIPTION_SELECTOR)?.remove()
      remove_reset_button(row)
      for (const control of row.querySelectorAll(`[${AUTO_LABEL_ATTR}]`)) {
        release_auto_label(control)
      }
      if (original === null) row.removeAttribute(`data-description`)
      else row.setAttribute(`data-description`, original)
    }

    // `data-label` short-circuits the clone, which only strips controls and our own appended
    // description out of the row's text.
    const label_text = (row: HTMLLabelElement): string => {
      let text = row.dataset.label
      if (text === undefined) {
        const label_copy = row.cloneNode(true) as HTMLElement
        for (const control of label_copy.querySelectorAll(
          `input, select, textarea, button, .settings-row-description`,
        )) {
          control.remove()
        }
        text = label_copy.textContent ?? ``
      }
      return text.replaceAll(/\s+/gu, ` `).trim()
    }

    const sync_labeled_controls = (row: HTMLElement): void => {
      const label = row instanceof HTMLLabelElement ? label_text(row) : ``
      for (const control of row.querySelectorAll(`input, select, textarea`)) {
        const marker = control.getAttribute(AUTO_LABEL_ATTR)
        // An author-set name always wins: any name other than the one we recorded is theirs
        if (control.getAttribute(`aria-label`) !== marker) {
          control.removeAttribute(AUTO_LABEL_ATTR)
          continue
        }
        if (marker === null && control.hasAttribute(`aria-labelledby`)) continue
        if (!label) release_auto_label(control)
        else if (marker !== label) {
          control.setAttribute(`aria-label`, label)
          control.setAttribute(AUTO_LABEL_ATTR, label)
        }
      }
    }

    const enhance_row = (row: HTMLElement): boolean => {
      const key = row.dataset.key
      if (!key) return false
      // Re-snapshot whenever the attribute holds something we did not write: the caller
      // updated a reactive `data-description` and the mount-time value would clobber it.
      // getAttribute returns null, never undefined, so an unseen row snapshots here too.
      const current_description = row.getAttribute(`data-description`)
      if (current_description !== written_descriptions.get(row)) {
        original_descriptions.set(row, current_description)
      }
      sync_labeled_controls(row)

      // `setting_metadata` overrides the row's `data-description`, restored if the key drops
      const metadata = setting_metadata?.[key]
      const description =
        (typeof metadata === `string` ? metadata : metadata?.description) ??
        original_descriptions.get(row)
      // Write only on real change: setAttribute queues a mutation record even for an identical
      // value, and SettingsSearch observes this attribute.
      const next_description = description || null
      if (next_description !== current_description) {
        if (next_description) row.setAttribute(`data-description`, next_description)
        else row.removeAttribute(`data-description`)
      }
      written_descriptions.set(row, next_description)

      let description_element = row.querySelector(DESCRIPTION_SELECTOR)
      if (!descriptions_open || !description) description_element?.remove()
      else {
        if (!description_element) {
          description_element = document.createElement(`small`)
          description_element.className = `settings-row-description`
          row.append(description_element)
        }
        // assigning textContent replaces the node even when unchanged, which would notify
        // our own subtree observer forever
        if (description_element.textContent !== description) {
          description_element.textContent = description
        }
      }

      if (!on_reset_key || !changed_keys.includes(key)) remove_reset_button(row)
      else {
        let reset_button = row.querySelector<HTMLButtonElement>(RESET_SELECTOR)
        if (!reset_button) {
          reset_button = document.createElement(`button`)
          reset_button.setAttribute(`type`, `button`)
          reset_button.className = `setting-reset-button`
          reset_button.textContent = `↶`
          // Resolve the key at click time so a row that changes data-key needs no rewiring
          reset_button.addEventListener(
            `click`,
            swallow_click(() => {
              if (row.dataset.key) reset_key(row.dataset.key)
            }),
          )
          row.classList.add(`has-setting-reset`)
          row.append(reset_button)
        }
        for (const attribute of [`aria-label`, `title`]) {
          reset_button.setAttribute(attribute, msg.reset_key(key))
        }
      }
      return Boolean(description)
    }

    const refresh = (): void => {
      // `map`, not `some`: every row has to be enhanced, short-circuiting would skip the rest
      const rows = [...section.querySelectorAll<HTMLElement>(`[data-key]`)]
      has_descriptions = rows.map(enhance_row).includes(true)
      for (const [row, original] of original_descriptions) {
        if (!row.isConnected || !section.contains(row) || !row.dataset.key) {
          cleanup_enhancement(row, original)
          original_descriptions.delete(row)
          written_descriptions.delete(row)
        }
      }
    }

    const stop_observing = observe_subtree(
      section,
      [`data-key`, `data-label`, `data-description`],
      refresh,
    )
    // `refresh` reads `changed_keys`, `descriptions_open` and `setting_metadata`, so this
    // re-enhances on change; from the attachment body it would tear everything off first.
    $effect(refresh)

    return () => {
      stop_observing()
      for (const [row, original] of original_descriptions)
        cleanup_enhancement(row, original)
      has_descriptions = false
    }
  }
</script>

<div class="settings-section-heading">
  <h4 id={title_id}>{title}</h4>
  {#if has_descriptions || show_reset}
    <span class="heading-actions">
      {#if has_descriptions}
        <button
          type="button"
          class="description-toggle"
          onclick={swallow_click(() => (descriptions_open = !descriptions_open))}
          aria-expanded={descriptions_open}
          aria-label={msg.explain_toggle(descriptions_open, title)}
        >
          {msg.explain}
        </button>
      {/if}
      {#if show_reset}
        <button
          type="button"
          class="reset-button"
          onclick={handle_reset}
          title={msg.reset_section(title)}
          aria-label={msg.reset_section(title)}
        >
          <Icon icon={Reset} style="width: 0.9em; height: 0.9em" />
          {msg.reset}
        </button>
      {/if}
    </span>
  {/if}
</div>
<section
  {...rest}
  class={[`settings-section`, rest.class, layout]}
  aria-labelledby={title_id}
  {@attach on_reset_key || setting_metadata ? enhance_rows : null}
>
  {@render children()}
</section>

<style>
  /* flex row, not absolute actions, so a long title is squeezed instead of running under them */
  .settings-section-heading {
    display: flex;
    align-items: center;
    gap: 3pt;
  }
  h4 {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :is(.reset-button, .description-toggle) {
    padding: var(--reset-btn-padding, 1pt 4pt);
    font-size: 0.65em;
    border-radius: var(--reset-btn-border-radius, var(--border-radius, 3pt));
    background: var(--btn-bg, rgba(0, 0, 0, 0.1));
    color: var(--text-color-muted, #6b7280);
    border: 1px solid var(--border-color, #d1d5db);
    cursor: pointer;
    box-shadow: none;
    opacity: 0.7;
    /* only the toggle carries aria-expanded, so it reads as pressed while descriptions show */
    &:hover,
    &[aria-expanded='true'] {
      background: var(--btn-bg-hover, rgba(0, 0, 0, 0.2));
      color: var(--text-color, #374151);
      opacity: 1;
    }
  }
  .reset-button {
    display: flex;
    align-items: center;
    gap: 2pt;
    transition: all 0.15s ease;
    &:hover {
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
  }
  .heading-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 3pt;
    margin-inline-start: auto;
  }
  section :global([data-key].has-setting-reset) {
    position: relative;
    padding-inline-end: 1.6em;
  }
  section :global(.setting-reset-button) {
    position: absolute;
    top: 50%;
    right: 1pt;
    translate: 0 -50%;
    display: grid;
    place-items: center;
    width: 1.35em;
    height: 1.35em;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius, 3pt);
    background: transparent;
    color: var(--text-color-muted, #6b7280);
    font: inherit;
    line-height: 1;
    cursor: pointer;
    opacity: 0.65;
    &:hover,
    &:focus-visible {
      background: var(--btn-bg-hover, rgba(0, 0, 0, 0.15));
      color: var(--text-color, #374151);
      opacity: 1;
    }
  }
  section :global(.settings-row-description) {
    grid-column: 1 / -1;
    display: block;
    margin: 1pt 0 2pt;
    color: var(--text-color-muted, #6b7280);
    font-size: 0.78em;
    font-weight: 400;
    line-height: 1.3;
  }
  section.grid {
    display: grid;
    gap: var(--settings-row-gap, 4pt) 0;
    align-content: start;
  }
  /* --ctrl-cols is published so panes can give nested rows the same rhythm without restating
     the track list */
  section.grid > :global(:is(label, .setting)) {
    display: grid;
    grid-template-columns: var(
      --ctrl-cols,
      var(--ctrl-label-w, 8.5em) var(--ctrl-value-w, 4em) minmax(0, 1fr)
    );
    align-items: center;
    column-gap: var(--ctrl-gap, 7pt);
    min-height: 1.9em;
    margin: 0;
    /* the label cell truncates rather than wrapping the row onto a second line */
    > :global(:first-child) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* a row holding a single control lets it span the last two tracks */
    > :global(
      :nth-child(2):is(
        :last-child,
        :has(+ .settings-row-description),
        :has(+ .setting-reset-button)
      )
    ) {
      grid-column: 2 / -1;
    }
    /* fixed-size controls keep their size instead of stretching across their track */
    > :global(:is(input[type='color'], input[type='checkbox'])) {
      justify-self: start;
    }
    /* range inputs have an intrinsic width and will not stretch into their track on their own */
    > :global(input[type='range']) {
      width: 100%;
      min-width: 40px;
    }
  }
</style>
