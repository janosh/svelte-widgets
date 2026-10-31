<!-- Inline pill for a category, status, filter or count: a static badge, a link (href) or a button
  (onclick), optionally removable. class and style land on the pill; other attributes on its
  link, button or label span. For a frosted label overlaid on an image or canvas, use GlassChip. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements'
  import { get_bg_color, pick_contrast_color } from './attachments/contrast-color'
  import Icon from './Icon.svelte'
  import type { IconData } from './icons'
  import { Cross } from './icons'
  import { merge_defaults, TAG_LABELS, type TagLabels } from './labels'
  import { theme } from './theme.svelte'

  let {
    label,
    children,
    href,
    onclick,
    active,
    disabled = false,
    variant = `soft`,
    color,
    icon,
    count,
    on_remove,
    labels,
    class: class_name,
    style,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children` | `class` | `style` | `onclick`> &
    Pick<HTMLAnchorAttributes, `target` | `rel` | `download`> & {
      label?: string // text content, also part of the remove button's name
      children?: Snippet // replaces label as the content
      href?: string // renders a link
      onclick?: (event: MouseEvent) => void // renders a button (a link keeps its href)
      // Selected state, filled like solid. A button also gets aria-pressed, making it a toggle;
      // a badge or link only takes the style (e.g. a tag matching the active filter).
      active?: boolean
      disabled?: boolean
      variant?: `solid` | `soft` | `outline`
      // Fill (solid, active), tint (soft) or border (outline); any CSS color incl. var()
      color?: string
      icon?: IconData // leading glyph
      count?: number | string // trailing counter badge
      on_remove?: (event: MouseEvent) => void // adds a remove button after the content
      labels?: Partial<TagLabels>
      class?: ClassValue
      style?: string
    } = $props()

  const msg = $derived(merge_defaults(TAG_LABELS, labels))
  const tag_name = $derived(href !== undefined ? `a` : onclick ? `button` : `span`)
  // the remove button is named by its own text plus the content, whether label or children
  const uid = $props.id()
  const content_id = $derived(rest.id ?? `${uid}-content`)

  // Contrast is picked from the painted fill rather than the color prop, so var(), color-mix()
  // and a --tag-color set in a stylesheet all resolve. Reads color and the theme mode to re-pick
  // when either changes, e.g. for light-dark() or a theme-dependent var().
  let contrast_text = $state<string>()
  const auto_contrast = (node: HTMLElement) => {
    if (variant !== `solid` && !active) return
    void [color, theme.mode]
    contrast_text = pick_contrast_color({ bg_color: get_bg_color(node) })
    return () => (contrast_text = undefined)
  }
</script>

<span
  class={[
    `tag`,
    variant,
    { active, disabled, removable: Boolean(on_remove) },
    class_name,
  ]}
  {style}
  style:--tag-color={color}
  style:--tag-contrast-color={contrast_text}
  {@attach auto_contrast}
>
  <svelte:element
    this={tag_name}
    class="content"
    id={content_id}
    href={disabled ? undefined : href}
    role={tag_name === `a` && disabled ? `link` : undefined}
    aria-disabled={tag_name === `a` && disabled ? `true` : undefined}
    type={tag_name === `button` ? `button` : undefined}
    disabled={tag_name === `button` ? disabled : undefined}
    aria-pressed={tag_name === `button` ? active : undefined}
    onclick={disabled ? undefined : onclick}
    {...rest}
  >
    {#if icon}<Icon {icon} />{/if}
    {#if children}{@render children()}{:else}{label}{/if}
    {#if count !== undefined}<span class="count">{count}</span>{/if}
  </svelte:element>
  {#if on_remove}
    <button
      class="remove"
      type="button"
      id="{uid}-remove"
      aria-label={msg.remove}
      aria-labelledby="{uid}-remove {content_id}"
      {disabled}
      onclick={on_remove}
    >
      <Icon icon={Cross} />
    </button>
  {/if}
</span>

<style>
  .tag {
    --tag-fill: var(--tag-color, var(--accent, cornflowerblue));
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    max-width: 100%;
    vertical-align: middle;
    border: var(--tag-border-width, 1px) solid var(--tag-border-color, transparent);
    border-radius: var(--tag-border-radius, 1em);
    background: var(--tag-bg, color-mix(in srgb, var(--tag-fill) 18%, transparent));
    color: var(--tag-text-color, inherit);
    font-size: var(--tag-font-size, 0.85em);
    font-weight: var(--tag-font-weight, inherit);
    line-height: var(--tag-line-height, 1.3);
    white-space: nowrap;
  }
  /* flat rather than nested under .tag, which happy-dom's CSS parser drops whole */
  .tag.outline {
    border-color: var(--tag-border-color, var(--tag-fill));
    background: var(--tag-bg, transparent);
  }
  .tag.solid {
    background: var(--tag-bg, var(--tag-fill));
  }
  .tag.active {
    background: var(--tag-active-bg, var(--tag-fill));
  }
  .tag:is(.solid, .active) {
    color: var(--tag-text-color, var(--tag-contrast-color, inherit));
  }
  .tag.disabled {
    opacity: var(--tag-disabled-opacity, 0.5);
  }
  .content {
    display: inline-flex;
    align-items: center;
    gap: var(--tag-gap, 0.35em);
    min-width: 0;
    padding: var(--tag-padding, 0.15em 0.65em);
    border: none;
    border-radius: inherit;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    &:is(a[href], button:enabled) {
      cursor: pointer;
      &:hover {
        background: var(
          --tag-hover-bg,
          color-mix(in srgb, currentColor 12%, transparent)
        );
      }
    }
    &:focus-visible {
      outline: 2px solid var(--tag-focus-color, var(--tag-fill));
      outline-offset: 1px;
    }
  }
  .removable .content {
    padding-inline-end: 0.3em;
  }
  .count {
    padding: 0 0.45em;
    border-radius: 1em;
    background: var(--tag-count-bg, color-mix(in srgb, currentColor 15%, transparent));
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }
  .remove {
    display: inline-grid;
    place-items: center;
    align-self: stretch;
    padding: var(--tag-remove-padding, 0 0.5em 0 0.2em);
    border: none;
    border-radius: inherit;
    background: none;
    color: inherit;
    font: inherit;
    opacity: 0.7;
    cursor: pointer;
    &:hover:enabled,
    &:focus-visible {
      opacity: 1;
    }
    &:focus-visible {
      outline: 2px solid var(--tag-focus-color, var(--tag-fill));
    }
    &:disabled {
      cursor: not-allowed;
    }
  }
</style>
