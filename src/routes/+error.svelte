<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  import { page } from '$app/state'
  import { homepage, name } from '$root/package.json'
  import favicon from '$site/favicon.svg'

  // undefined until hydration reads navigator.onLine - starting with false would
  // flash the "you're offline" message at online users in the prerendered HTML
  let online: boolean | undefined = $state()
</script>

<svelte:head>
  <title>Error {page.status} &bull; {name}</title>
</svelte:head>

<svelte:window bind:online />

<div>
  <Heading level={1} id="error"
    >Error {String(page.status).replace(`0`, `😵`)}: {page.error?.message}</Heading
  >

  {#if page.status >= 500}
    <p>
      If page reloading doesn't help, please raise an issue on
      <a href="{homepage}/issues" target="_blank" rel="noreferrer">GitHub</a>. Thanks! 🙏
    </p>
  {/if}

  {#if online === false}
    Looks like you're offline. If you think your connection is fine, check the
    <a href="https://githubstatus.com">GitHub status page</a>
    as this site is hosted by &thinsp;<svg>
      <use href="#octicon-mark-github" />
    </svg>&thinsp; GitHub Pages.
  {/if}

  <p>
    Back to <a href=".">
      <img src={favicon} alt={name} height="30" />
      landing page
    </a>.
  </p>
</div>

<style>
  div {
    font-size: 1.2em;
    max-width: 45em;
    padding: 5em 3em 1em;
    margin: auto;
    text-align: center;
  }
  p img {
    vertical-align: middle;
    margin: 0 1pt 0 3pt;
  }
</style>
