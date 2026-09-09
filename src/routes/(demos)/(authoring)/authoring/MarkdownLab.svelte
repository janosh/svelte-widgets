<script lang="ts">
  import { JsonTree } from 'svelte-widgets'
  import SourceInput from '$site/SourceInput.svelte'
  import { default_highlighter } from 'svelte-widgets/highlight'
  import syntax_styles from '@wooorm/starry-night/style/light?raw'
  import type { Diagnostic } from 'svelte-widgets/markdown'
  import { onMount } from 'svelte'
  import { bibliography, manifest_source, scientific_source } from './examples'

  const { mode, image = `` }: { mode: 'manifest' | 'references'; image?: string } =
    $props()
  const title = $derived(
    mode === `manifest` ? `Content manifest` : `Scientific references`,
  )
  const initial_source = $derived(
    mode === `manifest` ? manifest_source : scientific_source(image),
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
  const frame_source = $derived(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${syntax_styles}body{font:16px/1.6 system-ui;margin:1.25rem;color:#223047;background:white}a{color:#3659bd}figure{text-align:center;margin:1.5rem 0}figure img{width:5rem;height:5rem}figcaption{margin-top:.5rem}.equation{display:flex;align-items:center;justify-content:space-between}h2{font-size:1.2rem}</style></head><body>${output?.html ?? ``}</body></html>`,
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
      } = await import('svelte-widgets/markdown')
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
      } else {
        const options = {
          math: { output: `mathml` as const },
          highlight: default_highlighter.highlight,
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
      >{title} source<SourceInput
        bind:value={source}
        language="markdown"
        label={`${title} source`}
      /></label
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
          else source += `\n\nSee [@missing].`
          void run()
        }}>{mode === `manifest` ? `Break a link` : `Try an unresolved reference`}</button
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
  button:focus-visible {
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
