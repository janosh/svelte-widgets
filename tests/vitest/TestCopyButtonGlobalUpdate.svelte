<script lang="ts">
  import { CopyButton } from '$lib'

  let {
    on_success_initial = (_content: string) => {},
    on_success_next = (_content: string) => {},
  }: {
    on_success_initial?: (content: string) => void
    on_success_next?: (content: string) => void
  } = $props()

  let [use_next_callback, disabled] = $state([false, false])
</script>

<button data-test-use-next-callback onclick={() => (use_next_callback = true)}>
  use next callback
</button>
<button data-test-toggle-global-disabled onclick={() => (disabled = !disabled)}>
  toggle global disabled
</button>

<CopyButton
  global_selector=".copy-target"
  {disabled}
  on_copy_success={use_next_callback ? on_success_next : on_success_initial}
  reset_ms={1000}
/>
