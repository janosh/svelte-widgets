<script lang="ts">
  import { repository } from '#root/package.json'

  let { edit_href }: { edit_href: string } = $props()
</script>

<footer>
  <a href="{repository}/discussions/200">
    <svg><use href="#material-symbols-auto-awesome" /></svg>
    Showcase
  </a>
  <a href={edit_href}>
    <svg><use href="#carbon-edit" /></svg>
    Edit this page
  </a>
  <small title="For keyboard-only site navigation">
    <kbd>cmd+k</kbd> to open site search.
  </small>
</footer>

<style>
  footer {
    padding: 2em;
    margin-top: auto;
    width: calc(100% + 2 * var(--page-pad));
    position: relative;
    left: calc(-1 * var(--page-pad));
    box-sizing: border-box;
    background: var(--footer-bg);
    border-top: 1px solid var(--border);
    text-align: center;
  }
  footer > a {
    margin: 0 0.5em;
  }
  small {
    margin-top: 1em;
    display: block;
    color: var(--text-muted);
  }
  kbd {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 0.1em 0.4em;
    border-radius: 3pt;
    font-size: 0.9em;
  }
</style>
