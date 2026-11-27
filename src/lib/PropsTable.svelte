<script lang="ts" module>
  import type { ComponentDoc, ComponentDocLoaders, PropDoc } from './prop-docs/types'

  type Loader = ComponentDocLoaders[string]

  // One fetch per loader for the page's lifetime, shared by the prefetch and the table
  const loads = new Map<Loader, Promise<ComponentDoc>>()
  const load_doc = (loader: Loader | undefined, name: string): Promise<ComponentDoc> => {
    if (!loader) return Promise.reject(new Error(`No props extracted for ${name}`))
    let load = loads.get(loader)
    if (!load) {
      load = loader().then((module) => module.default)
      // a failure (e.g. an extraction error mid-edit on the dev server) is not cached: the
      // next open retries
      load.catch(() => loads.delete(loader))
      loads.set(loader, load)
    }
    return load
  }

  const sort_by_name = (props: readonly PropDoc[]): PropDoc[] =>
    props.toSorted((left, right) => left.name.localeCompare(right.name, `en`))

  // Types past this many characters show their first two lines until clicked
  const LONG_TYPE = 80
</script>

<script lang="ts">
  // Collapsible prop reference for one component, from the docs prop_docs_plugin extracts out
  // of its `$props()` declaration (`svelte-widgets/prop-docs/vite-plugin`). Fetched once the
  // browser idles after mounting, so opening the table finds its props ready instead of
  // waiting on the fetch (and on a dev server, the extraction).
  import type { HTMLAttributes, HTMLDetailsAttributes } from 'svelte/elements'

  let {
    name,
    loaders,
    open = $bindable(false),
    scroll_props,
    ...rest
  }: {
    name: string // component whose props to list, a key of `loaders`
    loaders: ComponentDocLoaders // `virtual:prop-docs`'s default export
    open?: boolean
    // attributes of the element wrapping the table, which scrolls it on narrow screens
    scroll_props?: HTMLAttributes<HTMLDivElement>
  } & HTMLDetailsAttributes = $props()

  let expanded: Record<string, boolean> = $state({})

  const loader = $derived(loaders[name])

  $effect(() => {
    // read here, so a new component prefetches too; a failed prefetch surfaces when the
    // table is opened (the {:catch} below), not here
    const [pending, pending_name] = [loader, name]
    const run = () => load_doc(pending, pending_name).catch(() => {})
    if (`requestIdleCallback` in globalThis) {
      const id = requestIdleCallback(run)
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(run, 500) // Safari has no requestIdleCallback
    return () => clearTimeout(id)
  })
</script>

<details {...rest} bind:open class={[`props-table`, rest.class]}>
  <!-- the name is a span, not <code>: sites that link every <code> naming a component to its
  source would put a link in the summary, taking the click that should open the table -->
  <summary>Props of <span class="component-name">{name}</span></summary>
  {#if open}
    {#await load_doc(loader, name)}
      <p>Loading props...</p>
    {:then { props, rest_attributes }}
      <div {...scroll_props} class={[`table-scroll`, scroll_props?.class]}>
        <table>
          <thead>
            <tr>
              <th aria-label="Number">#</th>
              <th>Prop</th>
              <th>Type</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {#each sort_by_name(props) as { name: prop, type, default: fallback, default_value, description, bindable, required }, idx (prop)}
              {@const key = `${name}.${prop}`}
              <tr>
                <td>{idx + 1}</td>
                <td>
                  <code>{prop}</code>
                  {#if required}<small>required</small>{/if}
                  {#if bindable}<small>bindable</small>{/if}
                </td>
                <td>
                  {#if type && type.length > LONG_TYPE}
                    <button
                      type="button"
                      class="long-type"
                      class:expanded={expanded[key]}
                      aria-expanded={Boolean(expanded[key])}
                      title={expanded[key] ? `Collapse type` : `Show full type`}
                      onclick={() => (expanded[key] = !expanded[key])}
                    >
                      <code>{type}</code>
                    </button>
                  {:else if type}<code>{type}</code>{/if}
                </td>
                <td>
                  <!-- a constant or setting shows its value, the name beneath -->
                  {#if default_value}
                    <code>{default_value}</code><small>{fallback}</small>
                  {:else if fallback}<code>{fallback}</code>{/if}
                </td>
                <!-- `code` spans in the source comment render as code (odd parts of the split) -->
                <td
                  >{#each description?.split(/`([^`]+)`/) ?? [] as part, idx (idx)}{#if idx % 2}<code
                        >{part}</code
                      >{:else}{part}{/if}{/each}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if rest_attributes}
        <p class="rest-attributes">
          Also takes any {rest_attributes} attribute (class, style, aria-*, event handlers,
          ...), passed on to its root element.
        </p>
      {/if}
    {:catch error}
      <p>Failed to load the props of {name}: {error}</p>
    {/await}
  {/if}
</details>

<style>
  details.props-table {
    margin-block: var(--props-table-margin-block, 2em);
  }
  summary {
    cursor: pointer;
    font-weight: bold;
  }
  .component-name {
    font-family: var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
  }
  .table-scroll {
    overflow-x: auto;
  }
  /* reference detail, not page prose: a step below the body text. Fixed layout with set column
     shares, descriptions the largest: auto layout hands spare width out by each column's longest
     unwrapped cell, so a few long types or defaults would widen their whole column. display:
     table in case the site styles tables display: block, which resolves the shares against
     content width. */
  table {
    display: table;
    width: 100%;
    min-width: 760px;
    table-layout: fixed;
    font-size: 0.85em;
    /* just wide enough for three digits */
    :is(td, th):first-child {
      width: 1.8em;
      padding-inline: 2pt 0;
    }
    :is(td, th):nth-child(2) {
      padding-inline-start: 6pt;
    }
    th:nth-child(2) {
      width: 15%;
    }
    th:nth-child(3) {
      width: 21%;
    }
    th:nth-child(4) {
      width: 11%;
    }
    td:first-child {
      opacity: 0.6;
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    td:not(:first-child, :last-child) {
      overflow-wrap: anywhere; /* long names and types wrap inside their share */
    }
  }
  td small {
    display: block;
    opacity: 0.7;
  }
  .long-type {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: start;
    cursor: pointer;
    &:not(.expanded) code {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
  }
  .rest-attributes {
    font-size: 0.85em;
    opacity: 0.8;
  }
</style>
