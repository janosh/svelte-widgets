<script lang="ts">
  import type { Snippet } from 'svelte'
  import { tooltip } from './attachments/tooltip'
  import { format_num } from './format'
  import type { create_sequence_player } from './sequence-player.svelte.ts'
  import { format_shortcut } from './shortcuts'

  type Section = `nav` | `step` | `fps`
  let {
    visible = () => true,
    playback,
    step_label_positions = [],
    item_name = `step`,
    play_title,
    aria_label,
    aria_valuetext,
    disable_step_while_playing = true,
    on_index_input = playback.go_to,
    slider_overlay,
  }: {
    // which control groups render: previous/play/next, the step input and slider, the FPS input
    visible?: (section: Section) => boolean
    playback: ReturnType<typeof create_sequence_player>
    step_label_positions?: number[]
    item_name?: string
    play_title?: string
    aria_label?: string
    aria_valuetext?: string
    disable_step_while_playing?: boolean
    on_index_input?: (index: number) => void
    slider_overlay?: Snippet
  } = $props()

  let resume_after_slider_scrub = false
  const begin_slider_scrub = (): void => {
    resume_after_slider_scrub = playback.is_playing
    playback.pause()
  }
  const finish_slider_scrub = (event: { currentTarget: HTMLInputElement }): void => {
    playback.seek(event.currentTarget.valueAsNumber)
    if (resume_after_slider_scrub) playback.play()
    resume_after_slider_scrub = false
  }
  const step_locked = $derived(playback.is_playing && disable_step_while_playing)
  const play_label = $derived(playback.is_playing ? `Pause` : `Play`)
  // the keys create_sequence_player's handle_keydown binds, as aria-keyshortcuts and title hint
  const shortcut_attrs = (key: string, label: string) => ({
    'aria-keyshortcuts': key,
    title: `${label} (${format_shortcut(key).join(`+`)})`,
  })
  // 1-based step numbers for display, 0-based indices for the player
  const display_idx = (idx: number) => idx + 1
  const { index, count } = $derived(playback)
</script>

