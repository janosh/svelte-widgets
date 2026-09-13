<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import type { IconData } from './icons/types'
  import { heading_anchor_html } from './heading-anchors'

  let {
    id,
    level = 2,
    link = true,
    icon,
    icon_svg,
    children,
    ...attributes
  }: Omit<HTMLAttributes<HTMLHeadingElement>, 'id'> & {
    id: string
    level?: 1 | 2 | 3 | 4 | 5 | 6
    link?: boolean
    // Decorative icon before the heading text.
    icon?: IconData
    // Trusted SVG markup for the anchor icon.
    icon_svg?: string
    children?: Snippet
  } = $props()

  const tag = $derived.by(() => {
    if (!id.trim()) throw new Error(`Heading requires a nonempty id`)
    if (![1, 2, 3, 4, 5, 6].includes(level))
      throw new Error(`Heading level must be 1–6: ${level}`)
    return `h${level}`
  })
</script>

<svelte:element this={tag} {id} {...attributes}>
  {#if icon}<Icon
      {icon}
      class="heading-icon"
      aria-hidden="true"
    />{/if}{@render children?.()}{#if link}{@html heading_anchor_html(id, icon_svg)}{/if}
</svelte:element>
