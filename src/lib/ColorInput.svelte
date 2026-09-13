<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { COLOR_INPUT_LABELS, merge_defaults, type ColorInputLabels } from './labels'

  let {
    value = $bindable(`#000000`),
    alpha = false,
    presets = [],
    label,
    name,
    disabled = false,
    readonly = false,
    commit = `input`,
    on_commit,
    labels,
    ...rest
  }: Omit<HTMLAttributes<HTMLFieldSetElement>, `oninput` | `onchange`> & {
    // Accepts short or long hex, with an optional #. Edits emit lowercase #rrggbb[aa].
    value?: string
    alpha?: boolean
    presets?: readonly string[]
    label?: string
    name?: string
    disabled?: boolean
    readonly?: boolean
    commit?: `input` | `change`
    on_commit?: (value: string) => void
    labels?: Partial<ColorInputLabels>
  } = $props()

  const component_id = $props.id()
  const error_id = `${component_id}-error`
  const msg = $derived(merge_defaults(COLOR_INPUT_LABELS, labels))
  const pattern = $derived(
    alpha
      ? /^\s*#?(?<digits>[\da-fA-F]{3,4}|[\da-fA-F]{6}|[\da-fA-F]{8})\s*$/
      : /^\s*#?(?<digits>[\da-fA-F]{3}|[\da-fA-F]{6})\s*$/,
  )
  const normalize = (input: string): string | undefined => {
    const digits = pattern.exec(input)?.groups?.digits.toLowerCase()
    if (!digits) return
    const expanded =
      digits.length <= 4 ? [...digits].map((digit) => digit.repeat(2)).join(``) : digits
    return `#${expanded.padEnd(alpha ? 8 : 6, `f`)}`
  }
  const checked_color = (input: string): string => {
    const normalized = normalize(input)
    if (!normalized)
      throw new Error(
        `ColorInput needs a hex color${alpha ? ` with optional alpha` : ``}, got ${JSON.stringify(input)}`,
      )
    return normalized
  }
  const color = $derived(checked_color(value))
  const palette = $derived(presets.map(checked_color))
  // Invalid drafts remain editable; controls continue to show the committed color.
  let draft = $derived(color)
  const parsed = $derived(normalize(draft))
  const preview = $derived(parsed ?? color)
  const opacity = $derived.by(() => {
    const alpha_byte = alpha ? parseInt(preview.slice(7), 16) : 255
    return Math.round((alpha_byte / 255) * 100)
  })

  const update = (next_draft: string, final = false): void => {
    if (disabled || readonly) return
    const next = normalize(next_draft)
    if (next && (final || commit === `input`) && next !== color) {
      value = next
      on_commit?.(next)
    }
    // Resolve the bound update before restoring the raw text, so short hex expands
    // in the binding without replacing a six-digit color still being typed.
    const committed = color
    draft = final ? committed : next_draft
  }
  const pick = (input: HTMLInputElement, final = false): void =>
    update(`${input.value}${alpha ? preview.slice(7) : ``}`, final)
  const change_opacity = (input: HTMLInputElement, final = false): void => {
    if (disabled || readonly) return
    const next_opacity = input.valueAsNumber
    if (Number.isFinite(next_opacity) && input.validity.valid) {
      // Blurring an unchanged percentage must preserve the exact alpha byte.
      const alpha_hex =
        next_opacity === opacity
          ? preview.slice(7)
          : Math.round((next_opacity * 255) / 100)
              .toString(16)
              .padStart(2, `0`)
      update(`${preview.slice(0, 7)}${alpha_hex}`, final)
    } else if (final) draft = color
    if (final) input.value = String(opacity)
  }
  const handle_keydown = (
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
  ): void => {
    if (event.isComposing) return
    const input = event.currentTarget
    if (event.key === `Enter`) {
      event.preventDefault()
      if (input.type === `number`) change_opacity(input, true)
      else update(input.value, true)
    } else if (event.key === `Escape`) {
      event.preventDefault()
      draft = color
      input.value = input.type === `number` ? String(opacity) : draft
    }
  }
</script>

<fieldset {...rest} {disabled}>
  <legend>{label ?? msg.color}</legend>
  <div class="controls">
    <span class="swatch" style:--color={preview}>
      <input
        type="color"
        value={preview.slice(0, 7)}
        disabled={disabled || readonly}
        aria-label={msg.picker}
        oninput={(event) => pick(event.currentTarget)}
        onchange={(event) => pick(event.currentTarget, true)}
      />
    </span>
    <input
      type="text"
      {name}
      {readonly}
      {disabled}
      pattern={pattern.source}
      required
      spellcheck="false"
      autocomplete="off"
      value={draft}
      aria-label={msg.hex}
      aria-invalid={!parsed || undefined}
      aria-describedby={!parsed ? error_id : undefined}
      oninput={(event) => update(event.currentTarget.value)}
      onchange={(event) => update(event.currentTarget.value, true)}
      onblur={(event) => update(event.currentTarget.value, true)}
      onkeydown={handle_keydown}
    />
    {#if alpha}
      <label class="opacity">
        {msg.opacity}
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          required
          value={opacity}
          aria-valuetext={`${opacity}%`}
          disabled={disabled || readonly}
          oninput={(event) => change_opacity(event.currentTarget)}
          onchange={(event) => change_opacity(event.currentTarget, true)}
          onblur={(event) => change_opacity(event.currentTarget, true)}
          onkeydown={handle_keydown}
        />
        <span aria-hidden="true">%</span>
      </label>
    {/if}
  </div>
  {#if !parsed}<small id={error_id}>{msg.invalid}</small>{/if}
  {#if palette.length}
    <div class="presets">
      {#each palette as preset}
        <button
          type="button"
          class="swatch"
          style:--color={preset}
          disabled={disabled || readonly}
          aria-label={msg.preset(preset)}
          title={preset}
          aria-pressed={preset === color}
          onclick={() => update(preset, true)}
        ></button>
      {/each}
    </div>
  {/if}
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    font: inherit;
  }
  legend {
    margin-bottom: 0.35em;
    padding: 0;
  }
  .controls,
  .presets,
  .opacity {
    display: flex;
    align-items: center;
    gap: 0.5em;
    flex-wrap: wrap;
  }
  .swatch {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    width: 2em;
    height: 2em;
    padding: 0;
    border: 1px solid light-dark(#888, #777);
    border-radius: 0.3em;
    background:
      linear-gradient(var(--color), var(--color)),
      repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 / 10px 10px;
    &:focus-within,
    &[aria-pressed='true'] {
      outline: 2px solid var(--color-input-focus, Highlight);
      outline-offset: 2px;
    }
    input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
  }
  input[type='text'],
  input[type='number'] {
    field-sizing: content;
    min-width: 1ch;
    max-width: 100%;
    font: inherit;
    line-height: 1.2;
    padding: 0.05em 0.1em;
    border: 1px solid light-dark(#888, #777);
    border-radius: 0.3em;
    &[aria-invalid='true'] {
      border-color: var(--color-input-error, #d43f3a);
    }
  }
  input[type='text'] {
    padding-inline: 0.35em;
  }
  .opacity {
    font-size: 0.85em;
  }
  .presets {
    margin-top: 0.6em;
  }
  small {
    color: var(--color-input-error, #d43f3a);
  }
  :disabled {
    cursor: not-allowed;
  }
</style>
