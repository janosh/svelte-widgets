## `backdrop_dismiss`

`backdrop_dismiss` closes a native dialog only when both the press and release land on its `::backdrop`, not when a text selection starts inside and ends outside.

```svelte example id="attachments-backdrop-dismiss"
<script lang="ts">
  import { backdrop_dismiss } from '$lib/attachments'

  let dialog = $state<HTMLDialogElement | null>(null)
</script>

<button onclick={() => dialog?.showModal()}>Open native dialog</button>
<dialog aria-label="Native dialog" bind:this={dialog} {@attach backdrop_dismiss()}>
  <p>Click the backdrop to close.</p>
  <button onclick={() => dialog?.close()}>Close</button>
</dialog>
```