{#if visible(`nav`)}
  <div class="nav-section">
    <button
      type="button"
      onclick={playback.previous}
      style={playback.shortcut_flash.style(`previous`)}
      disabled={index === 0 || step_locked}
      {...shortcut_attrs(`ArrowLeft`, `Previous ${item_name}`)}
      aria-label={`Previous ${item_name}`}
    >
      ⏮
    </button>
    <button
      type="button"
      onclick={playback.toggle}
      style={playback.shortcut_flash.style(`play`)}
      disabled={count <= 1}
      {...shortcut_attrs(`Space`, play_title ?? play_label)}
      aria-label={play_label}
      class={['play-button', { playing: playback.is_playing }]}
    >
      {playback.is_playing ? `⏸` : `▶`}
    </button>
    <button
      type="button"
      onclick={playback.next}
      style={playback.shortcut_flash.style(`next`)}
      disabled={index === count - 1 || step_locked}
      {...shortcut_attrs(`ArrowRight`, `Next ${item_name}`)}
      aria-label={`Next ${item_name}`}
    >
      ⏭
    </button>
  </div>
{/if}

{#if visible(`step`)}
  {@const formatted_count = format_num(count, `.3~s`)}
  {@const max_index = Math.max(count - 1, 0)}
  <div class="step-section">
    <input
      type="number"
      min="1"
      max={display_idx(max_index)}
      value={display_idx(index)}
      oninput={(event) => playback.go_to(event.currentTarget.valueAsNumber - 1)}
      onchange={({ currentTarget }) =>
        queueMicrotask(() => (currentTarget.value = String(display_idx(index))))}
      class="step-input"
      style={playback.shortcut_flash.style(`step`)}
      title={`Enter ${item_name} number to jump to`}
      aria-label={`${item_name} input`}
      {@attach tooltip()}
    />
    <span aria-label={`${formatted_count} total ${item_name}s`}>/ {formatted_count}</span>
    <div class="slider-container">
      {@render slider_overlay?.()}
      <input
        type="range"
        min="0"
        max={max_index}
        value={index}
        onpointerdown={begin_slider_scrub}
        onpointerup={finish_slider_scrub}
        onpointercancel={finish_slider_scrub}
        oninput={(event) => {
          playback.pause()
          on_index_input(event.currentTarget.valueAsNumber)
        }}
        onchange={finish_slider_scrub}
        class="step-slider"
        title={`Drag to navigate ${item_name}s`}
        aria-label={aria_label ?? item_name}
        aria-valuetext={aria_valuetext ?? `${display_idx(index)} of ${count}`}
      />
      {#if step_label_positions.length}
        <div class="step-labels">
          {#each step_label_positions as step_idx (step_idx)}
            {@const adjusted_position =
              count > 1 ? 1.5 + (step_idx / (count - 1)) * 98 : 1.5}
            <div class="step-tick" style:left="{adjusted_position}%"></div>
            <div class="step-label" style:left="{adjusted_position}%">
              {format_num(display_idx(step_idx), `.3~s`)}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if count > 1 && visible(`fps`)}
  <label class="fps-section">
    <span title="Frame rate: {format_num(playback.fps, `.2~s`)} fps">FPS</span>
    <input
      type="number"
      min={playback.fps_limits[0]}
      max={playback.fps_limits[1]}
      step={playback.fps_step}
      value={playback.fps}
      style={playback.shortcut_flash.style(`fps`)}
      oninput={(event) => {
        const value = event.currentTarget.valueAsNumber
        if (Number.isFinite(value)) playback.fps = value
      }}
      onchange={({ currentTarget }) => (currentTarget.value = String(playback.fps))}
    />
  </label>
{/if}

<style>
  button {
    background: var(--btn-bg);
    font-size: inherit;
    line-height: 1;
    &:hover:not(:disabled) {
      background: var(--btn-bg-hover, var(--border-color));
    }
    &:disabled {
      color: var(--text-color-muted);
      cursor: not-allowed;
    }
  }
  .nav-section {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 3pt;
  }
  .step-section {
    display: flex;
    flex: 1;
    align-items: center;
    gap: clamp(0.25rem, 1.5cqw, 0.5rem);
    min-width: 0;
    > span {
      opacity: 0.75;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }
  .step-input {
    min-width: 3.5em;
    margin: 0 -5px 0 0;
    border: 1px solid rgba(99, 179, 237, 0.3);
    text-align: center;
  }
  input[type='number'] {
    padding: 1px 3px;
    font: inherit;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      margin: 0;
      -webkit-appearance: none;
    }
  }
  .slider-container {
    position: relative;
    flex: 1 1 var(--sequence-slider-min-width, 100px);
    min-width: 0;
    &:has(.step-labels) {
      inset-block-start: -4px;
    }
  }
  .step-slider {
    position: relative;
    z-index: 3; /* Keep the thumb above analysis progress overlays. */
    /* border-box and no UA margin: page styles that pad inputs must not push the track
       past its container (it overflowed narrow panes by its padding + 2px margin) */
    box-sizing: border-box;
    width: 100%;
    margin: 0;
  }
  .step-labels {
    position: absolute;
    top: 50%;
    inset-inline: 0;
    /* Children are absolutely positioned, so without an explicit height this box is 0px tall
       and overflow: hidden clips every tick and label out of existence */
    height: calc(
      var(--sequence-step-tick-offset, 3px) + var(--sequence-step-tick-height, 3px) +
        2px + 1em
    );
    overflow: hidden;
  }
  .step-tick {
    position: absolute;
    top: var(--sequence-step-tick-offset, 3px);
    width: var(--sequence-step-tick-width, 1px);
    height: var(--sequence-step-tick-height, 3px);
    transform: translateX(-50%);
    background: var(--text-color-muted);
  }
  .step-label {
    position: absolute;
    top: calc(
      var(--sequence-step-tick-offset, 3px) + var(--sequence-step-tick-height, 3px) + 2px
    );
    transform: translateX(-50%);
    color: var(--text-color-muted);
    font-size: clamp(0.5em, 1.2cqw, 0.65em);
    line-height: 1;
    text-align: center;
    white-space: nowrap;
  }
  .fps-section {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 5pt;
    margin-inline: 6pt;
    white-space: nowrap;
    input[type='number'] {
      min-width: 2ch;
      max-width: 4ch;
      border: var(--tooltip-border);
      field-sizing: content;
      text-align: center;
    }
  }
  .play-button {
    min-width: clamp(32px, 4cqw, 36px);
    &:hover:not(:disabled) {
      background: var(--btn-bg-hover, rgba(0, 0, 0, 0.2));
    }
    &.playing {
      background: var(--btn-bg, rgba(0, 0, 0, 0.1));
    }
    &.playing:hover:not(:disabled) {
      background: var(--btn-bg-hover, rgba(0, 0, 0, 0.1));
    }
  }
</style>
