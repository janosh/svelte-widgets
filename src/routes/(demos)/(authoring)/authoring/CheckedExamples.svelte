<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  import type { PageData } from './$types'
  import SourceInput from '$site/SourceInput.svelte'
  import { CodeBlock } from 'svelte-widgets'
  import { default_highlighter } from 'svelte-widgets/highlight'
  import { checked_examples } from './examples'
  import { onMount } from 'svelte'

  const { checks }: { checks: PageData['checks'] } = $props()
  let ready = $state(false)
  onMount(() => {
    ready = true
  })
  let selected = $state(0)
  const current = $derived(checks[selected])
  let source = $state(checked_examples[2].code)
  let feedback = $state(``)
  let failed = $state(false)
  let working = $state(false)

  async function check_syntax() {
    if (working) return
    working = true
    const content = source
    try {
      const { compile } = await import('svelte/compiler')
      const result = compile(content, { filename: `example.svelte`, generate: false })
      failed = false
      feedback = result.warnings.length
        ? result.warnings.map(({ message }) => message).join(`\n`)
        : `Svelte syntax passes. Full type checks run through the Node checker.`
    } catch (error) {
      failed = true
      feedback = error instanceof Error ? error.message : String(error)
    } finally {
      working = false
    }
  }
</script>

<section aria-label="Checked examples lab">
  <label
    >Check scenario
    <select bind:value={selected} disabled={!ready}>
      {#each checks as example, idx}<option value={idx}>{example.title}</option>{/each}
    </select>
  </label>
  <p>
    These full type and assertion checks run through <code>check_document()</code> when the
    static site builds. Choose a case to inspect its actual result.
  </p>
  <pre aria-label="Scenario source"><code>{@html current.highlighted_source}</code></pre>
  <p class:failed={!current.result.ok} role="status">
    {current.result.ok ? `Passed` : `Failed`} · {current.result.value.checked} checked · {current
      .result.value.asserted} assertions passed
  </p>
  {#each current.result.diagnostics as diagnostic}
    <pre class="diagnostic">Line {diagnostic.range.start.line}, column {diagnostic.range
        .start.column} [{diagnostic.code}]
{diagnostic.message}</pre>
  {/each}
  <details>
    <summary>Run these checks in your project</summary>
    <CodeBlock
      language="js"
      label="Checker setup"
      highlight={default_highlighter.highlight}
      wrap
      code={`import { readFile } from 'node:fs/promises'
import { assert_ok, create_markdown } from 'svelte-widgets/markdown'
import { check_document } from 'svelte-widgets/markdown/check'

const engine = create_markdown()
const document = assert_ok(await engine.parse(await readFile('guide.md', 'utf8'), { filename: 'guide.md' }))
assert_ok(await check_document(document))`}
    />
  </details>
  <Heading level={3} id="try-the-svelte-syntax-checker"
    >Try the Svelte syntax checker</Heading
  >
  <p>
    Edit the component below and check it in your browser. This uses the real Svelte
    compiler; it checks syntax and compiler warnings, not TypeScript semantics.
  </p>
  <form
    onsubmit={(event) => {
      event.preventDefault()
      void check_syntax()
    }}
  >
    <label
      >Svelte source<SourceInput
        bind:value={source}
        language="svelte"
        label="Svelte source"
        rows={6}
      /></label
    >
    <button type="submit" disabled={!ready || working}
      >{working ? `Checking…` : `Check Svelte syntax`}</button
    >
  </form>
  {#if feedback}<pre class:failed role={failed ? `alert` : `status`}>{feedback}</pre>{/if}
</section>

<style>
  section > :global(h3) {
    margin-top: 2rem;
  }
  label {
    display: grid;
    gap: 0.5rem;
    font-weight: 600;
  }
  select,
  button {
    font: inherit;
    color: inherit;
    border: 0;
    border-radius: 0;
    background: light-dark(#f6f8fa, #151b24);
    padding: 0.6rem;
  }
  select {
    border-bottom: 1px solid light-dark(#b7c1d1, #526078);
  }
  select {
    max-width: 28rem;
  }
  select:focus-visible,
  button:focus-visible {
    outline: 2px solid #6987ef;
    outline-offset: 2px;
  }
  button {
    margin-top: 0.75rem;
    cursor: pointer;
    border-radius: 4px;
    &:enabled:hover {
      background: light-dark(#e7ecf3, #26334c);
    }
    &:disabled {
      opacity: 0.5;
      cursor: wait;
    }
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border-radius: 0;
  }
  pre.diagnostic,
  pre[role] {
    padding: 0;
    background: transparent;
  }
  .failed,
  .diagnostic {
    color: light-dark(#a21919, #ffb4b4);
  }
</style>
