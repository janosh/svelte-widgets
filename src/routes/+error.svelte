<script lang="ts">
  import ErrorPage from '#lib/ErrorPage.svelte'
  import { page } from '$app/state'
  import { bugs, name } from '#root/package.json'
  import favicon from '#site/favicon.svg'
  import { resolve_demo_path } from '#site/paths.ts'
</script>

<ErrorPage
  status={page.status}
  message={page.error?.message}
  {name}
  bugs_url={bugs}
  status_page_url="https://githubstatus.com"
  home_href={resolve_demo_path(`/`)}
  logo={favicon}
/>
