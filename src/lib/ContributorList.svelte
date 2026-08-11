<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { tooltip, type TooltipOptions } from './attachments/index'
  import type { Contributor } from './types'

  let {
    contributors,
    tooltip_options,
    ...rest
  }: Omit<HTMLAttributes<HTMLUListElement>, `children`> & {
    contributors: Contributor[]
    tooltip_options?: Omit<TooltipOptions, `content` | `render`>
  } = $props()
</script>

<ul {...rest}>
  {#each contributors as { avatar_url, html_url, login } (login)}
    <li>
      <a
        href={html_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={login}
        {@attach tooltip({ ...tooltip_options, content: login })}
      >
        <!-- Lazy avatar loading; intrinsic size prevents late layout shifts. -->
        <img src={avatar_url} alt="" width="60" height="60" loading="lazy" />
      </a>
    </li>
  {/each}
</ul>

<style>
  ul {
    display: flex;
    flex-wrap: wrap;
    place-content: center;
    list-style: none;
    padding: 0;
    gap: var(--contributor-gap, 1ex);
  }
  ul img {
    /* both dimensions, or a custom size leaves the 60px height attribute and an oval */
    width: var(--contributor-avatar-size, 60px);
    height: var(--contributor-avatar-size, 60px);
    border-radius: 50%;
    display: block;
    filter: grayscale(100%);
    transition: filter 0.3s ease-in-out;
  }
  ul img:hover {
    filter: none;
  }
</style>
