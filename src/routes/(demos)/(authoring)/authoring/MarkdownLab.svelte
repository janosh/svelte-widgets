<script lang="ts">
  import { JsonTree } from '$lib'
  import type { Diagnostic } from '$lib/markdown'
  import { onMount } from 'svelte'
  import {
    bibliography,
    incremental_source,
    manifest_source,
    scientific_source,
  } from './examples'

  const {
    mode,
    image = ``,
  }: { mode: 'manifest' | 'incremental' | 'references'; image?: string } = $props()
  const title = $derived(
    mode === `manifest`
      ? `Content manifest`
      : mode === `incremental`
        ? `Incremental compilation`
        : `Scientific references`,
  )
  const initial_source = $derived(
    mode === `manifest`
      ? manifest_source
      : mode === `incremental`
        ? incremental_source
        : scientific_source(image),
  )
  let source = $derived(initial_source)
  let last_source = $state(``)
  let output = $state<{
    summary: string
    value: unknown
    html?: string
    diagnostics?: Diagnostic[]
  }>()
  let error = $state(``)
  let working = $state(false)
  let active = true
  let highlight_calls = 0
  let previous_ids: string[] | undefined
  let integration:
    | ReturnType<typeof import('$lib/markdown/vite').markdown_vite>
    | undefined
  const escape = (text: string) =>
    text.replaceAll(`&`, `&amp;`).replaceAll(`<`, `&lt;`).replaceAll(`>`, `&gt;`)
  const frame_source = $derived(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:16px/1.6 system-ui;margin:1.25rem;color:#223047;background:white}a{color:#3659bd}figure{text-align:center;margin:1.5rem 0}figure img{width:5rem;height:5rem}figcaption{margin-top:.5rem}.equation{display:flex;align-items:center;justify-content:space-between}h2{font-size:1.2rem}</style></head><body>${output?.html ?? ``}</body></html>`,
  )

  async function run() {
    if (working) return
    working = true
    error = ``
    const content = source
    try {
      const {
        create_markdown,
        assert_ok,
        render_markdown,
        validate_content,
        content_toc,
        content_search_record,
      } = await import('$lib/markdown')
      let next: NonNullable<typeof output>
      if (mode === `manifest`) {
        const engine = create_markdown({
          validate_frontmatter(metadata) {
            if (typeof metadata.title !== `string` || !metadata.title.trim())
              throw new Error(`Frontmatter title must be a nonempty string`)
            return { ...metadata, title: metadata.title }
          },
        })
        const { manifest } = assert_ok(
          await engine.parse(content, { filename: `/guide.md` }),
        )
        const target = assert_ok(
          await create_markdown().parse(`# Details`, { filename: `/next.md` }),
        )
        const diagnostics = validate_content([manifest, target.manifest], {
          assets: [`/plot.svg`],
        })
        next = {
          summary: `${manifest.headings.length} headings · ${manifest.links.length} links · ${diagnostics.length} issues`,
          diagnostics,
          value: {
            metadata: manifest.metadata,
            toc: content_toc(manifest),
            search: content_search_record(manifest),
            assets: manifest.assets,
            fences: manifest.fences,
          },
        }
      } else if (mode === `incremental`) {
        const { markdown_vite } = await import('$lib/markdown/vite')
        integration ??= markdown_vite(
          create_markdown({
            examples: {},
            highlight: (code) => {
              highlight_calls++
              return escape(code)
            },
          }),
        )
        const before = highlight_calls
        const markup = integration.preprocess.markup
        if (!markup) throw new Error(`Markdown preprocessor is unavailable`)
        const compiled = await markup({ content, filename: `/incremental.md` })
        if (!compiled) throw new Error(`Markdown compilation produced no result`)
        const ids = [
          ...new Set(
            compiled.code.match(/\/incremental\.md\.widgets-example-[a-f\d-]+\.svelte/gu),
          ),
        ]
        next = {
          summary: `${ids.length} examples · ${highlight_calls - before} new highlight calls`,
          value: {
            module_ids: ids,
            ids_unchanged:
              previous_ids === undefined
                ? null
                : JSON.stringify(ids) === JSON.stringify(previous_ids),
            new_highlight_calls: highlight_calls - before,
            total_highlight_calls: highlight_calls,
          },
        }
        previous_ids = ids
      } else {
        const options = {
          math: { output: `mathml` as const },
          references: { bibliography },
        }
        const compiled = assert_ok(
          await create_markdown(options).parse(content, {
            filename: `/references.md`,
            dialect: `markdown`,
          }),
        )
        next = {
          summary: `${compiled.manifest.references.length} references resolved`,
          value: compiled.manifest.references,
          html: assert_ok(await render_markdown(compiled)),
        }
      }
      if (active) {
        output = next
        last_source = content
      }
    } catch (cause) {
      if (active) {
        error = cause instanceof Error ? cause.message : String(cause)
        output = undefined
      }
    } finally {
      if (active) working = false
    }
  }
  onMount(() => {
    void run()
    return () => {
      active = false
    }
  })
