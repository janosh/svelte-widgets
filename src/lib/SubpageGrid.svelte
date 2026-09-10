<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import Heading from './Heading.svelte'

  import { ChevronRight, type IconData } from './icons'

  const title_id = $props.id()

  type Subpage = [title: string, href: string, description: string, icon?: IconData]

  const {
    title,
    subtitle,
    subpages,
    fallback_icon = ChevronRight,
    ...rest
  }: {
    title: string
    subtitle: string
    subpages: Subpage[]
    fallback_icon?: IconData
  } & HTMLAttributes<HTMLDivElement> = $props()
</script>

<div {...rest} class={[`subpage-grid`, rest.class]}>
  <Heading level={1} id={title_id}>{title}</Heading>
  <p class="subtitle">{subtitle}</p>

  <nav class="grid">
    <!-- index-prefixed: an href is a destination, so two cards may point at one page -->
    {#each subpages as [page_title, href, description, icon], idx (`${idx}-${href}`)}
      <a {href} class="card">
        <Icon icon={icon ?? fallback_icon} class="icon" aria-hidden="true" />
        <div>
          <h2>{page_title}</h2>
          <p>{description}</p>
        </div>
      </a>
    {/each}
  </nav>
</div>

<style>
  :global(.subpage-grid > h1) {
    text-align: center;
    margin-bottom: 0.3em;
  }
  .subtitle {
    text-align: center;
    color: var(--text-muted);
    margin: 0 auto 1.8em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1em;
    max-width: var(--main-max-width);
    margin: 0 auto;
    padding: 0;
  }
  .card {
    display: flex;
    gap: 0.75em;
    align-items: flex-start;
    padding: 0.85em 1em;
    border-radius: 5pt;
    border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .card:hover {
    border-color: color-mix(in srgb, currentColor 28%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, currentColor 8%, transparent);
  }
  .card h2 {
    margin: 0 0 0.3em;
    font-size: 1.02em;
  }
  .card p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.88em;
    line-height: 1.45;
  }
  .card :global(svg.icon) {
    width: 1.2em;
    height: auto; /* keeps non-square glyphs in proportion, as Icon.svelte does */
    max-height: 1.2em;
    flex-shrink: 0;
    margin-top: 0.14em;
    opacity: 0.65;
  }
</style>
