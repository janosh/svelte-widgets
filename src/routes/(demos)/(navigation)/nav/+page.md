# Nav

Responsive navigation with desktop dropdowns, a mobile menu, native links, and keyboard focus management. Pass explicit route objects and a `pathname` string; the component has no router dependency.

## Links and dropdowns

Every link has `href` and `label`. A group adds `children`, which use the same link objects. Give a group its own `href` to make the heading a link, or omit it for a heading without a destination. Children contain only submenu links; do not repeat the parent to enable its heading link.

```svelte example id="nav-links"
<script lang="ts">
  import { Nav, type NavRoute } from 'svelte-widgets'

  const routes: NavRoute[] = [
    { href: '/', label: 'Home' },
    {
      href: '/docs',
      label: 'Documentation',
      children: [
        { href: '/docs/intro', label: 'Introduction' },
        { href: '/docs/api', label: 'API reference', tooltip: 'Browse the public API' },
        {
          href: '/docs/upcoming',
          label: 'Upcoming',
          disabled: true,
          tooltip: 'Coming soon',
        },
      ],
    },
    { separator: true },
    {
      label: 'Resources',
      children: [
        {
          href: 'https://svelte.dev',
          label: 'Svelte',
          target: '_blank',
          rel: 'noreferrer',
        },
      ],
      align: 'right',
    },
  ]
</script>

<Nav
  data-content-ignore
  {routes}
  pathname="/docs/intro"
  breakpoint={0}
  link_props={{ onclick: (event) => event.preventDefault() }}
/>
```

Pass your router’s pathname as a string; for example, SvelteKit callers can use `pathname={page.url.pathname}`.

Route labels are plain text, including markup characters. Use the `item` snippet for formatted content. `disabled` is a boolean; put its explanation in `tooltip`. A tooltip can be text or an options object, merged over `tooltip_options`. Native `target`, `rel`, and `title` work on links and linked group headings. Separators are standalone `{ separator: true }` entries.

## Custom items

One `item({ route, is_active })` snippet formats the content of links, group headings, and submenu items. Nav supplies the enclosing anchor or disabled span, including its styling, attributes, and navigation callbacks.

```svelte example id="nav-items" collapsible
<script lang="ts">
  import { Nav } from 'svelte-widgets'

  const routes = [
    { href: '/', label: 'Home', emoji: '🏠' },
    { href: '/docs', label: 'Docs', emoji: '📚' },
    { href: '/settings', label: 'Settings', emoji: '⚙️' },
  ]
</script>

<Nav
  data-content-ignore
  {routes}
  pathname="/docs"
  breakpoint={0}
  on_navigate={() => false}
>
  {#snippet item({ route, is_active })}
    <span style:font-weight={is_active ? 'bold' : 'normal'}>
      {route.emoji}
      {route.label}
    </span>
  {/snippet}
</Nav>
```

Return non-interactive content such as text, icons, `<code>`, or styled spans. Use `on_navigate` to observe or cancel navigation.

## Controlled mobile menu

Use `bind:open` to control the mobile menu. `children({ open, panel_id, routes })` adds content after the routes. `on_open` and `on_close` observe transitions, and `on_navigate({ href, event, route })` can return `false` to cancel navigation.

```svelte example id="nav-controlled" collapsible
<script lang="ts">
  import { Nav } from 'svelte-widgets'

  let open = $state(false)
  let message = $state('No navigation yet')
  const routes = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ]
</script>

<button onclick={() => (open = !open)}>{open ? 'Close' : 'Open'} navigation</button>
<p>{message}</p>
<Nav
  data-content-ignore
  {routes}
  bind:open
  breakpoint={9999}
  style="--nav-burger-position: absolute; --nav-mobile-menu-position: absolute"
  on_navigate={({ href }) => {
    message = `Selected ${href}`
    return false
  }}
>
  {#snippet children({ open })}
    <span>{open ? 'Menu open' : 'Menu closed'}</span>
  {/snippet}
</Nav>
```

## Breakpoint and styling

`breakpoint` defaults to 767 pixels. Use `breakpoint={0}` for desktop navigation at every width or a larger threshold for the mobile layout. `dropdown_column_threshold` controls when desktop submenus use two columns.

```css
nav {
  --nav-border-radius: 6pt;
  --nav-link-bg-hover: rgba(255, 255, 255, 0.1);
  --nav-link-active-color: mediumseagreen;
  --nav-dropdown-bg: var(--surface-bg);
  --nav-dropdown-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  --nav-dropdown-z-index: 100;
  --nav-mobile-z-index: 2;
  --nav-disabled-opacity: 0.5;
  --nav-separator-color: currentColor;
  --nav-separator-margin: 0 0.25em;
}
```

`burger_props`, `menu_props`, and `link_props` customize the corresponding elements. Shared props cannot replace component-owned link destinations, active state, or menu IDs. `labels` translates the submenu toggle, while each route owns its visible label.
