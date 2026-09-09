## How to acquire form data in submission handler

This example shows the JavaScript way of handling MultiSelect fields in form submission events. If you're using SvelteKit, you may want to check out [this example](kit-form-actions) to use [form actions](https://svelte.dev/docs/kit/form-actions) instead (which works even in browsers with JS disabled).

> Hint: Use <code>JSON.parse()</code> to convert the string value passed to form submit handler back to array.

```svelte example id="multiselect-form-data"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  const colors =
    `Red Green Blue Yellow Purple Pink Brown Black White Gray Orange Cyan Magenta Silver Gold Turquoise Violet Lime Indigo Navy`.split(
      ` `,
    )

  async function handle_submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    // use bind:this={form} or event.target as arg to new FormData()
    form_data = new FormData(event.target as HTMLFormElement)
  }
  let form_data: FormData | undefined
  // the key under which selected options are stored in FormData
  const name = 'martian-flag'
</script>

{#snippet color_option(option: string, idx?: number)}
  <span style="display: inline-flex; align-items: center; gap: 5pt">
    {#if idx !== undefined}{idx + 1}{/if}
    <span style={`background: ${option}; width: 1em; height: 1em; border-radius: 2pt`}
    ></span>
    {option}
  </span>
{/snippet}

<form onsubmit={handle_submit}>
  <label for="colors">
    <strong>Which colors would you pick for the Martian flag?</strong>
  </label>
  <MultiSelect
    id="colors"
    options={colors}
    placeholder="Pick some colors..."
    {name}
    required={2}
  >
    {#snippet children({ idx, option })}
      {@render color_option(option, idx)}
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
