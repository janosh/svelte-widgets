# Nav Component

Flexible, accessible navigation with dropdown support, mobile burger menu, and keyboard navigation.

- 🎯 Responsive with automatic mobile burger menu (default breakpoint &lt; 768px)
- ⌨️ Full keyboard navigation (Enter/Space/Arrows/Escape)
- ♿ Proper ARIA attributes and focus management
- 🎨 Customizable via CSS variables and props

## Basic Usage

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes: string[] = ['/', '/about', '/contact', '/blog']
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav {routes} {page} {link_props} />
```

**Features shown:** Simple string routes with auto-generated labels

## Custom Labels

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav
  routes={['/ui', '/css-classes', '/kit-form-actions']}
  labels={{
    '/ui': 'UI Components',
    '/css-classes': 'CSS Classes',
    '/kit-form-actions': 'Form Actions',
  }}
  {page}
  {link_props}
/>
```

**Features shown:** Override auto-generated labels via `labels` prop

## Dropdown Menus

Use tuple syntax `[parent, [children...]]` for nested routes. When the parent exists in the children array, it becomes a clickable link. Otherwise, it is a non-clickable label.

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes = [
    '/',
    ['/docs', ['/docs', '/docs/api', '/docs/guides']], // /docs is clickable (in children)
    ['/help', ['/help/faq', '/help/support']], // /help is a label (not in children)
    '/about',
  ]
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav {routes} {page} {link_props} />
```

**Features shown:**

- Dropdown with clickable parent (`/docs` appears in children array)
- Dropdown with non-clickable parent (`/help` not in children array)
- Mixed route formats (strings and tuples)

## Keyboard Navigation

- **Tab**: Follow page order; once focus enters a pinned submenu, cycle its links
- **Enter/Space**: Open dropdown or follow link
- **Arrow Down/Up**: Navigate dropdown items
- **Escape**: Close menus

## Object Route Format

For full control, use objects with all available properties:

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes = [
    { href: '/', label: 'Home' },
    { href: '/docs', children: ['/docs/api', '/docs/guides'] },
    { href: '/pricing' },
    { separator: true }, // standalone separator
    { href: '/admin', disabled: 'Login required' },
    { href: '/beta', disabled: true, separator: true }, // separator after disabled item
    { href: '/settings', align: 'right', tooltip: 'Configure your preferences' },
    { href: 'https://github.com', label: 'GitHub', external: true, align: 'right' },
  ]
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav {routes} {page} {link_props} />
```

**Features shown:**

- **Custom labels**: `label: 'Home'` overrides auto-generated label
- **Dropdowns**: `children` array creates nested menu
- **Standalone separator**: `{ separator: true }` with no href
- **Disabled with tooltip**: `disabled: 'Login required'` shows message on hover
- **Disabled boolean**: `disabled: true` grays out
- **Separator after item**: `separator: true` on a route object
- **Tooltip**: `tooltip: 'text'` shows on-hover tooltip
- **Right alignment**: `align: 'right'` pushes items to the right
- **External links**: `external: true` adds `target="_blank" rel="noopener noreferrer"`

### Route Object Properties

| Property    | Type                | Description                                                                |
| ----------- | ------------------- | -------------------------------------------------------------------------- |
| `href`      | `string`            | Required (except separator-only). The URL                                  |
| `label`     | `string`            | Custom label (default: derived from href)                                  |
| `children`  | `string[]`          | Sub-routes for dropdown menu                                               |
| `disabled`  | `boolean \| string` | Disable item; string shows as tooltip                                      |
| `separator` | `boolean`           | Render visual divider after this item                                      |
| `align`     | `'left' \| 'right'` | Item alignment (default: left)                                             |
| `external`  | `boolean`           | Opens in new tab with `rel="noopener noreferrer"` for [security][noopener] |
| `tooltip`   | `string`            | On-hover tooltip text                                                      |
| `class`     | `string`            | Custom CSS class                                                           |
| `style`     | `string`            | Custom inline styles                                                       |

[noopener]: https://mathiasbynens.github.io/rel-noopener/

## Snippets

### Custom Link Rendering

Use the `link` snippet to customize how all links render:

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes = ['/', '/about', '/contact']
</script>

<Nav {routes} {page}>
  {#snippet link({ href, label, isActive })}
    <a
      {href}
      style:font-weight={isActive ? `bold` : `normal`}
      onclick={(event: MouseEvent) => event.preventDefault()}>🔗 {label}</a
    >
  {/snippet}
</Nav>
```

### Custom Children

Add extra content to the nav menu via `children` snippet:

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes = ['/', '/about', '/blog']
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav {routes} {page} {link_props}>
  {#snippet children({ is_open })}
    <button
      style="padding: 4pt 12pt; background: var(--sms-selected-bg, mediumseagreen); border: none; border-radius: 6px; color: white; cursor: pointer"
      onclick={() => alert('Custom action!')}
    >
      ⚡ Action
    </button>
    {#if is_open}
      <span style="opacity: 0.6; font-size: 0.85em">(menu open)</span>
    {/if}
  {/snippet}
</Nav>
```

**Features shown:**

- Custom button in nav
- Access to `is_open` state (visible when burger menu is open on mobile)

### Item Snippet with Custom Properties

Use `item` snippet for per-item customization. The `render_default` escape hatch renders the default link:

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/docs', label: 'Docs', icon: '📚' },
    { href: '/settings', label: 'Settings', icon: '⚙️', align: 'right' },
  ]
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
</script>

<Nav {routes} {page} {link_props}>
  {#snippet item({ route, render_default })}
    <span style="display: flex; align-items: center; gap: 0.3em">
      {#if route.icon}
        <span>{route.icon}</span>
      {/if}
      {@render render_default()}
    </span>
  {/snippet}
</Nav>
```

**Features shown:**

- Custom `icon` property on route objects (any extra props are allowed)
- `render_default()` renders the standard link/span
- Right-aligned item with icon

## Callbacks

Handle navigation events with `onnavigate`, `onopen`, and `onclose`:

```svelte example collapsible
<script lang="ts">
  import { Nav } from '$lib'
  import { page } from '$app/state'

  const routes = ['/', '/about', '/contact', '/blog']
  const link_props = { onclick: (event: MouseEvent) => event.preventDefault() }
  let nav_message = $state('')
  let menu_status = $state('closed')
</script>

<p>
  <strong>Last action:</strong>
  {nav_message || 'None'} | <strong>Menu:</strong>
  {menu_status}
</p>

<Nav
  {routes}
  {page}
  {link_props}
  onnavigate={({ href }) => {
    nav_message = `Navigated to ${href}`
    return false // returning false prevents navigation
  }}
  onopen={() => (menu_status = 'open')}
  onclose={() => (menu_status = 'closed')}
/>
```

**Features shown:**

- `onnavigate` callback with `{ href, event, route }` - return `false` to prevent navigation
- `onopen`/`onclose` callbacks fire when burger menu toggles (resize window to test)

## Custom Breakpoint

Control when mobile burger menu appears with the `breakpoint` prop (default: 767):

```svelte
<!-- Always show mobile menu -->
<Nav {routes} breakpoint={9999} />

<!-- Never show mobile menu -->
<Nav {routes} breakpoint={0} />

<!-- Custom breakpoint -->
<Nav {routes} breakpoint={1024} />
```

## Styling

Customize via CSS variables:

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

Style the mobile toggle with `burger_props` (sibling of `link_props` / `menu_props`); host `style` does not reach the burger button. Its `aria-label` can be customized and `onclick` chains with the open/close toggle, while component-owned `type`, `aria-expanded` and `aria-controls` stay intact.
