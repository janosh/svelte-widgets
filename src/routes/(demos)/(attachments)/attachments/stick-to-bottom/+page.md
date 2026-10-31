## `create_stick_to_bottom`

Keeps a scroll container pinned to the end of growing content, such as a streaming chat or a log tail, until the reader scrolls away, and re-pins once they scroll back within `threshold` px. Only real input (wheel, touch, scroll keys, a scrollbar drag) detaches: layout shifts emit scroll events too, and those never unpin it. While the reader selects text the view holds still, and finishing with a selection detaches.

`create_stick_to_bottom(options)` returns a reactive controller: attach it with `{@attach stick.attach}`, read `stuck`, `distance` and `far_from_end` to show a "jump to latest" button, call `scroll_to_end()` to re-pin, and set `stuck = false` before a programmatic jump away (or before attaching, to start detached). Growth is detected through a subtree `MutationObserver` and the container's own size; `observe_children` also watches each child's size for growth DOM mutations miss (images loading, `<details>` opening). With `observe_mutations: false`, call `follow()` yourself after content changes, e.g. from an `$effect` on the data.

```svelte example id="attachments-stick-to-bottom"
<script lang="ts">
  import { create_stick_to_bottom } from 'svelte-widgets/attachments'

  const stick = create_stick_to_bottom({ behavior: `smooth`, far_threshold: 60 })
  let lines = $state(Array.from({ length: 8 }, (_, idx) => `line ${idx + 1}`))
  let streaming = $state(true)

  $effect(() => {
    if (!streaming) return
    const timer = setInterval(() => {
      lines = [...lines, `line ${lines.length + 1}: ${new Date().toLocaleTimeString()}`]
    }, 400)
    return () => clearInterval(timer)
  })
</script>

<div style="position: relative">
  <pre
    {@attach stick.attach}
    tabindex="0"
    aria-label="Streaming log"
    style="height: 12em; overflow: auto; margin: 0; padding: 0.5em; border: 1px solid gray; border-radius: 4pt">{lines.join(
      `\n`,
    )}</pre>
  {#if !stick.stuck && stick.far_from_end}
    <button
      style="position: absolute; bottom: 0.5em; right: 1.5em"
      onclick={() => stick.scroll_to_end()}>↓ Jump to latest</button
    >
  {/if}
</div>
<p>
  <button onclick={() => (streaming = !streaming)}
    >{streaming ? `Pause` : `Resume`} stream</button
  >
  {stick.stuck ? `following` : `detached, ${Math.round(stick.distance)} px from the end`}
</p>
```

Options: `threshold` (px from the end still counted as at it), `far_threshold`, `behavior` (`instant` or `smooth`), `observe_mutations`, `observe_children`, `on_scroll(event)` and `hold_position()`, which runs instead of following while detached, for containers that keep their own scroll anchor.
