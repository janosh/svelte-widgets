<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import type { FooterLink } from './types'

  let {
    links = [],
    item,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children`> & {
    links?: readonly FooterLink[]
    // replaces the default <a> for every link, e.g. to use an icon set this package
    // doesn't bundle
    item?: Snippet<[{ link: FooterLink }]>
    children?: Snippet
  } = $props()
</script>

<footer {...rest}>
  {#if links.length > 0}
    <nav>
      <!-- index-prefixed: two links may share an href, which alone would collide -->
      {#each links as link, idx (`${idx}-${link.href}`)}
        {#if item}
          {@render item({ link })}
        {:else}
          <a href={link.href} title={link.title} target={link.target} rel={link.rel}>
            {#if link.icon}<Icon icon={link.icon} />{/if}{link.label}
          </a>
        {/if}
      {/each}
    </nav>
  {/if}
  {@render children?.()}
</footer>

<style>
  footer {
    padding: var(--footer-padding, 3vh 3vw);
    background: var(--footer-bg, transparent);
    text-align: center;
  }
  footer nav {
    display: flex;
    gap: var(--footer-nav-gap, 2em);
    place-content: center;
    flex-wrap: wrap;
    margin: var(--footer-nav-margin, 2em 0);
  }
  footer nav a {
    display: inline-flex;
    align-items: center;
    gap: var(--footer-link-gap, 3pt);
    color: var(--footer-link-color, inherit);
  }
</style>
