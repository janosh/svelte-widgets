<script module lang="ts">
  let mounted_hosts = 0
</script>

<script lang="ts">
  // Mount once high in the app tree; it renders the head of the shared dialog queue.
  import { onMount } from 'svelte'
  import type { HTMLDialogAttributes, HTMLInputAttributes } from 'svelte/elements'
  import { backdrop_dismiss } from './attachments/index'
  import {
    answer_dialog,
    dialog_queue,
    dismiss_all_dialogs,
    dismiss_dialog,
    submit_prompt,
  } from './dialogs.svelte'
  import { chain_handlers } from './utils'

  // An app mounting this alongside its own dialogs needs its card class on the element
  let {
    input_props,
    ...rest
  }: Omit<HTMLDialogAttributes, `children`> & {
    // prompt <input> only; choice dialogs ignore this
    input_props?: Omit<HTMLInputAttributes, `aria-invalid` | `type` | `value`>
  } = $props()

  const request = $derived(dialog_queue[0])
  const unique_id = $props.id()
  const title_id = `confirm-dialog-${unique_id}-title`
  const error_id = `confirm-dialog-${unique_id}-error`
  let dialog = $state<HTMLDialogElement | null>(null)
  let focus_origin: HTMLElement | SVGElement | null = null
  let prompt_value = $derived(request?.kind === `prompt` ? request.initial_value : ``)
  // Writable derived on `request`: submitting an invalid value assigns the error, and
  // advancing the queue re-runs this and clears it, so no stale error survives a request.
  let validation_message = $derived.by(() => {
    void request
    return ``
  })
  const input_described_by = $derived(
    [input_props?.[`aria-describedby`], validation_message && error_id]
      .filter(Boolean)
      .join(` `) || undefined,
  )

  // submit_prompt no-ops unless a prompt is at the head of the queue, so the form needs
  // no guard of its own.
  const submit_current_prompt = (event: SubmitEvent) => {
    event.preventDefault()
    const prompt_result = submit_prompt(prompt_value)
    if (prompt_result.status === `invalid`) validation_message = prompt_result.message
  }

  // showModal() supplies top-layer containment and native Escape handling. The queue can
  // replace the focused controls without closing, so each request gets a known entry point.
  $effect(() => {
    if (!dialog) return
    if (!request) {
      if (dialog.open) dialog.close()
      focus_origin?.focus()
      focus_origin = null
      return
    }
    if (!dialog.open) {
      const active = document.activeElement
      if (active instanceof HTMLElement || active instanceof SVGElement)
        focus_origin = active
      dialog.showModal()
    }
    const selector = request.kind === `prompt` ? `input` : `.actions button`
    dialog.querySelector<HTMLElement>(selector)?.focus()
  })

  // Register only in the browser: SSR must not mutate this process-global queue.
  onMount(() => {
    mounted_hosts += 1
    return () => {
      mounted_hosts -= 1
      if (mounted_hosts === 0) {
        dismiss_all_dialogs()
        focus_origin?.focus()
      }
    }
  })
</script>

<dialog
  bind:this={dialog}
  {...rest}
  class={[`confirm-dialog`, rest.class]}
  aria-labelledby={title_id}
  {@attach backdrop_dismiss()}
  onclose={chain_handlers(() => {
    // Escape and backdrop clicks land here. Answering already shifted the queue, so the
    // close that follows sees no request and resolves nothing.
    if (request) dismiss_dialog()
  }, rest.onclose)}
>
  {#if request}
    <h2 id={title_id}>{request.title}</h2>
    {#if request.body.kind === `text`}
      <p class="message">{request.body.text}</p>
    {:else}
      {@render request.body.snippet()}
    {/if}
    <!-- Rebuilds the controls between questions. Keyed on choice id alone, Svelte reused
    the same DOM nodes when consecutive requests offer the same ids, so the second half
    of a double-click landed on the button that now answers the NEXT question. -->
    {#key request}
      {#if request.kind === `choice`}
        <div class="actions">
          {#each request.choices as choice (choice.id)}
            <button
              type="button"
              class={choice.tone}
              onclick={() => answer_dialog(choice.id)}
            >
              {choice.label}
            </button>
          {/each}
        </div>
      {:else}
        <form class="prompt" onsubmit={submit_current_prompt}>
          <label>
            <span>{request.input_label}</span>
            <input
              {...input_props}
              type="text"
              placeholder={request.placeholder || input_props?.placeholder}
              bind:value={prompt_value}
              oninput={chain_handlers(
                () => (validation_message = ``),
                input_props?.oninput,
              )}
              aria-invalid={validation_message ? `true` : undefined}
              aria-describedby={input_described_by}
            />
          </label>
          {#if validation_message}
            <p id={error_id} class="validation-error" role="alert">
              {validation_message}
            </p>
          {/if}
          <div class="actions">
            <button type="button" onclick={dismiss_dialog}>{request.cancel_label}</button>
            <button type="submit" class="accent">{request.confirm_label}</button>
          </div>
        </form>
      {/if}
    {/key}
  {/if}
</dialog>

<style>
  .confirm-dialog {
    /* zero margins are what center a modal dialog in the top layer */
    margin: auto;
    inline-size: var(--confirm-dialog-width, min(30rem, calc(100vw - 2rem)));
    padding: var(--confirm-dialog-padding, 1rem 1.1rem);
    border: var(--confirm-dialog-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--confirm-dialog-radius, 5pt);
    background: var(--confirm-dialog-bg, light-dark(#fff, #2a2a2e));
    color: var(--confirm-dialog-color, light-dark(#222, #eee));
    box-shadow: var(--confirm-dialog-shadow, 0 3px 12px rgba(0, 0, 0, 0.3));
    /* paths and directory lists are long and must not be clipped */
    overflow-wrap: anywhere;
    &::backdrop {
      background: var(--confirm-dialog-backdrop, rgba(0, 0, 0, 0.42));
      backdrop-filter: var(--confirm-dialog-backdrop-filter, blur(4px));
    }
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 1em;
  }
  .message {
    margin: 0;
    opacity: 0.8;
    font-size: 0.9em;
    line-height: 1.45;
  }
  .prompt {
    margin-block-start: 1rem;
    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.9em;
    }
    input {
      box-sizing: border-box;
      inline-size: 100%;
      padding: 0.45rem 0.55rem;
      border: 1px solid light-dark(lightgray, #555);
      border-radius: 3pt;
      background: inherit;
      color: inherit;
      font: inherit;
    }
    .validation-error {
      margin: 0.35rem 0 0;
      color: var(--confirm-dialog-error-color, crimson);
      font-size: 0.85em;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: flex-end;
    margin-block-start: 1rem;
    button {
      padding: var(--confirm-dialog-button-padding, 3pt 8pt);
      border: 1px solid transparent;
      border-radius: 3pt;
      background: var(--confirm-dialog-button-bg, rgba(125, 125, 125, 0.2));
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    button.accent {
      background: var(--confirm-dialog-accent-bg, cornflowerblue);
      color: var(--confirm-dialog-accent-color, white);
    }
    button.danger {
      background: var(--confirm-dialog-danger-bg, darkred);
      color: var(--confirm-dialog-danger-color, white);
    }
    button:hover {
      border-color: currentColor;
    }
  }
</style>
