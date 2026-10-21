<script lang="ts">
  // Put in the root layout: SSR places it in <head>, where it applies the stored theme before
  // the body paints. Client-side renders skip it (innerHTML scripts don't run); watch_theme or
  // ThemeToggle take over from there.
  // Under a Content-Security-Policy, pass the request's script nonce: an inline script without
  // one is blocked, and SvelteKit doesn't fill %sveltekit.nonce% inside {@html}.
  import { theme_init_script } from './theme.svelte'
  import { escape_html } from './utils'

  const { nonce }: { nonce?: string } = $props()

  // A literal script tag in the template would end this component's own <script> for parsers
  const tag = `script`
  const nonce_attr = $derived(nonce ? ` nonce="${escape_html(nonce)}"` : ``)
</script>

<svelte:head>
  {@html `<${tag}${nonce_attr}>${theme_init_script}</${tag}>`}
</svelte:head>
