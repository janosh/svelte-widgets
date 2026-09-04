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
  <Nav {...rest}>
    {#snippet link({ href, label, isActive })}
      <a data-testid="nav-link" {href} data-is-active={isActive}>{label}</a>
    {/snippet}
    {#snippet item({ href, label, is_active, is_dropdown, render_default })}
      <div
        data-testid="nav-item"
        data-href={href}
        data-active={is_active}
        data-dropdown={is_dropdown}
      >
        <span>{label}</span>
        {@render render_default()}
      </div>
    {/snippet}
    {#snippet children({ is_open, panel_id, routes })}
      <div data-testid="nav-children" data-open={is_open} data-panel-id={panel_id}>
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
        >{item[0]}
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
