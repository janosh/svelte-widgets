<script lang="ts">
  import type { Snippet } from 'svelte'
  import { untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { Reset } from './icons'
  import { is_object, observe_subtree } from './utils'

  type SettingMetadata = Readonly<
    Record<string, string | { readonly description: string } | undefined>
  >

  let {
    title,
    current_values = {},
    children,
    layout = `flow`,
    on_reset,
    on_reset_key,
    setting_metadata,
    descriptions_open = $bindable(false),
    ...rest
  }: HTMLAttributes<HTMLElementTagNameMap[`section`]> & {
    title: string
    // Omit for a section that only holds actions (export buttons, say) and has nothing to diff.
    // Values may be primitives, arrays, plain objects, Date, or RegExp. Map, Set, and typed
    // arrays are unsupported because reset snapshots and comparisons only cover these shapes.
    current_values?: Record<string, unknown>
    children: Snippet
    // `grid` puts every direct label/.setting row on one shared [label][value][wide control]
    // column rhythm, so controls line up down the whole section instead of starting wherever
    // each row's label text happens to end. `flow` leaves layout to the caller.
    layout?: `flow` | `grid`
    // Omit to reset every changed key through `on_reset_key`. Pass one only for sections whose
    // reset has to do more than restore values (clearing validation state, for instance).
    on_reset?: () => void
    // Rows opt in with `data-key`. The callback receives the mounted reference value and
    // whether that key originally existed, so callers can restore or delete it exactly.
    on_reset_key?: (
      key: string,
      reference_value: unknown,
      reference_present: boolean,
    ) => void
    // Accepts schema objects directly as well as a compact key-to-description map.
    setting_metadata?: SettingMetadata
    descriptions_open?: boolean
  } = $props()

  const deep_copy = (value: unknown): unknown => {
    if (!is_object(value)) return value
    if (value instanceof Date) return new Date(value)
    if (value instanceof RegExp) return new RegExp(value)
    if (Array.isArray(value)) return value.map(deep_copy)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deep_copy(item)]),
    )
  }

  // Capture initial values once at mount - must NOT be $derived or it tracks changes
  const reference_values = untrack(() => deep_copy(current_values)) as Record<
    string,
    unknown
  >

  // unique per-instance id so aria-labelledby stays valid with multiple sections on a page
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
    if (Object.is(left, right)) return true
    if (!is_object(left) || !is_object(right)) return false
    const [left_scalar, right_scalar] = [scalar_of(left), scalar_of(right)]
    if (left_scalar !== undefined || right_scalar !== undefined)
      return left_scalar === right_scalar
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

  // Key presence is independent of value: additions/removals count even when the
  // value is undefined. Only compare values when both sides own the key.
  const changed_keys = $derived(
    Object.keys({ ...reference_values, ...current_values }).filter(
      (key) =>
        Object.hasOwn(reference_values, key) !== Object.hasOwn(current_values, key) ||
        !setting_equal(reference_values[key], current_values[key]),
    ),
  )
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
    // Snapshot first: each reset_key shrinks changed_keys as the caller writes the value back
    else for (const key of changed_keys.slice()) reset_key(key)
  })

  const DESCRIPTION_SELECTOR = `:scope > .settings-row-description`
  const RESET_SELECTOR = `:scope > .setting-reset-button`

  // A <label> only names its first control, so the slider paired with a number input would go
  // unnamed. Mark every control we name with the exact text used: that is enough to rename or
  // revoke it on a later pass without keeping a registry of elements, and it works on rows
  // Svelte has already detached.
  const AUTO_LABEL_ATTR = `data-auto-label`

  const release_auto_label = (control: Element): void => {
    if (control.getAttribute(`aria-label`) === control.getAttribute(AUTO_LABEL_ATTR)) {
      control.removeAttribute(`aria-label`)
    }
    control.removeAttribute(AUTO_LABEL_ATTR)
  }

  // Enhance only explicitly keyed rows. Callers that omit both opt-in props never attach this
  // behavior, preserving the historical DOM and event handling.
  const enhance_rows = (section: HTMLElement): (() => void) => {
    // The only thing worth remembering per row: everything else we add is findable in the row
    // itself, and a cached node goes stale the moment Svelte re-renders around it. Deliberately
    // a plain Map, not a SvelteMap: `refresh` runs inside an effect and both reads and writes
    // this, which reactive entries turn into an endless loop.
    const original_descriptions = new Map<HTMLElement, string | null>()

    const remove_reset_button = (row: HTMLElement): void => {
      row.querySelector(RESET_SELECTOR)?.remove()
      row.classList.remove(`has-setting-reset`)
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

    // `data-label` short-circuits the clone, which only exists to strip the controls and our
    // own appended description out of the row's text before reading it.
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
        // An author-set name always wins, whether it was there first or replaced ours: any
        // name that is not the one we recorded is theirs, so drop our claim and leave it be.
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
      if (!original_descriptions.has(row)) {
        original_descriptions.set(row, row.getAttribute(`data-description`))
      }
      sync_labeled_controls(row)

      // `setting_metadata` overrides the row's own `data-description`, which is restored
      // whenever the mapping drops the key again.
      const metadata = setting_metadata?.[key]
      const description =
        (typeof metadata === `string` ? metadata : metadata?.description) ??
        original_descriptions.get(row)
      if (description) row.setAttribute(`data-description`, description)
      else row.removeAttribute(`data-description`)

      let description_element = row.querySelector(DESCRIPTION_SELECTOR)
      if (!descriptions_open || !description) description_element?.remove()
      else {
        if (!description_element) {
          description_element = document.createElement(`small`)
          description_element.className = `settings-row-description`
          row.append(description_element)
        }
        // Avoid notifying our own subtree observer forever: assigning textContent replaces
        // the text node even when the string is unchanged.
        if (description_element.textContent !== description) {
          description_element.textContent = description
        }
      }

      if (!on_reset_key || !changed_keys.includes(key)) remove_reset_button(row)
      else {
        let reset_button = row.querySelector(RESET_SELECTOR)
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
          reset_button.setAttribute(attribute, `Reset ${key} to default`)
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
        }
      }
    }

    const stop_observing = observe_subtree(section, [`data-key`, `data-label`], refresh)
    // `refresh` reads `changed_keys`, `descriptions_open` and `setting_metadata`, so this
    // re-enhances when they change. Calling it from the attachment body instead would re-run
    // the whole attachment, tearing every reset button and description back off first.
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
          aria-label="{descriptions_open
            ? `Hide`
            : `Show`} descriptions for {title.toLowerCase()}"
        >
          Explain
        </button>
      {/if}
      {#if show_reset}
        <button
          type="button"
          class="reset-button"
          onclick={handle_reset}
          title="Reset {title.toLowerCase()} to defaults"
          aria-label="Reset {title.toLowerCase()} to defaults"
        >
          <Icon icon={Reset} style="width: 0.9em; height: 0.9em" />
          Reset
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
  /* A flex row rather than absolutely positioned actions, so a long title is squeezed by the
     buttons instead of running underneath them. */
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
  /* --ctrl-cols is published so a pane can give the same rhythm to rows it nests one level
     deeper (grouped axis rows, say) without restating the track list. */
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
