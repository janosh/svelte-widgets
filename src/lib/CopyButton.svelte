<script lang="ts">
  import type { Snippet } from 'svelte'
  import { mount, unmount } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  // eslint-disable-next-line import/no-self-import -- global mode mounts this component onto external code blocks
  import Self from './CopyButton.svelte'
  import ActionButton from './ActionButton.svelte'
  import { Alert, Check, Copy, type IconData } from './icons'
  import { merge_defaults, COPY_BUTTON_LABELS, type CopyButtonLabels } from './labels'
  import type { ActionButtonContent, ActionState } from './types'

  type State = Exclude<ActionState, `pending`>

  const DEFAULT_ICONS: Record<State, IconData> = {
    ready: Copy,
    success: Check,
    error: Alert,
  }

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
    labels,
    icons,
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
    labels?: Partial<CopyButtonLabels>
    icons?: Partial<Record<State, IconData>>
    children?: Snippet<[ActionButtonContent<State> & { icon: IconData }]>
  } = $props()

  const copy_button_selector = `[data-sms-copy]`
  const msg = $derived(merge_defaults(COPY_BUTTON_LABELS, labels))
  const icon_set = $derived(merge_defaults(DEFAULT_ICONS, icons))
  // CopyButton has no pending visual of its own: it keeps showing the current copy state
  const action_labels = $derived({ ...msg, pending: msg[copy_state] })
  const action_icons = $derived({ ...icon_set, pending: icon_set[copy_state] })

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
          icons,
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
    // One scan per frame: this re-reads every code block's `textContent`, while the observer
    // fires on every render flush, so an animating demo would rescan the document per flush.
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply_copy_buttons)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
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
  {@render copy_children?.({
    state: shown_state,
    icon: icon_set[shown_state],
    text: msg[shown_state],
    disabled,
  })}
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
    icons={action_icons}
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
