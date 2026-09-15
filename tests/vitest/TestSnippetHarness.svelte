<script lang="ts">
  import { ActionButton, CopyButton, FileDetails, Nav, PrevNext, Toggle } from '$lib'
  import type { ComponentProps } from 'svelte'

  type SnippetHarnessProps =
    | ({ component: `action-button` } & ComponentProps<typeof ActionButton>)
    | ({ component: `copy-button` } & ComponentProps<typeof CopyButton>)
    | ({ component: `file-details` } & ComponentProps<typeof FileDetails>)
    | ({ component: `nav` } & ComponentProps<typeof Nav>)
    | ({ component: `prev-next-children` } & ComponentProps<typeof PrevNext>)
    | ({ component: `toggle` } & ComponentProps<typeof Toggle>)

  let props: SnippetHarnessProps = $props()
  let nav_open = $derived(props.component === `nav` && (props.open ?? false))
</script>

{#if props.component === `action-button`}
  {@const { component, ...rest } = props}
  <ActionButton {...rest}>
    {#snippet children({ state, disabled, result })}
      <span
        data-testid="action-snippet"
        data-state={state}
        data-disabled={disabled}
        data-result={typeof result === `string` ? result : ``}>{state}</span
      >
    {/snippet}
  </ActionButton>
{:else if props.component === `copy-button`}
  {@const { component, ...rest } = props}
  <CopyButton {...rest}>
    {#snippet children({ state, disabled })}
      <span data-testid="copy-snippet" data-state={state} data-disabled={disabled}>
        {state}
      </span>
    {/snippet}
  </CopyButton>
{:else if props.component === `file-details`}
  {@const { component, ...rest } = props}
  <FileDetails {...rest}>
    {#snippet title_snippet({ idx, title })}
      <span data-testid="file-title" data-idx={idx}>{title}</span>
    {/snippet}
  </FileDetails>
{:else if props.component === `nav`}
  {@const { component, ...rest } = props}
  <button data-testid="nav-external-toggle" onclick={() => (nav_open = !nav_open)}
    >Toggle from parent</button
  >
  <Nav {...rest} bind:open={nav_open}>
    {#snippet item({ route, is_active })}
      <span data-testid="nav-item" data-href={route.href} data-active={is_active}
        >{route.label}</span
      >
    {/snippet}
    {#snippet children({ open, panel_id, routes })}
      <div data-testid="nav-children" data-open={open} data-panel-id={panel_id}>
        {routes.length} routes
      </div>
    {/snippet}
  </Nav>
{:else if props.component === `prev-next-children`}
  {@const { component, ...rest } = props}
  <PrevNext {...rest}>
    {#snippet children({ kind, item, index, total })}
      <span
        data-testid="prevnext-child"
        data-kind={kind}
        data-index={index}
        data-total={total}
        >{item.href}
      </span>
    {/snippet}
    {#snippet between()}
      <span data-testid="prevnext-between">between</span>
    {/snippet}
  </PrevNext>
{:else}
  {@const { component, ...rest } = props}
  <Toggle {...rest}>
    {#snippet children({ checked })}
      <span data-testid="toggle-snippet" data-checked={checked}>label</span>
    {/snippet}
  </Toggle>
{/if}
