<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  import Confetti from '$site/Confetti.svelte'

  let n_items = $state(50)
  let freeze = $state(false)
</script>

<Heading level={1} id="confetti-test">Confetti Test</Heading>

<label>
  n_items: {n_items}
  <input type="range" min="10" max="200" bind:value={n_items} />
</label>

<label>
  <input type="checkbox" bind:checked={freeze} />
  Freeze
</label>

<Confetti {n_items} {freeze} />

<style>
  label {
    display: block;
    margin: 1em 0;
  }
  input[type='range'] {
    width: 300px;
    margin-left: 1em;
  }
</style>