</script>

<section class="lab" aria-label={`${title} lab`}>
  <form
    onsubmit={(event) => {
      event.preventDefault()
      void run()
    }}
  >
    <label
      >{title} source<textarea bind:value={source} spellcheck="false" rows="13"
      ></textarea></label
    >
    <div class="actions">
      <button type="submit" disabled={working}
        >{working ? `Working…` : `Run ${title.toLowerCase()}`}</button
      >
      <button
        type="button"
        disabled={working}
        onclick={() => {
          source = initial_source
          void run()
        }}>Reset source</button
      >
      <button
        type="button"
        disabled={working}
        onclick={() => {
          if (mode === `manifest`)
            source = source.replace(`./next.md#details`, `./missing.md#details`)
          else
            source +=
              mode === `incremental` ? `\n\nAnother paragraph.` : `\n\nSee [@missing].`
          void run()
        }}
        >{mode === `incremental`
          ? `Add prose`
          : mode === `manifest`
            ? `Break a link`
            : `Try an unresolved reference`}</button
      >
    </div>
  </form>
  {#if error}<pre class="error" role="alert">{error}</pre>{/if}
  {#if output}
    <p class="summary" role="status">
      {output.summary}{source !== last_source ? ` · Edited; run to update` : ``}
    </p>
    {#if output.html}<iframe
        title="Scientific reference preview"
        sandbox=""
        srcdoc={frame_source}
      ></iframe>{/if}
    {#if output.diagnostics?.length}
      <ul class="error" aria-label="Validation issues">
        {#each output.diagnostics as diagnostic}<li>
            Line {diagnostic.range.start.line}: {diagnostic.message}
          </li>{/each}
      </ul>
    {/if}
    <JsonTree
      value={output.value}
      default_fold_level={2}
      root_label={mode === `references` ? `Resolved references` : `Compiler output`}
    />
  {/if}
</section>

<style>
  .lab {
    min-width: 0;
  }
  label {
    display: grid;
    gap: 0.5rem;
    font-weight: 600;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 10rem;
    padding: 0.8rem;
    border: 0;
    border-bottom: 1px solid light-dark(#b7c1d1, #526078);
    border-radius: 0;
    background: light-dark(#f6f8fa, #151b24);
    color: inherit;
    font:
      0.85rem/1.6 ui-monospace,
      monospace;
    tab-size: 2;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  button {
    padding: 0.5rem 0.8rem;
    font: inherit;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    &[type='submit'] {
      background: light-dark(#edf1f6, #1e2633);
    }
    &:enabled:hover {
      background: light-dark(#e7ecf3, #26334c);
    }
    &:disabled {
      opacity: 0.5;
      cursor: wait;
    }
  }
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #6987ef;
    outline-offset: 2px;
  }
  .summary {
    font-variant-numeric: tabular-nums;
  }
  pre.error {
    padding: 0;
    background: transparent;
  }
  .error {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: light-dark(#a21919, #ffb4b4);
  }
  iframe {
    display: block;
    width: 100%;
    height: 28rem;
    border: 0;
    margin-bottom: 1rem;
    background: white;
  }
</style>
