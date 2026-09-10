<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  // Fixture for tests/playwright/CommandMenu.test.ts. happy-dom retargets nothing, so a
  // shadow root is the only place composedPath() and event.target differ.
  import { CommandMenu } from 'svelte-widgets'
  import { mount, unmount } from 'svelte'

  const actions = [`alpha`, `beta`, `gamma`].map((label) => ({
    id: label,
    label,
    action: () => {},
  }))

  const in_shadow_root = (node: HTMLElement) => {
    const app = mount(CommandMenu, {
      target: node.attachShadow({ mode: `open` }),
      props: { actions, open: true, close_keys: [], fade_duration_ms: 0 },
    })
    return () => void unmount(app)
  }
</script>

<Heading level={2} id="command-menu-in-a-shadow-root"
  >Command menu in a shadow root</Heading
>

<div id="shadow-host" {@attach in_shadow_root}></div>
