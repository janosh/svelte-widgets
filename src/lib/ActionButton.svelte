<script lang="ts" generics="Result = unknown">
  import { onDestroy, type Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import type { ActionButtonSnippetProps, ActionState } from './types'

  type ActionLabel = Pick<ActionButtonSnippetProps, `icon` | `text`>

  let {
    action,
    state = $bindable(`ready`),
    disabled = false,
    reset_ms = 2000,
    as = `button`,
    labels = {
      ready: { text: `Run` },
      pending: { text: `Working…` },
      success: { text: `Done` },
      error: { text: `Failed` },
    },
    on_state_change,
    on_success,
    on_error,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLButtonElement>, `children`> & {
    action: () => Result | Promise<Result>
    state?: ActionState
    disabled?: boolean
    reset_ms?: number
    as?: string
    labels?: Record<ActionState, ActionLabel>
    on_state_change?: (state: ActionState) => void | Promise<void>
    on_success?: (result: Result) => void | Promise<void>
    on_error?: (error: unknown) => void | Promise<void>
    children?: Snippet<[ActionButtonSnippetProps<Result>]>
  } = $props()

  let result = $derived<Result | undefined>(undefined)
  let error = $derived<unknown>(undefined)
  let reset_timeout: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  const action_disabled = $derived(disabled || state === `pending`)
  const current_label = $derived(labels[state])

  const clear_reset_timeout = (): void => {
    if (reset_timeout !== null) clearTimeout(reset_timeout)
    reset_timeout = null
  }

  const invoke_callback = async (
    callback_name: string,
    callback: () => void | Promise<void>,
  ): Promise<void> => {
    try {
      await callback()
    } catch (callback_error) {
      console.error(`ActionButton ${callback_name} callback failed`, callback_error)
    }
  }

  const set_state = (next_state: ActionState): void => {
    state = next_state
    void invoke_callback(`on_state_change`, () => on_state_change?.(next_state))
  }

  onDestroy(() => {
    destroyed = true
    clear_reset_timeout()
  })

  async function run_action(): Promise<void> {
    if (action_disabled) return
    clear_reset_timeout()
    result = undefined
    error = undefined
    set_state(`pending`)

    try {
      const action_result = await action()
      if (destroyed) return
      result = action_result
      set_state(`success`)
      void invoke_callback(`on_success`, () => on_success?.(action_result))
    } catch (action_error) {
      if (destroyed) return
      console.error(`ActionButton action failed`, action_error)
      error = action_error
      set_state(`error`)
      void invoke_callback(`on_error`, () => on_error?.(action_error))
    }
    if (destroyed || reset_ms <= 0) return
    reset_timeout = setTimeout(() => {
      reset_timeout = null
      if (!destroyed) set_state(`ready`)
    }, reset_ms)
  }

  const activate = (event: Event): boolean => {
    event.preventDefault()
    if (action_disabled) {
      event.stopPropagation()
      return false
    }
    void run_action()
    return true
  }
</script>

<svelte:element
  this={as}
  role="button"
  tabindex={action_disabled ? -1 : 0}
  aria-disabled={action_disabled || undefined}
  aria-busy={state === `pending` || undefined}
  {...as === `button` ? { disabled: action_disabled, type: `button` } : {}}
  data-sms-action=""
  data-state={state}
  {...rest}
  onclick={(event) => {
    if (activate(event)) rest.onclick?.(event)
  }}
  onkeydown={(event) => {
    if ((event.key === `Enter` || event.key === ` `) && !activate(event)) return
    rest.onkeydown?.(event)
  }}
>
  <span data-sms-action-content="" style="justify-content: center">
    {#if children}
      {@render children({
        state,
        icon: current_label.icon,
        text: current_label.text,
        disabled: action_disabled,
        result,
        error,
      })}
    {:else}
      {#if current_label.icon}<Icon icon={current_label.icon} />{/if}
      {#if current_label.text}<span>{current_label.text}</span>{/if}
    {/if}
  </span>
  <span data-sms-action-width="" aria-hidden="true">
    {#each Object.values(labels) as label}
      <span>
        {#if label.icon}<Icon icon={label.icon} />{/if}
        {#if label.text}<span>{label.text}</span>{/if}
      </span>
    {/each}
  </span>
</svelte:element>

<style>
  [data-sms-action] {
    display: inline-grid;
    width: fit-content;
  }
  [data-sms-action] > span {
    grid-area: 1 / 1;
  }
  [data-sms-action-content],
  [data-sms-action-width] > span {
    display: inline-flex;
    gap: 0.35em;
    align-items: center;
    line-height: 1;
    vertical-align: middle;
    > span {
      line-height: 1;
    }
    > :global(svg) {
      display: block;
    }
  }
  [data-sms-action-width] {
    display: grid;
    visibility: hidden;
    > span {
      grid-area: 1 / 1;
    }
  }
</style>
