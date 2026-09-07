<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { is_modifier_chord } from './utils'
  import {
    CODE_PLAYGROUND_LABELS,
    merge_defaults,
    type CodePlaygroundLabels,
  } from './labels'
  import CodeEditor from './code-editor/CodeEditor.svelte'
  import { create_editor_model } from './code-editor/model'
  import type { EditorBackend, EditorModel } from './code-editor/types'
  import {
    compile_playground,
    decode_project,
    encode_project,
    is_playground_message,
    playground_editor_backend,
    preview_document,
    validate_project,
    type PlaygroundCompiler,
    type PlaygroundFiles,
  } from './code-playground/index'

  let {
    files,
    entry = `App.svelte`,
    runtime_source,
    compiler = compile_playground,
    editor_backend = playground_editor_backend,
    auto_run = true,
    restore_hash = false,
    title,
    labels,
    on_change,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, 'onchange'> & {
    files: PlaygroundFiles
    entry?: string
    // Import from virtual:svelte-widgets/playground using playground_vite().
    runtime_source: string
    compiler?: PlaygroundCompiler
    editor_backend?: EditorBackend
    auto_run?: boolean
    restore_hash?: boolean
    title?: string
    labels?: Partial<CodePlaygroundLabels>
    on_change?: (files: PlaygroundFiles) => void
  } = $props()

  const component_id = $props.id()
  const msg = $derived(merge_defaults(CODE_PLAYGROUND_LABELS, labels))
  const heading = $derived(title ?? msg.title)
  let models = $state<Record<string, EditorModel>>({})
  let active_file = $state(``)
  let frame = $state<HTMLIFrameElement>()
  let srcdoc = $state(``)
  let phase = $state<keyof CodePlaygroundLabels>(`ready`)
  let dirty = $state(false)
  let messages = $state<{ kind: string; text: string }[]>([])
  let shared_url = $state(``)
  let run_sequence = 0
  let channel = ``
  let mounted = false
  let current_entry = ``
  const active_model = $derived(models[active_file])

  const error_message = (error: unknown) => ({
    kind: `error`,
    text: error instanceof Error ? error.message : String(error),
  })
  const current_files = (): PlaygroundFiles =>
    Object.fromEntries(
      Object.entries(models).map(([filename, model]) => [filename, model.text()]),
    )
  const initialize = (sources: PlaygroundFiles, entry_file: string): void => {
    const project = validate_project({ files: sources, entry: entry_file })
    current_entry = project.entry
    models = Object.fromEntries(
      Object.entries(project.files).map(([uri, text]) => [
        uri,
        create_editor_model({ uri, text }),
      ]),
    )
    active_file = project.entry
    shared_url = ``
    dirty = false
    messages = []
    run_sequence++
    channel = ``
    srcdoc = ``
    phase = `ready`
  }
  const run = async (): Promise<void> => {
    const sequence = ++run_sequence
    const sources = current_files()
    phase = `compiling`
    messages = []
    channel = ``
    srcdoc = ``
    try {
      const build = await compiler({ files: sources, entry: current_entry })
      if (!mounted || sequence !== run_sequence) return
      channel = crypto.randomUUID()
      srcdoc = preview_document(build, runtime_source, channel)
      dirty = Object.entries(sources).some(
        ([filename, source]) => models[filename]?.text() !== source,
      )
      phase = `starting`
    } catch (error) {
      if (!mounted || sequence !== run_sequence) return
      messages = [error_message(error)]
      phase = `compile_error`
    }
  }
  const reset = (): void => {
    initialize(files, entry)
    on_change?.(current_files())
    if (auto_run) void run()
  }
  const share = (): void => {
    shared_url = ``
    try {
      const url = new URL(window.location.href)
      url.hash = new URLSearchParams({
        playground: encode_project({ files: current_files(), entry: current_entry }),
      }).toString()
      shared_url = url.href
    } catch (error) {
      messages = [...messages.slice(-99), error_message(error)]
    }
  }
  const changed = (): void => {
    dirty = true
    shared_url = ``
    on_change?.(current_files())
  }
  const select_file = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.shiftKey ||
      is_modifier_chord(event)
    )
      return
    const filenames = Object.keys(models)
    const position = filenames.indexOf(active_file)
    let target = position
    if (event.key === `ArrowRight`) target = (position + 1) % filenames.length
    else if (event.key === `ArrowLeft`)
      target = (position - 1 + filenames.length) % filenames.length
    else if (event.key === `Home`) target = 0
    else if (event.key === `End`) target = filenames.length - 1
    else return
    event.preventDefault()
    active_file = filenames[target]
    const tabs = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLButtonElement>(`[role="tab"]`)
    tabs?.[target]?.focus()
  }

  $effect(() => {
    const sources = files
    const entry_file = entry
    untrack(() => {
      initialize(sources, entry_file)
      if (mounted && auto_run) void run()
    })
  })
  onMount(() => {
    mounted = true
    if (restore_hash) {
      const encoded = new URLSearchParams(window.location.hash.slice(1)).get(`playground`)
      if (encoded) {
        try {
          const project = decode_project(encoded)
          initialize(project.files, project.entry)
        } catch (error) {
          messages = [error_message(error)]
          phase = `invalid_share`
        }
      }
    }
    const receive = (event: MessageEvent): void => {
      if (
        event.source !== frame?.contentWindow ||
        !is_playground_message(event.data, channel)
      )
        return
      if (event.data.kind === `ready`) {
        phase = messages.some((message) => message.kind === `error`)
          ? `preview_error`
          : `preview_ready`
      } else {
        messages = [
          ...messages.slice(-99),
          { kind: event.data.kind, text: event.data.text },
        ]
        if (event.data.kind === `error`) phase = `preview_error`
      }
    }
    window.addEventListener(`message`, receive)
    if (auto_run && phase !== `invalid_share`) void run()
    return () => {
      mounted = false
      run_sequence++
      window.removeEventListener(`message`, receive)
    }
  })
