<script lang="ts" generics="Props extends Record<string, unknown>">
  // Mounts a component (imported on demand) or a snippet once it nears the viewport, holding a
  // placeholder height until then. Keeps it mounted after scrolling away, so user input and
  // loaded data survive, and renders only the placeholder during SSR.
  import type { Component, Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { in_view } from './attachments/index'

  let {
    load,
    props,
    children,
    label,
    height = `500px`,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    label: string // placeholder text and region name
    height?: string // min-height held until the content lays out
  } & (
      | {
          // a dynamic import of the component, and the props to pass it
          load: () => Promise<{ default: Component<Props>; props?: Partial<Props> }>
          props: Props
          children?: never
        }
      | { children: Snippet; load?: never; props?: never }
    ) = $props()

  let visible = $state(false)
  const pending = $derived(visible && load ? load() : undefined)

  // start just before the content scrolls into view
  const observe = in_view(() => (visible = true), { once: true, root_margin: `200px` })

  // The wrapper holds `height` until the content itself has laid out with some height.
  // Dropping it as soon as any child exists let content that renders nothing while its own
  // chunk loads collapse to 0, pulling every LazyMount below into view so they all loaded at
  // once. A loading message the content shows itself marks that with `data-lazy-placeholder`,
  // like the placeholder and loader here, so it neither counts as content nor collapses.
  let laid_out = $state(false)
  const hold_height = (element: HTMLElement) => {
    const is_content = (child: Element) =>
      !child.hasAttribute(`data-lazy-placeholder`) &&
      child.getBoundingClientRect().height > 0
    const release = () => {
      laid_out = true
      stop()
    }
    const resize = new ResizeObserver(() => {
      if ([...element.children].some(is_content)) release()
    })
    const watch_children = () => {
      // bare text has no box to observe, but is content all the same
      const has_text = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
      if (has_text) release()
      else for (const child of element.children) resize.observe(child)
    }
    const mutation = new MutationObserver(watch_children)
    const stop = () => {
      resize.disconnect()
      mutation.disconnect()
    }
    mutation.observe(element, { childList: true })
    watch_children()
    return stop
  }
</script>

<div
  {...rest}
  class={[`lazy-mount`, rest.class]}
  style:min-height={laid_out ? undefined : height}
  role="region"
  aria-label={label}
  {@attach observe}
  {@attach hold_height}
>
  {#if pending && props}
    {#await pending}
      <p role="status" data-lazy-placeholder>Loading {label}…</p>
    {:then { default: Loaded, props: loaded_props }}
      <Loaded {...loaded_props} {...props} />
    {:catch error}
      <p role="alert">
        Failed to load {label}: {error instanceof Error ? error.message : String(error)}
      </p>
    {/await}
  {:else if visible && children}
    {@render children()}
  {:else}
    <p class="placeholder" data-lazy-placeholder>{label}</p>
  {/if}
</div>

<style>
  .lazy-mount {
    min-width: 0;
    /* placeholders, its own or a loader the content marks, fill the held height */
    > :global([data-lazy-placeholder]) {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5em;
      min-height: inherit;
      margin: 0;
      padding: 1em;
      box-sizing: border-box;
      text-align: center;
      color: var(
        --lazy-mount-placeholder-color,
        var(--text-color-muted, light-dark(#666, #999))
      );
      background: var(--lazy-mount-placeholder-bg, var(--surface-bg, transparent));
    }
  }
</style>
