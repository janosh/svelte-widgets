<script lang="ts">
  // let emojis rain across the screen to playfully show some event was triggered
  import type { HTMLAttributes } from 'svelte/elements'
  import { fade } from 'svelte/transition'

  let {
    speed = 0.5,
    n_items = 50,
    freeze = false,
    ...rest
  }: {
    speed?: number
    n_items?: number
    freeze?: boolean
  } & HTMLAttributes<HTMLDivElement> = $props()

  const emojis = [`🥳`, `🎉`, `✨`]

  let confetti: { emoji: string; x: number; y: number; r: number }[] = $derived(
    Array.from({ length: n_items }, (_, idx) => ({
      emoji: emojis[idx % emojis.length],
      x: Math.random() * 100,
      y: -20 - Math.random() * 100,
      r: 0.1 + Math.random(),
    })).toSorted((conf_a, conf_b) => conf_a.r - conf_b.r),
  )

  $effect(() => {
    if (freeze || typeof requestAnimationFrame === `undefined`) return
    // speed and confetti are read per frame, outside the effect's tracking
    let frame_id = 0
    const loop = () => {
      frame_id = requestAnimationFrame(loop)
      confetti = confetti.map(({ emoji, x, r, y }) => {
        const new_y = y + speed * r
        return { emoji, x, r, y: new_y > 120 ? -20 : new_y }
      })
    }
    frame_id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame_id)
  })
</script>

<div transition:fade {...rest}>
  <!-- key by index, not content: x/y change every frame, so a content-based key
  would destroy and recreate every span on each animation frame -->
  {#each confetti as con, idx (idx)}
    <span style:left="{con.x}%" style:top="{con.y}%" style:transform="scale({con.r})">
      {con.emoji}
    </span>
  {/each}
</div>

<style>
  span {
    z-index: 10;
    position: fixed;
    font-size: 5vw;
    user-select: none;
  }
</style>
