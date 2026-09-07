<script lang="ts">
  import type { Snippet } from 'svelte'
  import CopyButton from './CopyButton.svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { is_modifier_chord } from './utils'
  import {
    walkthrough_lines,
    validate_walkthrough,
    type WalkthroughStep,
  } from './code-walkthrough'
  import {
    CODE_WALKTHROUGH_LABELS,
    merge_defaults,
    type CodeWalkthroughLabels,
  } from './labels'

  let {
    steps,
    active_id = $bindable<string | undefined>(),
    preview,
    onstep,
    labels,
    ...rest
  }: {
    steps: readonly WalkthroughStep[]
    active_id?: string
    preview?: Snippet<[WalkthroughStep]>
    onstep?: (step: WalkthroughStep, index: number) => void
    labels?: Partial<CodeWalkthroughLabels>
  } & Omit<HTMLAttributes<HTMLElement>, `children`> = $props()

  const uid = $props.id()
  const msg = $derived(merge_defaults(CODE_WALKTHROUGH_LABELS, labels))
  const validated_steps = $derived.by(() => {
    validate_walkthrough(steps)
    return steps
  })
  const current_index = $derived.by(() => {
    if (active_id === undefined) return 0
    const index = validated_steps.findIndex(({ id }) => id === active_id)
    if (index === -1) throw new Error(`CodeWalkthrough has no step with id: ${active_id}`)
    return index
  })
  const current = $derived(validated_steps[current_index])
  const lines = $derived(walkthrough_lines(current))
  const focused = $derived(new Set(current.focus_lines))
  let step_buttons = $state<HTMLButtonElement[]>([])

  function select_step(index: number, focus = false) {
    if (index < 0 || index >= steps.length) return
    if (index !== current_index) {
      active_id = steps[index].id
      onstep?.(steps[index], index)
    }
    if (focus) step_buttons[index]?.focus()
  }
  function on_key(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      is_modifier_chord(event) ||
      event.shiftKey
    )
      return
    let target = current_index
    if (event.key === `ArrowDown`) target = (current_index + 1) % steps.length
    else if (event.key === `ArrowUp`)
      target = (current_index + steps.length - 1) % steps.length
    else if (event.key === `Home`) target = 0
    else if (event.key === `End`) target = steps.length - 1
    else return
    event.preventDefault()
    select_step(target, true)
  }
</script>

<section
  {...rest}
  class={[`code-walkthrough`, rest.class]}
  aria-label={rest['aria-label'] ?? msg.title}
