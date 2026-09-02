<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements'
  import type { IconData } from './icons/types'

  // SVGAttributes, not HTMLAttributes, which rejects the `width`/`height` an <svg> takes.
  // Exactly one of a glyph or an ad-hoc `path` — a bare <Icon /> is a type error. Pass the
  // glyph value, not a name, so the bundler keeps only the icons this call site reaches.
  let {
    icon,
    path,
    viewBox = `0 0 24 24`,
    stroke,
    ...rest
  }: SVGAttributes<SVGSVGElement> &
    (
      | { icon: IconData; path?: never; viewBox?: never; stroke?: never }
      | { icon?: never; path: string; viewBox?: string; stroke?: string }
    ) = $props()

  // The union rules out "neither", but destructuring loses that correlation for the
  // type checker, so state it here rather than assert.
  const resolved_icon: IconData = $derived.by(() => {
    if (icon) return icon
    if (path === undefined) throw new Error(`Icon needs either an icon or a path`)
    return { d: path, viewBox, stroke }
  })
</script>

<svg
  role="img"
  viewBox={resolved_icon.viewBox}
  fill={resolved_icon.fill ?? (resolved_icon.stroke ? `none` : `currentColor`)}
  stroke={resolved_icon.stroke}
  {...rest}
>
  {#if `markup` in resolved_icon}
    <!-- several shapes rather than one `d`. Only set glyphs reach {@html}; a caller's
    `path` always becomes the `d` below, so markup in it cannot inject nodes -->
    {@html resolved_icon.markup}
  {:else}
    <path d={resolved_icon.d} />
  {/if}
</svg>

<style>
  svg {
    width: var(--icon-size, 1em);
    /* auto rather than 1em: several glyphs have non-square viewBoxes, which a fixed
       height squashes. Setting --icon-size opts back into a square box. */
    height: var(--icon-size, auto);
    display: inline-block;
    vertical-align: middle;
  }
</style>
