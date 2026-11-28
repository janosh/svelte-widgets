<script lang="ts">
  import Icon from '#lib/Icon.svelte'
  import { Keyboard, Play } from '#lib/icons.ts'
</script>

## <Icon icon={Play} class="heading-icon" /> SequenceControls

`create_sequence_player` from `svelte-widgets/sequence-player` owns playback of an ordered collection: frames of a trajectory, images of a scan, steps of an optimization. It reads index, count and FPS lazily off one object, like Svelte props: pass a `$state` object, or getters and setters (`get index() {...}`, `set index(value) {...}`) over state the host owns elsewhere, such as bindable props. It plays on `requestAnimationFrame` and loops back to the start (`on_end` and `on_loop` fire there). `SequenceControls` renders previous/play/next buttons, a 1-based step input with a slider, and an FPS input for that player.

```svelte example id="sequence-controls-basic"
<script lang="ts">
  import { SequenceControls } from 'svelte-widgets'
  import {
    create_sequence_player,
    is_sequence_key_target,
  } from 'svelte-widgets/sequence-player'

  const frames = Array.from({ length: 60 }, (_, idx) => (360 * idx) / 60)
  const sequence = $state({
    count: frames.length,
    index: 0,
    fps: 10,
    fps_range: [1, 30] as const,
    auto_play: false,
  })
  const playback = create_sequence_player(sequence)
  let demo = $state<HTMLElement>()
</script>

<!-- keys from inside the demo drive it; elsewhere they keep scrolling and navigating the page -->
<svelte:window
  onkeydown={(event) => {
    const inside = event.target instanceof Node && demo?.contains(event.target)
    if (inside && is_sequence_key_target(event) && playback.handle_keydown(event))
      event.preventDefault()
  }}
/>
<div
  bind:this={demo}
  style="display: flex; align-items: center; gap: 1em; flex-wrap: wrap"
>
  <SequenceControls {playback} item_name="frame" step_label_positions={[0, 30, 59]} />
</div>
<div
  style="width: 3em; height: 3em; margin: 1em; background: cornflowerblue; rotate: {frames[
    sequence.index
  ]}deg"
></div>
```

### <Icon icon={Keyboard} class="heading-icon" /> Keyboard

Forward keydowns to `playback.handle_keydown(event)`, which returns whether it handled the key: Space plays or pauses, ←/→ step one item (with Cmd/Ctrl, jump to the ends), Home/End jump to the ends, J/L step 10 items, PageUp/PageDown 25, `-`/`+` change the FPS by `fps_step` (default 0.1), and digits 0-9 seek to that tenth of the sequence. `is_sequence_key_target(event)` filters out keys typed into form fields, except the step slider. The control a key changed flashes via `playback.shortcut_flash`.

`visible(section)` returns whether each control group (`nav`, `step`, `fps`) renders. `on_index_input` handles slider drags yourself (e.g. to throttle loading), and a `slider_overlay` snippet draws behind the slider, such as a loading-progress bar. `disable_step_while_playing` (default `true`) disables the previous and next buttons during playback.
