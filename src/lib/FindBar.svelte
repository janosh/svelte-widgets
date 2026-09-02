<script lang="ts">
  import { Search } from './icons'
  // Find-in-page bar over root: Enter/Shift+Enter step; Escape closes. Style matches
  // with ::highlight(find-match), which cannot be component-scoped. For custom chrome,
  // use create_find_state.
  import { tick } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { tooltip } from './attachments/index'
  import { create_find_state, type FindOptions } from './find-in-page.svelte'
  import Icon from './Icon.svelte'
  import { FIND_BAR_LABELS, type FindBarLabels } from './labels'

  type Props = Omit<HTMLAttributes<HTMLDivElement>, `children`> &
    FindOptions & {
      // Search root; undefined until the container mounts.
      root?: Element
      on_close: () => void
      // Region name for placeholder and accessible labels.
      label?: string
      // `labels` itself comes from FindOptions, which reads the status strings out of it
    }

  let {
    root,
    on_close,
    label = `page`,
    labels,
    only_within,
    also_ignore,
    before_search,
    ...rest
  }: Props = $props()

  const find = create_find_state(() => ({
    only_within,
    also_ignore,
    before_search,
    labels,
  }))
  const msg = $derived({ ...FIND_BAR_LABELS, ...labels })
  const find_label = $derived(msg.find_in(label))
  type StepButton = { direction: -1 | 1; arrow: string; shortcut: string; label: string }
  const step_buttons: StepButton[] = $derived([
    { direction: -1, arrow: `↑`, shortcut: `Shift+Enter`, label: msg.prev_match },
    { direction: 1, arrow: `↓`, shortcut: `Enter`, label: msg.next_match },
  ])
  let input_element = $state<HTMLInputElement>()

  export const focus_input = (): void => {
    input_element?.focus()
    input_element?.select()
  }

  const update_query = async (next_query: string): Promise<void> => {
    find.query = next_query
    await tick() // let the refresh effect search before jumping
    find.jump_to(0)
  }

  const handle_keydown = (event: KeyboardEvent): void => {
    if (event.key === `Escape`) {
      event.preventDefault()
      // Keep outer Escape handlers from closing the searched surface.
      event.stopPropagation()
      on_close()
    } else if (event.key === `Enter`) {
      event.preventDefault()
      find.step(event.shiftKey ? -1 : 1)
    }
  }

  $effect(() => {
    // Re-runs when find.query changes.
    find.refresh(root)
    return find.release_highlight
  })
  $effect(() => {
    if (root) return find.observe(root)
  })
</script>

<div {...rest} aria-label={find_label} role="search" class={[`find-bar`, rest.class]}>
  <Icon icon={Search} aria-hidden="true" class="find-icon" />
  <input
    aria-label={find_label}
    bind:this={input_element}
    oninput={(event) => void update_query(event.currentTarget.value)}
    onkeydown={handle_keydown}
    placeholder={`${find_label}…`}
    type="search"
    value={find.query}
  />
  <span aria-live="polite" class="find-status">{find.status}</span>
  {#each step_buttons as { direction, arrow, shortcut, label: match_label } (direction)}
    <button
      aria-label={match_label}
      disabled={find.matches.length === 0}
      onclick={() => find.step(direction)}
      title={msg.match_shortcut(match_label, shortcut)}
      type="button"
      {@attach tooltip()}>{arrow}</button
    >
  {/each}
  <button
    aria-label={msg.close(label)}
    class="find-close"
    onclick={on_close}
    title={msg.close_shortcut}
    type="button"
    {@attach tooltip()}>×</button
  >
</div>

<style>
  /* Default float; inline style overrides these rules. */
  .find-bar {
    position: absolute;
    z-index: var(--find-bar-z-index, 50);
    inset-block-start: 0.45rem;
    inset-inline-end: 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    max-inline-size: calc(100% - 1.3rem);
    padding: 0.35rem 0.4rem 0.35rem 0.55rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 8px;
    background: var(--find-bar-bg, light-dark(white, #181b22));
    box-shadow: 0 5px 18px rgb(0 0 0 / 28%);
    backdrop-filter: blur(12px);
    animation: find-bar-enter 0.16s ease-out;
  }
  @keyframes find-bar-enter {
    from {
      opacity: 0;
      transform: translateY(-0.6rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .find-bar > :global(svg.find-icon) {
    --icon-size: 14px;
    flex: none;
    opacity: 0.65;
  }
  input {
    flex: 1 1 10rem;
    min-inline-size: 0;
    max-inline-size: 18rem;
    padding: 0.18rem 0.35rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.78rem;
    &:focus-visible {
      outline: 2px solid var(--active-color, #6ea8ff);
    }
  }
  /* Fixed width prevents growing match counts from shifting the caret. */
  .find-status {
    flex: none;
    min-inline-size: 4rem;
    color: light-dark(#5c6270, #aab0bf);
    font-size: 0.68rem;
    text-align: end;
    white-space: nowrap;
  }
  button {
    flex: none;
    padding: 0 0.3rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 0.75rem;
    line-height: 1.35rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .find-close {
    font-size: 1rem;
  }
  /* Span narrow viewports instead of clipping. */
  @media (max-width: 34rem) {
    .find-bar {
      inset-inline: 0.45rem;
      max-inline-size: none;
    }
    .find-status {
      min-inline-size: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .find-bar {
      animation: none;
    }
  }
</style>
