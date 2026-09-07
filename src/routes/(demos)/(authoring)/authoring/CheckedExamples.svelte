<script lang="ts">
  import type { PageData } from './$types'
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
    These full type and assertion checks run through <code>checker.check()</code> when the static
    site builds. Choose a case to inspect its actual result.
  </p>
  <pre><code>{current.source}</code></pre>
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
    <pre><code
        >{`import { readFile } from 'node:fs/promises'
import { assert_ok, create_markdown } from 'svelte-widgets/markdown'
import { create_checker } from 'svelte-widgets/markdown/check'

const engine = create_markdown()
const document = assert_ok(await engine.parse(await readFile('guide.md', 'utf8'), { filename: 'guide.md' }))
const checker = create_checker()
try {
  assert_ok(await checker.check(document))
} finally {
  checker.dispose()
}`}</code
      ></pre>
  </details>
  <h3>Try the Svelte syntax checker</h3>
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
      >Svelte source<textarea bind:value={source} rows="6" spellcheck="false"
      ></textarea></label
    >
    <button type="submit" disabled={!ready || working}
      >{working ? `Checking…` : `Check Svelte syntax`}</button
    >
  </form>
  {#if feedback}<pre class:failed role={failed ? `alert` : `status`}>{feedback}</pre>{/if}
</section>

<style>
  h3 {
    margin-top: 2rem;
  }
  label {
    display: grid;
    gap: 0.5rem;
    font-weight: 600;
  }
  select,
  button,
  textarea {
    font: inherit;
    color: inherit;
    border: 0;
    border-radius: 0;
    background: light-dark(#f6f8fa, #151b24);
    padding: 0.6rem;
  }
  select,
  textarea {
    border-bottom: 1px solid light-dark(#b7c1d1, #526078);
  }
  select {
    max-width: 28rem;
  }
  select:focus-visible,
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #6987ef;
    outline-offset: 2px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font:
      0.85rem/1.6 ui-monospace,
      monospace;
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
