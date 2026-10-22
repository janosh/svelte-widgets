<script lang="ts">
  // Body of a SvelteKit +error.svelte. Takes status and message as props (pass page.status
  // and page.error?.message) so the library stays free of $app imports.
  import type { HTMLAttributes } from 'svelte/elements'

  const {
    status,
    message,
    name,
    bugs_url,
    status_page_url,
    home_href = `/`,
    logo,
    ...rest
  }: {
    status: number
    message?: string
    name?: string // site name for the tab title and logo alt text
    bugs_url?: string // issue tracker linked on 5xx errors
    status_page_url?: string // the host's status page, linked when the visitor is offline
    home_href?: string
    logo?: string // image URL shown in the home link
  } & HTMLAttributes<HTMLDivElement> = $props()

  // undefined until hydration reads navigator.onLine: starting with false would flash the
  // offline note at online visitors in prerendered HTML, starting with true would hide it
  let online: boolean | undefined = $state()
  const tail = $derived(message ? `: ${message}` : ``)
</script>

<svelte:head>
  <title>Error {status}{name ? ` • ${name}` : ``}</title>
</svelte:head>

<svelte:window bind:online />

<div {...rest} class={[`error-page`, rest.class]}>
  <!-- the dizzy 0 is for eyes; screen readers get the plain status -->
  <h1 id="error" aria-label="Error {status}{tail}">
    Error {String(status).replace(`0`, `😵`)}{tail}
  </h1>

  {#if status >= 500 && bugs_url}
    <p>
      If reloading the page doesn't help, please
      <a href={bugs_url} target="_blank" rel="noreferrer">open an issue</a>. Thanks! 🙏
    </p>
  {/if}

  {#if online === false}
    <p>
      Looks like you're offline.
      {#if status_page_url}
        If you think your connection is fine, check the host's
        <a href={status_page_url} target="_blank" rel="noreferrer">status page</a>.
      {/if}
    </p>
  {/if}

  <p>
    <!-- one line: whitespace inside the link would be underlined -->
    Back to
    <a href={home_href}
      >{#if logo}<img src={logo} alt={name ?? ``} height="30" />{/if}landing page</a
    >.
  </p>
</div>

<style>
  .error-page {
    font-size: 1.2em;
    max-width: 45em;
    padding: 5em 3em 1em;
    margin: auto;
    text-align: center;
    img {
      vertical-align: middle;
      margin: 0 1pt 0 3pt;
    }
  }
</style>
