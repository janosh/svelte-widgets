<script lang="ts">
  import type { Snippet } from 'svelte'
  import { mount, unmount } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  // eslint-disable-next-line import/no-self-import -- global mode mounts this component onto external code blocks
  import Self from './CopyButton.svelte'
  import ActionButton from './ActionButton.svelte'
  import { Alert, Check, Copy, type IconData } from './icons'
  import type { ActionButtonContent, ActionState } from './types'

  type State = Exclude<ActionState, `pending`>

  let {
    content = ``,
    state: copy_state = $bindable(`ready`),
    disabled = false,
    reset_ms = 2000,
    on_copy_success = (_content: string) => {},
    on_copy_error = (_error: unknown, _content: string) => {},
    global_selector = null,
    global = false,
    skip_selector = `button`,
    as = `button`,
    labels = {
      ready: { icon: Copy, text: `` },
      success: { icon: Check, text: `` },
      error: { icon: Alert, text: `` },
    },
    children: copy_children,
    ...rest
  }: Omit<HTMLAttributes<HTMLButtonElement>, `children`> & {
    content?: string
    state?: State
    disabled?: boolean
    reset_ms?: number
    on_copy_success?: (content: string) => void
    on_copy_error?: (error: unknown, content: string) => void
    global_selector?: string | null
    global?: boolean
    skip_selector?: string | null
    as?: string
    labels?: Record<State, { icon: IconData; text: string }>
    children?: Snippet<[ActionButtonContent<State> & { icon: IconData }]>
  } = $props()

  const copy_button_selector = `[data-sms-copy]`
  const action_labels = $derived({ ...labels, pending: labels[copy_state] })

  $effect(() => {
    if (!global && !global_selector) return

    let mounted_copy_buttons: {
      code: Element
      props: { content: string }
      component: Parameters<typeof unmount>[0]
    }[] = []
    const apply_copy_buttons = () => {
      // release buttons whose code block left the document; re-read the rest so the
      // button copies what the block shows now, not what it showed when mounted
      mounted_copy_buttons = mounted_copy_buttons.filter(({ code, props, component }) => {
        if (code.isConnected) props.content = code.textContent ?? ``
        else void unmount(component)
        return code.isConnected
      })
      const style = `position: absolute; top: 6pt; inset-inline-end: 6pt; ${
        rest.style ?? ``
      }`
      const skip_sel = skip_selector ?? as
      for (const code of document.querySelectorAll(global_selector ?? `pre > code`)) {
        const pre = code.parentElement
        // Any existing copy button wins, including one from a second global instance:
        // replacing it would have both instances swap buttons in an endless observer loop.
        if (!pre || pre.querySelector(copy_button_selector)) continue
        if (skip_sel && pre.querySelector(skip_sel)) continue

        const props = $state({
          content: code.textContent ?? ``,
          as,
          labels,
          disabled,
          reset_ms,
          on_copy_success,
          on_copy_error,
          ...rest,
          style,
        })
        const component = mount(Self, { target: pre, props })
        mounted_copy_buttons.push({ code, props, component })
      }
    }

    apply_copy_buttons()
    const observer = new MutationObserver(apply_copy_buttons)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      for (const { component } of mounted_copy_buttons) void unmount(component)
    }
  })

  const handle_action_state = (next_state: ActionState): void => {
    if (next_state !== `pending`) copy_state = next_state
  }
</script>

{#snippet copy_content({ state: action_state, disabled }: ActionButtonContent)}
  {@const shown_state = action_state === `pending` ? copy_state : action_state}
  {@const { text, icon } = labels[shown_state]}
  {@render copy_children?.({ state: shown_state, icon, text, disabled })}
{/snippet}

{#if !(global || global_selector)}
  <ActionButton
    {...rest}
    action={() => navigator.clipboard.writeText(content)}
    state={copy_state}
    disabled={disabled || !content}
    {reset_ms}
    {as}
    labels={action_labels}
    on_state_change={handle_action_state}
    on_success={() => on_copy_success(content)}
    on_error={(error) => on_copy_error(error, content)}
    data-sms-copy=""
    children={copy_children ? copy_content : undefined}
  />
{/if}

<style>
  :global([data-sms-copy]) {
    white-space: nowrap;
  }
</style>
