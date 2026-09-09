<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { MultiSelectProps } from '$lib/types'

  let {
    snippet_variant = `all`,
    ...rest
  }: MultiSelectProps & { snippet_variant?: `all` | `children` | `option` } = $props()
</script>

{#if snippet_variant === `children`}
  <MultiSelect {...rest}>
    {#snippet children({ option, type })}
      <span data-testid="multiselect-child" data-type={type}>{option}</span>
    {/snippet}
  </MultiSelect>
{:else if snippet_variant === `option`}
  <MultiSelect {...rest}>
    {#snippet option({ option, idx, selected, active, disabled })}
      <span
        data-testid="multiselect-option"
        data-selected={selected}
        data-active={active}
        data-disabled={disabled}
        data-idx={idx}
        >{option}
      </span>
    {/snippet}
  </MultiSelect>
{:else}
  <MultiSelect {...rest}>
    {#snippet expand_icon({ open, disabled })}
      <span class="expand-snippet" data-open={open} data-disabled={disabled}>▼</span>
    {/snippet}
    {#snippet remove_icon({ option, is_remove_all })}
      <span
        class="remove-snippet"
        data-option={option}
        data-is-remove-all={is_remove_all}
      >
        ✕
      </span>
    {/snippet}
    {#snippet before_input({ search_text })}
      <span class="before-input-snippet" data-search-text={search_text}>before</span>
    {/snippet}
    {#snippet after_input({ search_text })}
      <span class="after-input-snippet" data-search-text={search_text}>after</span>
    {/snippet}
    {#snippet selected_item({ option, idx })}
      <span class="selected-item-snippet" data-idx={idx}>{option}</span>
    {/snippet}
    {#snippet user_msg({ search_text, msg_type, msg })}
      <span
        class="user-msg-snippet"
        data-search-text={search_text}
        data-msg-type={msg_type}
        >{msg}
      </span>
    {/snippet}
    {#snippet spinner()}
      <span class="spinner-snippet">loading</span>
    {/snippet}
    {#snippet disabled_icon()}
      <span class="disabled-icon-snippet">disabled</span>
    {/snippet}
    {#snippet group_header({ group, options, collapsed })}
      <span
        class="group-header-snippet"
        data-group={group}
        data-count={options.length}
        data-collapsed={collapsed}
        >{group}
      </span>
    {/snippet}
  </MultiSelect>
{/if}