</script>

<section {...rest} class={[`code-playground`, rest.class]} aria-label={heading}>
  <header>
    <strong>{heading}</strong>
    <div class="actions">
      <button type="button" onclick={() => void run()} aria-label={msg.run}
        >▶ {msg.run}</button
      >
      <button type="button" onclick={reset}>{msg.reset}</button>
      <button type="button" onclick={share}>{msg.share}</button>
    </div>
  </header>
  <div class="workspace">
    <div class="source">
      <div class="tabs" role="tablist" aria-label={msg.files}>
        {#each Object.keys(models) as filename, file_idx (filename)}
          <button
            type="button"
            role="tab"
            id={`${component_id}-file-${file_idx}`}
            aria-selected={active_file === filename}
            aria-controls={`${component_id}-editor`}
            tabindex={active_file === filename ? 0 : -1}
            onclick={() => (active_file = filename)}
            onkeydown={select_file}>{filename}</button
          >
        {/each}
      </div>
      <div
        role="tabpanel"
        id={`${component_id}-editor`}
        aria-label={`${active_file} source`}
      >
        {#if active_model}
          <CodeEditor
            model={active_model}
            backend={editor_backend}
            aria_label={`Edit ${active_file}`}
            on_update={(update) => {
              if (update.transaction) changed()
            }}
            on_save={run}
          />
        {/if}
      </div>
    </div>
    <div class="preview">
      <div class="preview-bar">
        <span>{msg.preview}</span><span role="status"
          >{msg[phase]}{dirty ? ` · ${msg.dirty}` : ``}</span
        >
      </div>
      {#if srcdoc}
        <iframe
          bind:this={frame}
          title={`${heading} ${msg.preview}`}
          {srcdoc}
          sandbox="allow-scripts"
          referrerpolicy="no-referrer"
        ></iframe>
      {:else}
        <div class="empty">
          {phase === `compiling` ? msg.preparing : msg.empty}
        </div>
      {/if}
    </div>
  </div>
  {#if shared_url}
    <label class="share-url"
      >{msg.share_url}<input
        readonly
        value={shared_url}
        aria-label={msg.share_url}
        onclick={(event) => event.currentTarget.select()}
      /></label
    >
  {/if}
  {#if messages.length}
    <details class="console" open>
      <summary>{msg.console} <span>{messages.length}</span></summary>
      <div role="log" aria-label={msg.console} aria-live="polite">
        {#each messages as message}<pre
            class:error={message.kind === `error`}>{message.text}</pre>{/each}
      </div>
    </details>
  {/if}
</section>

<style>
  .code-playground {
    --playground-border: color-mix(in srgb, currentColor 18%, transparent);
    border-top: 1px solid var(--playground-border);
    background: var(--background-color, transparent);
    color: var(--text-color, CanvasText);
    header,
    .preview-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 0.8rem;
      border-bottom: 1px solid var(--playground-border);
    }
    header {
      flex-wrap: wrap;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding: 0.4rem 0.7rem;
      border: 0;
      border-radius: 4px;
      background: transparent;
    }
    button:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--accent-color, #4f73e8);
      outline-offset: -2px;
    }
    .actions {
      display: flex;
      gap: 0.4rem;
    }
    .actions button:first-child {
      background: var(--accent-color, #4264d0);
      color: white;
    }
    .workspace {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      min-height: 22rem;
    }
    .source,
    .preview {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .tabs {
      display: flex;
      gap: 0.2rem;
      padding: 0.4rem;
      overflow-x: auto;
      border-bottom: 1px solid var(--playground-border);
    }
    .tabs button {
      white-space: nowrap;
      border-radius: 0;
      border-bottom: 2px solid transparent;
      font-size: 0.85rem;
    }
    .tabs button[aria-selected='true'] {
      border-bottom-color: var(--accent-color, #4264d0);
      color: var(--accent-color, #4264d0);
    }
    [role='tabpanel'] {
      flex: 1;
      min-height: 18rem;
    }
    :global(.code-editor) {
      height: 100%;
      min-height: 18rem;
      border: none;
      border-radius: 0;
    }
    .preview-bar {
      min-height: 2.8rem;
      box-sizing: border-box;
      font-size: 0.8rem;
      flex-wrap: wrap;
    }
    .preview-bar [role='status'] {
      opacity: 0.7;
    }
    iframe {
      width: 100%;
      flex: 1;
      min-height: 18rem;
      border: 0;
      background: white;
    }
    .empty {
      padding: 3rem 1rem;
      opacity: 0.65;
      text-align: center;
    }
    .share-url {
      display: grid;
      gap: 0.3rem;
      padding: 0.7rem;
      border-top: 1px solid var(--playground-border);
      font-size: 0.85rem;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 0.5rem;
      border: 0;
      border-bottom: 1px solid var(--playground-border);
      border-radius: 0;
      background: transparent;
      color: inherit;
    }
    .console {
      border-top: 1px solid var(--playground-border);
    }
    summary {
      padding: 0.6rem 0.8rem;
      cursor: pointer;
      font-size: 0.85rem;
    }
    summary span {
      opacity: 0.6;
    }
    [role='log'] {
      max-height: 12rem;
      overflow: auto;
      padding: 0 0.8rem 0.6rem;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: 0.25rem 0;
      font-size: 0.8rem;
    }
    pre.error {
      color: light-dark(#b42318, #ff9a90);
    }
    @media (max-width: 700px) {
      .workspace {
        grid-template-columns: 1fr;
      }
    }
    @media (forced-colors: active) {
      .tabs button[aria-selected='true'] {
        outline: 2px solid Highlight;
      }
    }
  }
</style>
