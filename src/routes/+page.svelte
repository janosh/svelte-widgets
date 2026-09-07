<script lang="ts">
  import { ContributorList, heading_anchors, type Contributor } from '$lib'
  import Readme from '$root/readme.md'
  import { DemoNav, Examples } from '$site'
  import { onMount } from 'svelte'

  let contributors = $state<Contributor[]>([])

  onMount(() => {
    const url = `https://api.github.com/repos/janosh/svelte-widgets/contributors?per_page=100`
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(
        (data: Contributor[]) =>
          (contributors = data.filter((usr) => !usr.login.includes(`[bot]`))),
      )
      .catch((error) => console.error(`Failed to fetch contributors:`, error))
  })
</script>

<main {@attach heading_anchors()}>
  <Readme />

  <h2>📚 &thinsp; Demos</h2>
  <DemoNav />
  <Examples />

  {#if contributors.length > 0}
    <section class="contributors">
      <h2 style="margin-bottom: 0.3rem">👏 &thinsp; Contributors</h2>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem">
        Thanks to all who helped make this project better!
      </p>
      <ContributorList
        {contributors}
        --contributor-avatar-size="64px"
        --contributor-gap="1.2rem"
      />
    </section>
  {/if}
</main>

<style>
  @media (max-width: 600px) {
    :global(h1[align='center']) {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  }
  :global(.hide-in-docs) {
    display: none;
  }
  section.contributors {
    max-width: 50em;
    margin: 3rem auto;
    text-align: center;
  }
</style>
