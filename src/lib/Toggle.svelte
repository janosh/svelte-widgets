<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes, HTMLInputAttributes } from 'svelte/elements'

  let {
    checked = $bindable(false),
    onkeydown,
    children,
    input_props,
    ...rest
  }: Omit<HTMLAttributes<HTMLLabelElement>, 'children'> & {
    checked?: boolean
    // the input's keydown hook, chained ahead of the Enter handling below
    onkeydown?: (event: KeyboardEvent) => void
    children?: Snippet<[{ checked: boolean }]>
    // `checked`/`type` would detach bind:checked; use the `onkeydown` prop above instead
    input_props?: Omit<HTMLInputAttributes, `checked` | `onkeydown` | `type`>
  } = $props()

  // a checkbox toggles on space only; this adds Enter
  function handle_keydown(event: KeyboardEvent) {
    onkeydown?.(event)
    if (event.key === `Enter`) {
      event.preventDefault()
      if (event.target instanceof HTMLInputElement) event.target.click() // so 'change' fires
    }
  }
</script>

<label {...rest}>
  {@render children?.({ checked })}
  <input {...input_props} type="checkbox" bind:checked onkeydown={handle_keydown} />
  <span></span>
</label>

<style>
  label {
    display: var(--toggle-label-display, inline-flex);
    align-items: var(--toggle-label-align-items, center);
    width: var(--toggle-label-width, max-content);
    vertical-align: var(--toggle-label-vertical-align, middle);
  }
  span {
    box-sizing: border-box;
    height: var(--toggle-knob-height, 1.5em);
    width: var(--toggle-knob-width, 3em);
    padding: var(--toggle-knob-padding, 0.1em);
    border: var(--toggle-knob-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--toggle-knob-border-radius, 0.75em);
    transition: var(--toggle-knob-transition, 0.3s);
  }
  input:checked + span {
    background: var(--toggle-background, light-dark(#222, #555));
  }
  input {
    position: absolute;
    opacity: 0;
    width: var(--toggle-input-width, 1em);
  }
  input + span::after {
    content: '';
    display: var(--toggle-knob-after-display, block);
    height: var(--toggle-knob-after-height, 1.2em);
    width: var(--toggle-knob-after-width, 1.2em);
    border-radius: var(--toggle-knob-after-border-radius, 50%);
    background: var(--toggle-knob-after-background, light-dark(gray, #888));
    transition: var(--toggle-knob-after-transition, 0.3s);
  }
  input:checked + span::after {
    background: var(--toggle-knob-after-background, light-dark(green, #4ade80));
    transform: var(
      --toggle-knob-after-transform,
      translate(
        calc(
          var(--toggle-knob-width, 3em) - var(--toggle-knob-height, 1.5em) +
            var(--toggle-knob-padding, 0.1em) - var(--toggle-knob-border, 2px)
        )
      )
    );
  }
  /* in RTL the unchecked knob starts at the track's right edge, so the checked
  state slides it left by the same distance (negated default) */
  input:checked:dir(rtl) + span::after {
    transform: var(
      --toggle-knob-after-transform,
      translate(
        calc(
          -1 *
            (
              var(--toggle-knob-width, 3em) - var(--toggle-knob-height, 1.5em) +
                var(--toggle-knob-padding, 0.1em) - var(--toggle-knob-border, 2px)
            )
        )
      )
    );
  }
  input:focus + span {
    border: var(
      --toggle-knob-focus-border,
      1px solid light-dark(cornflowerblue, #6495ed)
    );
  }
</style>
