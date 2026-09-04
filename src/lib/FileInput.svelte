<script lang="ts">
  import type { FileRejection } from './types'
  import type { HTMLAttributes } from 'svelte/elements'
  import { untrack, type Snippet } from 'svelte'
  import { file_drop } from './attachments/file-drop'
  import { file_matches_accept } from './file-drop'
  import TaskStatus from './TaskStatus.svelte'

  let {
    files = $bindable([]),
    accept = ``,
    multiple = false,
    max_size = Infinity,
    max_files = Infinity,
    disabled = false,
    label = `Choose files or drop them here`,
    onfiles,
    onreject,
    onremove,
    children,
    remove_label = `Remove`,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `onerror`> & {
    files?: File[]
    accept?: string
    multiple?: boolean
    max_size?: number
    max_files?: number
    disabled?: boolean
    label?: string
    remove_label?: string
    // Parsing/upload is caller-owned. Replacement, cancel and unmount abort this signal.
    onfiles?: (files: File[], signal: AbortSignal) => void | Promise<void>
    onreject?: (rejections: FileRejection[]) => void
    onremove?: (file: File) => void
    children?: Snippet<[File[]]>
  } = $props()
  let controller = $state.raw<AbortController>()
  let error = $state(``)
  let rejected = $state<FileRejection[]>([])
  const cancel = () => {
    const previous = controller
    controller = undefined
    previous?.abort()
  }
  $effect(() => () => cancel())
  $effect(() => {
    if (disabled) untrack(cancel)
  })
  $effect(() => {
    if (
      !(max_size >= 0) ||
      !(max_files >= 1) ||
      (Number.isFinite(max_files) && !Number.isInteger(max_files))
    ) {
      throw new Error(
        `FileInput requires max_size >= 0 and max_files >= 1, got ${max_size}, ${max_files}`,
      )
    }
  })
  async function receive(incoming: File[]): Promise<void> {
    if (disabled) return
    const accepted: File[] = []
    const rejections: FileRejection[] = []
    for (const file of incoming) {
      const reason = !file_matches_accept(file, accept)
        ? `type`
        : file.size > max_size
          ? `size`
          : accepted.length >= (multiple ? max_files : 1)
            ? `count`
            : undefined
      if (reason) rejections.push({ file, reason })
      else accepted.push(file)
    }
    rejected = rejections
    onreject?.(rejections)
    error = ``
    if (!accepted.length) return
    cancel()
    files = accepted
    const current = new AbortController()
    controller = current
    try {
      await onfiles?.(accepted, current.signal)
    } catch (cause) {
      if (!current.signal.aborted) error = String(cause)
    } finally {
      if (controller === current) controller = undefined
    }
  }
</script>

<div
  {...rest}
  class={[`file-input`, rest.class]}
  aria-disabled={disabled}
  {@attach file_drop({
    multiple: true,
    disabled,
    on_files: receive,
    on_error: (cause) => {
      error = String(cause)
    },
  })}
>
  <label
    >{label}<input
      type="file"
      {accept}
      {multiple}
      {disabled}
      onchange={(event) => {
        const incoming = Array.from(event.currentTarget.files ?? [])
        event.currentTarget.value = ``
        if (incoming.length) void receive(incoming)
      }}
    /></label
  >
  {#if children}{@render children(files)}
  {:else}
    <ul>
      {#each files as file, idx (idx)}
        <li>
          {file.name}
          <button
            type="button"
            {disabled}
            aria-label={`${remove_label} ${file.name}`}
            onclick={() => {
              cancel()
              files = files.filter((_file, file_idx) => file_idx !== idx)
              onremove?.(file)
            }}>{remove_label}</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <div role="status">
    {#each rejected as rejection, idx (idx)}
      <div>
        {rejection.file.name}: {rejection.reason === `type`
          ? `File type not accepted`
          : rejection.reason === `size`
            ? `File too large`
            : `Too many files`}
      </div>
    {/each}
  </div>
  {#if controller || error}<TaskStatus
      state={error ? `error` : `running`}
      label={error || `Processing files`}
      oncancel={cancel}
      onretry={() => receive(files)}
    />{/if}
</div>

<style>
  .file-input {
    border: 1px dashed currentColor;
    border-radius: 0.4em;
    padding: 1em;
    &[data-drag-active] {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
    label {
      display: grid;
      gap: 0.5em;
    }
    ul {
      padding-inline-start: 1.5em;
    }
    input,
    button {
      font: inherit;
    }
  }
</style>
