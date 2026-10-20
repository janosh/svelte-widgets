<script lang="ts">
  import Heading from '#lib/Heading.svelte'
  import { CodeBlock } from 'svelte-widgets'
  import { default_highlighter } from 'svelte-widgets/highlight'
  import { ref, repo } from 'virtual:source-symbols'

  let { data } = $props()

  let query = $state(``)
  const needle = $derived(query.trim().toLowerCase())
  const matches = (name: string) => name.toLowerCase().includes(needle)

  // distinct names: a few variables are read by two components
  const n_vars = $derived(
    new Set([
      ...data.shared.map(({ name }) => name),
      ...data.groups.flatMap(({ vars }) => vars.map(({ name }) => name)),
    ]).size,
  )
  const shared = $derived(data.shared.filter(({ name }) => matches(name)))
  // a query matching a component's name shows all of its variables
  const groups = $derived(
    data.groups
      .map((group) => ({
        ...group,
        vars: group.vars.filter(({ name }) => matches(group.name) || matches(name)),
      }))
      .filter(({ vars, name }) => vars.length > 0 || matches(name)),
  )
  const n_shown = $derived(
    shared.length + groups.reduce((sum, { vars }) => sum + vars.length, 0),
  )

  const source_href = (file: string) => `${repo}/blob/${ref}/src/lib/${file}`
</script>

{#snippet properties(props: string[])}
  {#each props as prop (prop)}<code>{prop}</code>
  {/each}
{/snippet}

<Heading level={2} id="theming">Theming</Heading>

<p>
  Components read CSS custom properties for colors, spacing and sizes. This page is
  generated at build time from the library source, so it lists {n_vars} variables across
  {data.groups.length} components and modules, and {data.shared.length} shared tokens. Set a
  variable on the component (most forward <code>style</code> and <code>class</code>
  to their root element) or on any ancestor:
</p>

<CodeBlock
  code={`:root {\n  --text-color: light-dark(#222, #eee);\n  --tooltip-bg: light-dark(#fff, #2a2a2e);\n}`}
  language="css"
  label="Theme override example"
  highlight={default_highlighter.highlight}
/>

<p>
  The <em>default</em> column shows the value a component uses when a variable is unset:
  its <code>var()</code> fallbacks, or a <small>declared</small> value the component sets
  on its own root element, which you override there rather than on an ancestor. A
  <em>note</em> flags variables the component sets at runtime (from props or measurements),
  which may override yours, and values derived from other variables, whose inputs you can override
  instead.
</p>

<label class="filter">
  Filter variables
  <input type="search" bind:value={query} placeholder="e.g. bg, radius, --nav-" />
</label>
<p class="match-count" aria-live="polite">
  {#if needle}{n_shown} matching variables{/if}
</p>

{#if shared.length}
  <Heading level={3} id="shared-tokens">Shared tokens</Heading>
  <p>
    Read by {data.shared_min_groups} or more components, so one declaration restyles all of
    them.
  </p>
  <div style="overflow-x: auto">
    <table aria-labelledby="shared-tokens">
      <thead>
        <tr><th>Variable</th><th>Feeds</th><th>Read by</th></tr>
      </thead>
      <tbody>
        {#each shared as token (token.name)}
          <tr>
            <td><code>{token.name}</code></td>
            <td>{@render properties(token.properties)}</td>
            <td>{token.groups.join(`, `)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#each groups as group (group.name)}
  {@const heading_id = `vars-${group.name.toLowerCase()}`}
  <section>
    <Heading level={3} id={heading_id}>{group.name}</Heading>
    <p class="files">
      {#each group.files as file (file)}
        <a href={source_href(file)}>{file}</a>
      {/each}
      {#if group.shared.length}
        <span>Also reads {group.shared.join(`, `)}.</span>
      {/if}
    </p>
    {#if group.vars.length}
      <div style="overflow-x: auto">
        <table aria-labelledby={heading_id}>
          <thead>
            <tr><th>Variable</th><th>Default</th><th>Feeds</th><th>Note</th></tr>
          </thead>
          <tbody>
            {#each group.vars as { name, declared, fallbacks, properties: props, note } (name)}
              <tr>
                <td><code>{name}</code></td>
                <td>
                  {#each declared as value (value)}
                    <code>{value}</code><small>declared</small>
                  {:else}
                    {#each fallbacks as fallback (fallback)}
                      <code>{fallback || `(empty)`}</code>
                    {:else}
                      <small>none</small>
                    {/each}
                  {/each}
                </td>
                <td>{@render properties(props)}</td>
                <td><small>{note}</small></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/each}

{#if shared.length + groups.length === 0}
  <p>No variable matches “{query}”.</p>
{/if}

<style>
  .filter {
    display: flex;
    align-items: center;
    gap: 0.6em;
    margin: 1.5em 0 0;
    input {
      flex: 1;
      font: inherit;
      padding: 0.3em 0.6em;
    }
  }
  .match-count {
    min-height: 1lh;
    font-size: 0.85em;
    color: var(--text-color-muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.35em 0.6em;
    border-bottom: 1px solid var(--border);
  }
  td code {
    white-space: nowrap;
    display: inline-block;
    margin: 0 0.3em 0.2em 0;
  }
  td small {
    color: var(--text-color-muted);
  }
  td:nth-child(4) {
    min-width: 14em;
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em 1em;
    font-size: 0.85em;
    span {
      color: var(--text-color-muted);
    }
  }
</style>
