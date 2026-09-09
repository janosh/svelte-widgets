## How to acquire form data in submission handler

This example shows the JavaScript way of handling MultiSelect fields in form submission events. If you're using SvelteKit, you may want to check out [this example](kit-form-actions) to use [form actions](https://svelte.dev/docs/kit/form-actions) instead (which works even in browsers with JS disabled).

> Hint: Use <code>JSON.parse()</code> to convert the string value passed to form submit handler back to array.

```svelte example id="multiselect-form-data"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { ColorSnippet } from '$site'
  import { colors } from '$site/options'

  async function handle_submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    // use bind:this={form} or event.target as arg to new FormData()
    form_data = new FormData(event.target as HTMLFormElement)
  }
  let form_data: FormData | undefined
  // the key under which selected options are stored in FormData
  const name = 'martian-flag'
</script>

<form onsubmit={handle_submit}>
  <label for="colors">
    <strong>Which colors would you pick for the Martian flag?</strong>
  </label>
  <MultiSelect options={colors} placeholder="Pick some colors..." {name} required={2}>
    {#snippet children({ idx, option })}
      <ColorSnippet {idx} {option} />
    {/snippet}
  </MultiSelect>
  <button>Submit</button>
  <small>
    select some options, then click submit to see what data MultiSelect sends to a form
    submit handler
  </small>
</form>

{#if form_data}
  Received form data:
  <pre><code>{JSON.stringify(Object.fromEntries(form_data))}</code></pre>
  Raw value of
  <code>form_data.get(name)</code>:
  <pre><code>{form_data.get(name)}</code></pre>
{/if}

<style>
  form {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 1ex 1em;
    border-radius: 3pt;
  }
</style>
```
