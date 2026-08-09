## ActionButton

Use `ActionButton` for save, retry, refresh, download or any other action worth reporting on. It runs a sync or async `action`, walks itself through `ready → pending → success | error`, blocks duplicate activation while pending, hands the result or the thrown error to callbacks and snippets, and returns to `ready` after `reset_ms`. Set `reset_ms={0}` to keep the terminal state until the next activation.

The button reserves the width of its widest label up front, so swapping `Save` for `Saving…` never nudges the layout around it.

### States and labels

`labels` maps each of the four states to `{ icon?, text? }`. **`text` renders as text**, so markup in it shows up literally — pass an `icon` for a glyph, or take over rendering entirely with the `children` snippet.

`bind:state` exposes the current state, and `on_success` / `on_error` receive the resolved value or the thrown error. The demo below fails every second run so you can watch the error path and the `reset_ms` countdown back to `ready`.

```svelte example id="action-button-states"
<script lang="ts">
  import { ActionButton, type ActionState } from '$lib'
  import { Check, Close, Refresh } from '$lib/icons'

  let action_state = $state<ActionState>(`ready`)
  let attempts = $state(0)
  let last_outcome = $state(`nothing yet`)

  // every second run throws, so both the success and the error label are reachable
  const save = async (): Promise<number> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 600))
    attempts += 1
    if (attempts % 2 === 0) throw new Error(`the server said no`)
    return attempts
  }

  const labels = {
    ready: { text: `Save`, icon: Refresh },
    pending: { text: `Saving…` },
    success: { text: `Saved`, icon: Check },
    error: { text: `Retry`, icon: Close },
  } as const
</script>

<p style="display: flex; gap: 1em; align-items: center; flex-wrap: wrap">
  <ActionButton
    action={save}
    bind:state={action_state}
    {labels}
    reset_ms={1500}
    on_success={(result) => (last_outcome = `saved #${result}`)}
    on_error={(error) => (last_outcome = `failed: ${(error as Error).message}`)}
  />
  <span>state: <code>{action_state}</code></span>
  <span>last outcome: <code>{last_outcome}</code></span>
</p>
```

### Custom rendering

The `children` snippet receives `{ state, icon, text, disabled, result, error }` and replaces the default icon-plus-text body, which is the way to render markup, a spinner or the result itself inside the button. `as` swaps the underlying element when a `<button>` will not do.

```svelte example id="action-button-children"
<script lang="ts">
  import { ActionButton, CircleSpinner } from '$lib'

  const roll = async (): Promise<number> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 700))
    return Math.floor(Math.random() * 6) + 1
  }
</script>

<ActionButton action={roll} reset_ms={2500}>
  {#snippet children({ state, result })}
    {#if state === `pending`}
      <CircleSpinner size="1em" /> rolling…
    {:else if state === `success`}
      <strong>you rolled {result}</strong>
    {:else}
      🎲 roll a die
    {/if}
  {/snippet}
</ActionButton>
```

## CopyButton

`CopyButton` composes `ActionButton` into a copy-to-clipboard control with bindable state, custom labels, success/error callbacks and configurable reset timing. This site mounts one in `global` mode on every code block.

```svelte example id="copy-button"
<script lang="ts">
  import { CopyButton } from '$lib'

  let content = $state(`npm test`)
  let disabled = $state(false)
  let reset_ms = $state(2000)
  let state = $state<`ready` | `success` | `error`>(`ready`)
</script>

<p style="display: flex; gap: 8pt; align-items: center; flex-wrap: wrap">
  <input bind:value={content} style="min-width: 16em" />
  <CopyButton {content} bind:state {disabled} {reset_ms} />
  <label>
    reset_ms:
    <input type="number" min="0" step="500" bind:value={reset_ms} style="width: 5em" />
  </label>
  <label><input type="checkbox" bind:checked={disabled} /> disabled</label>
</p>
<p>State: {state}</p>
```
