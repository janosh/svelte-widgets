<script lang="ts">
  // Put in the root layout: SSR places it in <head>, where it applies the stored theme before
  // the body paints. Client-side renders skip it (innerHTML scripts don't run); watch_theme or
  // ThemeToggle take over from there.
  import { theme_init_script } from './theme.svelte'

  // A literal script tag in the template would end this component's own <script> for parsers
  const tag = `script`
</script>

<svelte:head>
  {@html `<${tag}>${theme_init_script}</${tag}>`}
</svelte:head>
