## Parse labels as HTML

When `parseLabelsAsHtml={true}`, MultiSelect renders HTML in option labels.

> **Security:** Only use trusted or sanitized labels. Raw HTML can enable XSS. The
> runtime warning only detects combining `parseLabelsAsHtml` with `allowUserOptions`;
> it does not sanitize labels.

```svelte example id="multiselect-html-labels"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  const red_pill: string = `🔴  &ensp; Red Pill (<a href="https://wikipedia.org/wiki/Red_pill_and_blue_pill">what?</a>)`
  const blue_pill: string = `🔵  &ensp; Blue Pill &nbsp; <img alt="Morpheus" height="25px" style="vertical-align: middle;" src="https://upload.wikimedia.org/wikipedia/en/a/ab/Morpheus.jpg" />`

  let value: ObjectOption | null = $state(null)
</script>

<MultiSelect
  options={[
    { label: red_pill, value: `red pill` },
    { label: blue_pill, value: `blue pill` },
  ]}
  maxSelect={1}
  placeholder="Are you ready for the truth? Pick a pill!"
  parseLabelsAsHtml
  bind:value
/>

{#if value}
  <p style="margin-top: 0.5em">You chose the <strong>{value.value}</strong>.</p>
{/if}
```
