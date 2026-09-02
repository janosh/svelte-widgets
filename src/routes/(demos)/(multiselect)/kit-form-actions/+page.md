## Hook up Multiselect to SvelteKit form action incl. form validation

This example shows the SvelteKit form action way of handling MultiSelect fields in form submission events. If you're not interested in [progressively enhanced forms](https://svelte.dev/docs/kit/form-actions#progressive-enhancement) (i.e. supporting no-JS browsers) take a look at the [JS form example](form) instead.

> This example only works when running the dev server locally because it needs
> a server to respond to the form's POST request and this documentation site is only static
> HTML.

```svelte example id="multiselect-kit-form-action"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { ColorSnippet } from '$site'
  import { colors } from '$site/options'
  import { repository } from '$root/package.json'
  import type { ActionData } from './$types'

  let { form }: { form: ActionData } = $props()

  // the action prefixes the json error with the parse message, so key off the prefix
  let err_msg = $derived(
    {
      missing: 'Please select at least one color',
      json: 'Could not parse the submitted colors',
      array: 'Expected a list of colors',
      boring: 'Boring answer!',
    }[(form?.error as string)?.split(':')[0]],
  )
</script>

<form method="POST" action="?/validate-form">
  <label for="colors">
    <strong>Which colors would you pick for the Martian flag?</strong>
  </label>
  <MultiSelect
    options={colors}
    placeholder="Pick some colors..."
    name="colors"
    required
    invalid={!!form?.error}
    selected={form?.colors ?? [`Red`]}
  >
    {#snippet children({ idx, option })}
      <ColorSnippet {idx} {option} />
    {/snippet}
  </MultiSelect>
  <button>Submit</button>
  <small>
    select some options, then click submit to see what data MultiSelect sends to a form
    submit handler
  </small>
  {#if err_msg}
    <p class="error">{err_msg}</p>
  {/if}
  {#if form?.success}
    <p class="success">
      Good answer! You entered
      {#each form.colors as color}
        <ColorSnippet
          option={color}
          style="display: inline-flex; vertical-align: middle; margin: 0 0 0 1ex"
        />
      {/each}
    </p>
  {/if}
</form>

<style>
  form {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 1ex 1em;
    border-radius: 3pt;
  }
  p {
    margin: 1em 0 1ex;
  }
  p.error {
    color: red;
  }
  p.success {
    width: max-content;
    padding: 1pt 6pt;
    box-sizing: border-box;
    color: lightgreen;
    border: 1px solid;
    border-radius: 3pt;
  }
</style>
```

### +page.server.ts

The above code needs to be in a `+page.svelte` file with the following `+page.server.ts` file in the same directory next to it.

`export const actions` is what your own app wants. This site exports `_actions` so its
static build skips it; rename it back to run the demo locally.

```ts
import { fail } from '@sveltejs/kit'
import { colors as allowed_colors } from '$site/options'
import type { Actions } from './$types'

export const actions = {
  'validate-form': async ({ request }) => {
    const data = await request.formData()
    let colors = data.get(`colors`)

    // every failure returns an array — `boring` echoes the valid picks, the rest send none —
    // so the client can always bind it to `selected`
    if (!colors || typeof colors !== `string`) {
      return fail(400, { colors: [], error: `missing` })
    }

    try {
      colors = JSON.parse(colors)
    } catch (error) {
      return fail(400, { colors: [], error: `json: ${String(error)}` })
    }

    if (!Array.isArray(colors)) {
      return fail(400, { colors: [], error: `array` })
    }
    // only offered colors may reach the response, so a hand-crafted POST can't echo
    // arbitrary values back into the page
    const valid_colors = colors.filter(
      (color: unknown): color is string =>
        typeof color === `string` && allowed_colors.includes(color),
    )
    if (valid_colors.length === 0) {
      return fail(400, { colors: [], error: `missing` })
    }
    if (valid_colors.length === 1 && valid_colors[0] === `Red`) {
      return fail(400, { colors: valid_colors, error: `boring` })
    }

    return { colors: valid_colors, success: true }
  },
} satisfies Actions
```
