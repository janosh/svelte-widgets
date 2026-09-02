<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { Spring } from 'svelte/motion'

  let {
    wiggle = $bindable(false),
    angle = 0,
    scale = 1,
    dx = 0,
    dy = 0,
    duration_ms = 200,
    spring_options = $bindable({ stiffness: 0.05, damping: 0.1 }),
    children,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & {
    // bind to this state and set it to true from parent
    wiggle?: boolean
    // max value reached during the wiggle; usually set just one of these
    angle?: number // try 20
    scale?: number // try 1.2
    dx?: number // try 10
    dy?: number // try 10
    duration_ms?: number
    spring_options?: { stiffness: number; damping: number }
    children?: Snippet
  } = $props()

  const store = Spring.of(
    () => (wiggle ? { scale, angle, dx, dy } : { angle: 0, scale: 1, dx: 0, dy: 0 }),
    spring_options,
  )

  $effect(() => {
    store.stiffness = spring_options.stiffness
    store.damping = spring_options.damping
  })

  $effect.pre(() => {
    if (!wiggle) return
    const timer = setTimeout(() => (wiggle = false), duration_ms)
    // cancel on re-trigger or unmount, so an old timer can't cut a new wiggle short or
    // write to state after destroy
    return () => clearTimeout(timer)
  })
</script>

<span
  {...rest}
  style:display="inline-block"
  style:transform="rotate({store.current.angle}deg) scale({store.current.scale})
  translate({store.current.dx}px, {store.current.dy}px)"
>
  {@render children?.()}
</span>