>
  <div class="steps" role="tablist" aria-label={msg.steps} aria-orientation="vertical">
    {#each steps as step, index (step.id)}
      <button
        bind:this={step_buttons[index]}
        type="button"
        role="tab"
        id={`${uid}-step-${index}`}
        aria-controls={`${uid}-panel`}
        aria-selected={index === current_index}
        tabindex={index === current_index ? 0 : -1}
        onclick={() => select_step(index)}
        onkeydown={on_key}><span aria-hidden="true">{index + 1}</span>{step.title}</button
      >
    {/each}
  </div>
  <div
    class="panel"
    role="tabpanel"
    id={`${uid}-panel`}
    aria-labelledby={`${uid}-step-${current_index}`}
    tabindex="0"
  >
    <header>
      <h3>{current.title}</h3>
      <span aria-live="polite" aria-atomic="true"
        >{msg.progress(current_index + 1, steps.length)}</span
      >
    </header>
    {#if current.description}<p>{current.description}</p>{/if}
    {#if preview}<div class="preview">{@render preview(current)}</div>{/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- keyboard scrolling of long source -->
    <div class="source" role="region" aria-label={msg.code} tabindex="0">
      {#if current.language}<span class="language">{current.language}</span>{/if}
      <pre><CopyButton
          content={current.code}
          style="position: absolute; top: 0.4rem; right: 0.4rem"
        /><code
          >{#each lines as line}
            {@const annotation =
              line.after_line === undefined
                ? undefined
                : current.annotations?.[line.after_line]}
            <span
              class={[
                `line`,
                line.kind,
                {
                  focused: line.after_line !== undefined && focused.has(line.after_line),
                },
              ]}
              ><span class="number" aria-hidden="true"
                >{line.after_line ?? line.before_line}</span
              ><span
                class="change"
                role={line.kind === `context` ? undefined : `img`}
                aria-hidden={line.kind === `context` ? true : undefined}
                aria-label={line.kind === `added`
                  ? msg.added
                  : line.kind === `removed`
                    ? msg.removed
                    : undefined}
                >{line.kind === `added` ? `+` : line.kind === `removed` ? `−` : ` `}</span
              ><span class="text">{line.text || ` `}</span>{#if annotation}<span
                  class="annotation">{annotation}</span
                >{/if}</span
            >
          {/each}</code
        ></pre>
    </div>
    <footer>
      <button
        type="button"
        disabled={current_index === 0}
        onclick={() => select_step(current_index - 1)}>{msg.previous}</button
      >
      <button
        type="button"
        disabled={current_index === steps.length - 1}
        onclick={() => select_step(current_index + 1)}>{msg.next}</button
      >
    </footer>
  </div>
</section>

<style>
  section {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) minmax(0, 3fr);
    border-top: 1px solid var(--walkthrough-border, light-dark(#d5dbe5, #394352));
    overflow: hidden;
    background: var(--walkthrough-bg, transparent);
    color: var(--walkthrough-color, inherit);
  }
  button {
    border: 0;
    border-radius: 4px;
    color: inherit;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem;
    button {
      display: flex;
      gap: 0.65rem;
      align-items: center;
      padding: 0.65rem;
      text-align: start;
      &[aria-selected='true'] {
        background: light-dark(#edf2ff, #26334c);
        font-weight: 600;
      }
      span {
        display: grid;
        place-items: center;
        min-width: 1.5rem;
        height: 1.5rem;
        font-size: 0.8em;
      }
    }
  }
  .panel {
    min-width: 0;
    padding: 1rem;
    > header,
    > footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    h3 {
      margin: 0;
    }
    header > span {
      font-size: 0.8em;
      white-space: nowrap;
    }
    footer {
      margin-top: 0.75rem;
      button {
        min-height: 2.25rem;
        padding: 0.4rem 0.85rem;
        &:disabled {
          opacity: 0.45;
          cursor: default;
        }
        &:enabled:hover {
          background: light-dark(#edf2ff, #26334c);
        }
      }
    }
    > p {
      margin: 0.75rem 0;
    }
  }
  .preview {
    padding-block: 1rem;
    margin-block: 1rem;
    border-block: 1px solid var(--walkthrough-border, light-dark(#d5dbe5, #394352));
  }
  .source {
    position: relative;
    overflow: auto;
    max-height: var(--walkthrough-code-height, 30rem);
    margin-top: 0.75rem;
    background: var(--code-block-bg, light-dark(#f6f8fa, #0e131b));
    pre {
      margin: 0;
      background: transparent;
      border-radius: 0;
      padding: 2.5rem 0 0.75rem;
      width: max-content;
      min-width: 100%;
    }
    code {
      display: block;
      white-space: normal;
      font: 0.85rem / 1.6 var(--code-font, ui-monospace, monospace);
    }
    .language {
      position: sticky;
      inset-inline-start: 0.75rem;
      top: 0;
      font-size: 0.7em;
    }
  }
  .line {
    display: flex;
    min-height: 1.6em;
    padding-inline: 0.5rem 1rem;
    &.added {
      background: light-dark(#e3f5e8, #153321);
    }
    &.removed {
      background: light-dark(#ffe8e8, #3b2025);
    }
    &.focused {
      box-shadow: inset 3px 0 var(--walkthrough-accent, #6987ef);
      background: light-dark(#e9eeff, #25304a);
    }
    .number {
      min-width: 3ch;
      padding-inline-end: 1ch;
      text-align: end;
      user-select: none;
      opacity: 0.6;
    }
    .change {
      width: 2ch;
      flex-shrink: 0;
    }
    .text {
      white-space: pre;
    }
    .annotation {
      margin-inline-start: 2ch;
      padding-inline: 0.5em;
      white-space: normal;
      max-width: 25rem;
      font:
        0.9em / 1.6 system-ui,
        sans-serif;
    }
  }
  button:focus-visible,
  [tabindex='0']:focus-visible {
    outline: 2px solid var(--walkthrough-accent, #6987ef);
    outline-offset: -2px;
  }
  @media (max-width: 650px) {
    section {
      grid-template-columns: minmax(0, 1fr);
    }
    .steps {
      border-bottom: 1px solid var(--walkthrough-border, light-dark(#d5dbe5, #394352));
    }
    .source pre {
      width: auto;
    }
    .line {
      display: grid;
      grid-template-columns: 4ch 2ch minmax(0, 1fr);
      .text {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .annotation {
        grid-column: 3;
        margin: 0.3em 0;
      }
    }
  }
  @media (forced-colors: active) {
    .line.focused {
      border-inline-start: 3px solid Highlight;
    }
    .steps button[aria-selected='true'] {
      outline: 2px solid Highlight;
    }
  }
</style>
