## `create_wiggle`

Shakes an element once to draw attention to a change, such as a rejected input. `create_wiggle(options)` returns a controller: attach it with `{@attach shake.attach}` (to as many elements as you like) and call `shake.trigger()` to wiggle them all. The motion is a spring toward a peak `angle`, `scale`, `dx` or `dy` for `duration_ms`, then back to rest, tuned by `stiffness` and `damping` as in `svelte/motion`'s `Spring`. It plays through the Web Animations API, so the element's own `transform` returns afterwards, and a re-trigger mid-wiggle keeps its momentum. Options are read on every trigger, so a `$state` object retunes it live. Users who prefer reduced motion see no wiggle. Transforms skip inline elements: attach to an `inline-block` or block element.

Pick what triggers it and drag the sliders to tune the motion. The snippet below them shows the options you picked.

```svelte example id="attachments-wiggle"
<script lang="ts">
  import { CodeBlock } from 'svelte-widgets'
  import { create_wiggle, WIGGLE_DEFAULTS } from 'svelte-widgets/attachments'
  import { default_highlighter } from 'svelte-widgets/highlight'
  import { format_num } from 'svelte-widgets/format'

  // [option, min, max, step]
  const sliders = [
    [`angle`, 0, 45, 1],
    [`scale`, 1, 2, 0.05],
    [`dx`, 0, 50, 1],
    [`dy`, 0, 50, 1],
    [`duration_ms`, 50, 1000, 50],
    [`stiffness`, 0.01, 0.5, 0.01],
    [`damping`, 0.01, 1, 0.01],
  ] as const
  const options = $state({ ...WIGGLE_DEFAULTS, angle: 20 })
  const shake = create_wiggle(options)
  const handlers = {
    click: `onclick`,
    hover: `onpointerenter`,
    focus: `onfocus`,
  } as const
  let trigger_on = $state<keyof typeof handlers>(`click`)

  // the options that differ from the defaults, as create_wiggle() source
  const snippet = $derived.by(() => {
    const changed = sliders
      .filter(([key]) => options[key] !== WIGGLE_DEFAULTS[key])
      .map(([key]) => `${key}: ${options[key]}`)
    const args = changed.length ? `{ ${changed.join(`, `)} }` : ``
    return `const shake = create_wiggle(${args})\n\n<button {@attach shake.attach} ${handlers[trigger_on]}={shake.trigger}>`
  })
</script>

<p style="display: flex; gap: 1em; justify-content: center">
  Wiggle on
  {#each Object.keys(handlers) as mode (mode)}
    <label><input type="radio" bind:group={trigger_on} value={mode} /> {mode}</label>
  {/each}
</p>

<button
  type="button"
  {@attach shake.attach}
  {...{ [handlers[trigger_on]]: shake.trigger }}
  style="display: block; margin: 1em auto; font-size: 1.1em; padding: 0.5em 1em"
>
  🎯 Wiggle me
</button>

<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1em">
  {#each sliders as [option, min, max, step] (option)}
    <label>
      {option}: {format_num(options[option])}
      <input
        type="range"
        {min}
        {max}
        {step}
        bind:value={options[option]}
        style="width: 100%"
      />
    </label>
  {/each}
</div>

<CodeBlock
  code={snippet}
  language="svelte"
  highlight={default_highlighter.highlight}
  copy
  style="margin-top: 1em"
/>
```
