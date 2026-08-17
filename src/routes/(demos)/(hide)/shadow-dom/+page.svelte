<script lang="ts">
  // Fixture for tests/playwright/CommandMenu.test.ts. happy-dom retargets nothing, so a
  // shadow root is the only place composedPath() and event.target differ.
  import { CommandMenu } from '$lib'
  import { mount, unmount } from 'svelte'

  const actions = [`alpha`, `beta`, `gamma`].map((label) => ({ label, action: () => {} }))

  const in_shadow_root = (node: HTMLElement) => {
    const app = mount(CommandMenu, {
      target: node.attachShadow({ mode: `open` }),
      props: { actions, open: true, close_keys: [], fade_duration_ms: 0 },
    })
    return () => void unmount(app)
  }
</script>

<h2>Command menu in a shadow root</h2>

<div id="shadow-host" {@attach in_shadow_root}></div>
