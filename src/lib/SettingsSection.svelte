<script lang="ts">
  import { tick, type Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { Reset } from './icons'
  import {
    merge_defaults,
    SETTINGS_SECTION_LABELS,
    type SettingsSectionLabels,
  } from './labels'
  import { observe_subtree } from './utils'

  type SettingMetadata = Readonly<
    Record<string, string | { readonly description: string } | undefined>
  >

  let {
    title,
    labels,
    changed_keys = [],
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
    // The caller owns values, defaults, and equality; only changed keys belong here.
    changed_keys?: readonly string[]
    children: Snippet
    // `grid` aligns every direct label/.setting row on one [label][value][wide control]
    // rhythm instead of wherever each label's text ends; `flow` leaves layout to the caller.
    layout?: `flow` | `grid`
    // Omit to reset every changed key through `on_reset_key`. Pass one only when reset has to
    // do more than restore values (clearing validation state, say).
    on_reset?: () => void
    // Rows opt in with `data-key`; the caller restores or deletes the requested key.
    on_reset_key?: (key: string) => void
    // Accepts schema objects directly as well as a compact key-to-description map.
    setting_metadata?: SettingMetadata
    descriptions_open?: boolean
  } = $props()

  const msg = $derived(merge_defaults(SETTINGS_SECTION_LABELS, labels))

  // per-instance id so aria-labelledby stays valid with multiple sections on a page
  const section_id = $props.id()
  const title_id = `settings-section-title-${section_id}`

  let has_descriptions = $state(false)
  const show_reset = $derived(
    changed_keys.length > 0 && Boolean(on_reset || on_reset_key),
  )

  const reset_key = (key: string): void => {
    if (!on_reset_key || !changed_keys.includes(key)) return
    on_reset_key(key)
  }

  // Reset buttons may sit inside a <summary> or <label>, neither of which should react to them.
  const swallow_click = (action: () => void) => (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    action()
  }

  let section_element = $state<HTMLElement>()
  const handle_reset = swallow_click(async () => {
    const focused = document.activeElement
    if (on_reset) on_reset()
    // snapshot: each reset_key shrinks changed_keys as the caller writes the value back
    else for (const key of changed_keys.slice()) reset_key(key)
    await tick()
    if (focused && !focused.isConnected && section_element) {
      const target =
        section_element.querySelector<HTMLElement>(
          `input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex="0"]`,
        ) ?? section_element
      if (target === section_element) target.tabIndex = -1
      target.focus()
    }
  })

  const DESCRIPTION_SELECTOR = `:scope > .settings-row-description`
  const RESET_SELECTOR = `:scope > .setting-reset-button`

  // A <label> only names its first control, so a slider paired with a number input goes
  // unnamed. Recording the generated label lets a later pass rename or revoke it registry-free,
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
    // Plain Map: reactive entries would make `refresh` loop. Keep caller text alongside
    // the component's last write so external updates are re-snapshotted rather than overwritten.
    const descriptions = new Map<
      HTMLElement,
      { original: string | null; written: string | null }
    >()

    const remove_reset_button = (row: HTMLElement): void => {
      const button = row.querySelector(RESET_SELECTOR)
      // Resetting removes this button, so a keyboard user who just pressed it would land on
      // <body>. Hand focus to the row's own control instead.
      const had_focus = button !== null && button === document.activeElement
      button?.remove()
      if (!had_focus) return
      const control = row.querySelector<HTMLElement>(`input, select, textarea, button`)
      if (control) control.focus()
      else if (row.tabIndex >= 0) row.focus()
    }

    const cleanup_enhancement = (row: HTMLElement, original: string | null): void => {
      row.querySelector(DESCRIPTION_SELECTOR)?.remove()
      remove_reset_button(row)
      row.classList.remove(`setting-resettable`)
      for (const control of row.querySelectorAll(`[${AUTO_LABEL_ATTR}]`)) {
        release_auto_label(control)
      }
      if (original === null) row.removeAttribute(`data-description`)
      else row.setAttribute(`data-description`, original)
    }

    // `data-label` short-circuits the clone, which only strips controls and the appended
    // description out of the row's text.
    const label_text = (row: HTMLElement): string => {
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

    const sync_labeled_controls = (row: HTMLElement, label: string): void => {
      for (const control of row.querySelectorAll(`input, select, textarea`)) {
        const marker = control.getAttribute(AUTO_LABEL_ATTR)
        // Preserve author-set names that differ from the recorded generated label.
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
      const current_description = row.getAttribute(`data-description`)
      const saved = descriptions.get(row) ?? {
        original: current_description,
        written: current_description,
      }
      if (current_description !== saved.written) saved.original = current_description
      const label = label_text(row)
      sync_labeled_controls(row, row instanceof HTMLLabelElement ? label : ``)

      // `setting_metadata` overrides the row's `data-description`, restored if the key drops
      const metadata = setting_metadata?.[key]
      const description =
        (typeof metadata === `string` ? metadata : metadata?.description) ??
        saved.original
      // Write only on real change: setAttribute queues a mutation record even for an identical
      // value, and SettingsSearch observes this attribute.
      const next_description = description || null
      if (next_description !== current_description) {
        if (next_description) row.setAttribute(`data-description`, next_description)
        else row.removeAttribute(`data-description`)
      }
      saved.written = next_description
      descriptions.set(row, saved)

      let description_element = row.querySelector(DESCRIPTION_SELECTOR)
      if (!descriptions_open || !description) description_element?.remove()
      else {
        if (!description_element) {
          description_element = document.createElement(`small`)
          description_element.className = `settings-row-description`
          row.append(description_element)
        }
        // assigning textContent replaces the node even when unchanged, which would notify
        // the component's subtree observer forever
        if (description_element.textContent !== description) {
          description_element.textContent = description
        }
      }

      // Reserve the gutter before the value changes, including during keyboard edits.
      const resettable = Boolean(on_reset_key)
      row.classList.toggle(`setting-resettable`, resettable)
      if (!resettable || !changed_keys.includes(key)) remove_reset_button(row)
      else {
        let reset_button = row.querySelector<HTMLButtonElement>(RESET_SELECTOR)
        if (!reset_button) {
          reset_button = document.createElement(`button`)
          reset_button.setAttribute(`type`, `button`)
          reset_button.className = `setting-reset-button`
          reset_button.innerHTML = `<svg viewBox="${Reset.viewBox}" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="${Reset.d}" /></svg>`
          // Resolve the key at click time so a row that changes data-key needs no rewiring
          reset_button.addEventListener(
            `click`,
            swallow_click(() => {
              if (row.dataset.key) reset_key(row.dataset.key)
            }),
          )
          row.append(reset_button)
        }
        const reset_label = msg.reset_key(label || key.replaceAll(/[_-]+/gu, ` `))
        for (const attribute of [`aria-label`, `title`]) {
          reset_button.setAttribute(attribute, reset_label)
        }
      }
      return Boolean(description)
    }

    const refresh = (): void => {
      // `map`, not `some`: every row has to be enhanced, short-circuiting would skip the rest
      const rows = [...section.querySelectorAll<HTMLElement>(`[data-key]`)]
      has_descriptions = rows.map(enhance_row).includes(true)
      for (const [row, { original }] of descriptions) {
        if (!row.isConnected || !section.contains(row) || !row.dataset.key) {
          cleanup_enhancement(row, original)
          descriptions.delete(row)
        }
      }
    }

    const stop_observing = observe_subtree(
      section,
      [`data-key`, `data-label`, `data-description`],
      refresh,
      true,
    )
    // `refresh` reads `changed_keys`, `descriptions_open` and `setting_metadata`, so this
    // re-enhances on change; from the attachment body it would tear everything off first.
    $effect(refresh)

    return () => {
      stop_observing()
      for (const [row, { original }] of descriptions) cleanup_enhancement(row, original)
      has_descriptions = false
    }
  }
</script>

<div class="settings-section-heading">
  <h4 id={title_id} data-heading-anchor="false">{title}</h4>
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
  bind:this={section_element}
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
  section :global([data-key].setting-resettable) {
    position: relative;
    box-sizing: border-box;
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
      grid-column: 2;
    }
    > :global(input[type='checkbox']) {
      width: auto;
    }
    /* range inputs have an intrinsic width and will not stretch into their track on their own */
    > :global(input[type='range']) {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: 0;
    }
  }
</style>
