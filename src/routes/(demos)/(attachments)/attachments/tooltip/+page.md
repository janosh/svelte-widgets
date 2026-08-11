<script lang="ts">
  import { resolve } from '$app/paths'

  const popover_url = resolve(`/popover`)
</script>

## `tooltip`

One recycled tooltip node serves the whole document, rendered in the browser's top layer through the Popover API with an absolutely positioned fallback where that is unavailable. The defaults follow intent rather than raw events: keyboard focus opens immediately, pointer hover waits 100 ms, the pointer may travel onto the tooltip without closing it, Escape dismisses, touch-generated hover is ignored, and moving to a nearby trigger within 300 ms skips the opening delay.

- Content: `content`, a per-trigger `content(trigger)`, or `render(content_el, trigger)` for custom DOM. With none of those, `title`, `aria-label`, then `data-title` are read. Attaching once to a container delegates to matching descendants; `delegate` takes a selector.
- Position: `placement` defaults to `auto`. `align`, `fallback_placements`, `offset`, `cross_axis_offset`, `viewport_padding`, `boundary`, `flip` and `shift` refine it, and the tooltip tracks scrolling, resizing and content changes.
- Interaction: `trigger`, `open_delay_ms`, `close_delay_ms` and `skip_delay_ms`; `open` with `on_open_change` for controlled or manual tooltips.
- Rendering: `wrap` is `balance`, `normal` or `nowrap`, `show_arrow` defaults to true, and `allow_html` opts into markup — pair it with `sanitize_html` for anything user-supplied.
- Styling: `style` for one-off declarations, or theme with `--tooltip-bg`, `--text-color`, `--tooltip-border`, `--tooltip-padding`, `--tooltip-radius`, `--tooltip-font-size`, `--tooltip-font-family`, `--tooltip-shadow`, `--tooltip-max-width`, `--tooltip-max-height`, `--tooltip-opacity`, `--tooltip-arrow-size`, `--tooltip-transition` and `--tooltip-z-index`.

### Placement

`auto` measures the free space on every side and takes the roomiest, so a trigger near the bottom of the window puts its tooltip above without being told to. Naming a side pins it, though the tooltip still slides along the viewport edge rather than overflowing — and the arrow keeps pointing at the trigger after that slide. `align` moves it along the trigger's cross axis, `offset` sets the gap, and `fallback_placements` restricts which sides `auto` may pick from.

```svelte example id="attachments-tooltip-placement"
<script lang="ts">
  import { tooltip } from '$lib/attachments'
  import type { Placement } from '$lib/utils'

  let placement = $state<Placement | `auto`>(`auto`)
  let align = $state<`start` | `center` | `end`>(`center`)
  let offset = $state(12)
  let scroll_boundary = $state<HTMLElement>()
</script>

<div style="display: flex; gap: 1em; align-items: end; flex-wrap: wrap">
  <label>
    placement
    <select bind:value={placement}>
      {#each [`auto`, `top`, `right`, `bottom`, `left`] as side (side)}
        <option>{side}</option>
      {/each}
    </select>
  </label>
  <label>
    align
    <select bind:value={align}>
      {#each [`start`, `center`, `end`] as mode (mode)}<option>{mode}</option>{/each}
    </select>
  </label>
  <label>
    offset
    <input type="number" min="0" max="40" bind:value={offset} style="width: 5em" />
  </label>
</div>

<div
  class="demo-box"
  style="display: grid; place-items: center; height: 9em; margin-top: 1em"
>
  <button
    {@attach tooltip({
      content: `placement: ${placement} · align: ${align}`,
      placement,
      align,
      offset,
    })}
  >
    Hover the target
  </button>
</div>

<!-- Scrolling leaves too little room below or above, so the default flip changes sides.
Padding leaves room to scroll both ways while keeping the button visible. -->
<div
  bind:this={scroll_boundary}
  class="demo-box"
  style="height: 9em; overflow: auto; margin-top: 1em"
>
  <div style="padding: 5em 0; display: grid; place-items: center">
    <button
      {@attach tooltip({
        content: `I flip as you scroll`,
        boundary: scroll_boundary,
        placement: `bottom`,
        trigger: `focus`,
      })}
    >
      Click, then scroll me past the edges
    </button>
  </div>
</div>
```

### Content sources

Attach `tooltip()` once to a container and every descendant carrying `title`, `aria-label` or `data-title` gets its own tooltip — including elements rendered later, since one delegated listener pair covers the whole subtree. The original `title` is stripped while the tooltip owns it, so the native yellow box never doubles up, and restored on teardown. `delegate` narrows delegation to a selector and `content(trigger)` derives the text per element.

```svelte example id="attachments-tooltip-content"
<script lang="ts">
  import { tooltip } from '$lib/attachments'

  const all_planets = [`Mercury`, `Venus`, `Earth`, `Mars`, `Jupiter`, `Saturn`]
  let shown = $state(3)
</script>

<!-- One attachment, three content sources, no per-button wiring -->
<div style="display: flex; gap: 1em; flex-wrap: wrap" {@attach tooltip()}>
  <button title="Read from the title attribute">title</button>
  <button aria-label="Read from aria-label">aria-label</button>
  <button data-title="Read from data-title">data-title</button>
</div>

<!-- A delegate selector plus content(trigger): rows added later are covered too -->
<div
  style="display: flex; gap: 1em; margin-top: 1em; flex-wrap: wrap; align-items: center"
  {@attach tooltip({
    delegate: `[data-planet]`,
    content: (trigger) => `Planet ${trigger.dataset.planet} of the solar system`,
  })}
>
  {#each all_planets.slice(0, shown) as planet, idx (planet)}
    <button data-planet={idx + 1}>{planet}</button>
  {/each}
  {#if shown < all_planets.length}
    <button onclick={() => (shown += 1)}>Add a planet</button>
  {/if}
</div>
```

### Rich and interactive content

`render(content_el, trigger)` receives the content element and may return a cleanup, so a tooltip can hold real DOM instead of a string. The surface accepts pointer events and stays open while the pointer is on it, so its text stays selectable. Keep that content non-interactive though: `role="tooltip"` sits outside the focus order, so a button or link inside is unreachable by keyboard — use <a href={popover_url}>Popover</a> when the surface needs controls. For a trusted HTML string `allow_html: true` is enough; pass untrusted input through `sanitize_html` first.

```svelte example id="attachments-tooltip-rich"
<script lang="ts">
  import { tooltip } from '$lib/attachments'
</script>

<div style="display: flex; gap: 1em; flex-wrap: wrap">
  <button
    {@attach tooltip({
      placement: `top`,
      render: (content_el, trigger) => {
        const heading = document.createElement(`strong`)
        heading.textContent = `Built with render()`
        content_el.append(heading, ` describing “${trigger.textContent?.trim()}”`)
        // content_el is emptied for you; cleanup is for what you touch outside it
        trigger.dataset.described = ``
        return () => delete trigger.dataset.described
      },
    })}
  >
    Rich tooltip
  </button>

  <button
    aria-label="More info"
    {@attach tooltip({
      // only enable allow_html for trusted or sanitized content, never raw
      // user input — HTML tooltips are an XSS vector otherwise
      content: `<strong>Bold</strong> and <em>italic</em> markup`,
      allow_html: true,
      placement: `right`,
    })}
  >
    allow_html
  </button>
</div>
```

### Interaction and controlled state

`trigger` picks `hover-focus` (the default), `hover`, `focus` or `manual`. `open_delay_ms` applies to pointer hover only — focus opens at once so keyboard users are never made to wait — while `skip_delay_ms` keeps that delay skipped when moving between neighbouring triggers. Passing `open` makes the tooltip controlled: the attachment stops opening on its own, reports every intent through `on_open_change`, and shows only what you hand back. Controlled tooltips are not modal — one surface serves the document, so hovering or focusing another trigger takes it over and the controlled consumer hears the close through `on_open_change`.

```svelte example id="attachments-tooltip-interaction"
<script lang="ts">
  import { tooltip } from '$lib/attachments'

  let [open_delay_ms, close_delay_ms] = $state([100, 100])
  let manual_open = $state(false)
  let last_reason = $state(`—`)
</script>

<div style="display: flex; gap: 1em; align-items: end; flex-wrap: wrap">
  <label>
    open_delay_ms
    <input type="number" min="0" step="50" bind:value={open_delay_ms} size="4" />
  </label>
  <label>
    close_delay_ms
    <input type="number" min="0" step="50" bind:value={close_delay_ms} size="4" />
  </label>
</div>

<div
  style="display: flex; gap: 1em; margin-top: 1em; flex-wrap: wrap; align-items: center"
>
  <button
    {@attach tooltip({
      content: `A pointer opens this, Tab does not`,
      trigger: `hover`,
      open_delay_ms,
      close_delay_ms,
    })}
  >
    hover only
  </button>
  <button {@attach tooltip({ content: `Tab here — no delay`, trigger: `focus` })}>
    focus only
  </button>
  <button onclick={() => (manual_open = !manual_open)}>
    {manual_open ? `Close` : `Open`} the manual one
  </button>
  <button
    {@attach tooltip({
      content: `Visible only while open is true`,
      trigger: `manual`,
      open: manual_open,
      on_open_change: (next, detail) => {
        last_reason = detail.reason
        manual_open = next
      },
    })}
  >
    manual target
  </button>
  <small>last reason: <code>{last_reason}</code></small>
</div>
```

### Styling

Every CSS variable is read off the trigger, so a tooltip can be themed by the element it belongs to rather than globally. `style` appends one-off declarations, and `show_arrow: false` drops the arrow and its border triangle.

```svelte example id="attachments-tooltip-styling"
<script lang="ts">
  import { tooltip } from '$lib/attachments'
</script>

<div style="display: flex; gap: 1em; flex-wrap: wrap">
  <button
    style="--tooltip-bg: #0f2a43; --text-color: #d7ecff; --tooltip-border: 1px solid rgba(0, 128, 255, 0.4); --tooltip-shadow: drop-shadow(0 4px 12px rgba(0, 128, 255, 0.25)); --tooltip-arrow-size: 8px"
    {@attach tooltip({ content: `Themed through CSS variables`, placement: `top` })}
  >
    Info theme
  </button>
  <button
    style="--tooltip-bg: #2d3748; --text-color: #e2e8f0; --tooltip-border: 2px solid #4299e1; --tooltip-arrow-size: 8px"
    {@attach tooltip({
      content: `A thick border gets its own arrow triangle behind the fill`,
      placement: `top`,
      style: `box-shadow: 0 10px 25px rgba(66, 153, 225, 0.3); font-weight: bold;`,
    })}
  >
    Border arrow
  </button>
  <button {@attach tooltip({ content: `No arrow on this one`, show_arrow: false })}>
    show_arrow: false
  </button>
  <button {@attach tooltip({ content: `Never rendered`, disabled: true })}>
    disabled
  </button>
</div>
```

### Wrapping and long words

Width resolves to `min(--tooltip-max-width, viewport − padding)`, so a tooltip can never be wider than the screen it sits on. `wrap` selects `balance` (the default, for even line lengths), `normal` or `nowrap`, and `overflow-wrap: anywhere` breaks a word that would otherwise push the box off screen.

```svelte example id="attachments-tooltip-wrapping"
<script lang="ts">
  import { tooltip } from '$lib/attachments'
</script>

<div style="display: flex; gap: 1em; flex-wrap: wrap">
  <button
    style="--tooltip-max-width: 200px"
    {@attach tooltip({
      content: `This tooltip uses balanced text wrapping for even line lengths`,
      placement: `top`,
      wrap: `balance`,
    })}
  >
    Balanced wrapping
  </button>
  <button
    {@attach tooltip({
      content: `This one never wraps, however far it runs`,
      placement: `top`,
      wrap: `nowrap`,
    })}
  >
    No wrapping
  </button>
  <button
    style="--tooltip-max-width: 220px"
    {@attach tooltip({
      content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`,
      placement: `bottom`,
    })}
  >
    Long text viewport-safe
  </button>
  <button
    {@attach tooltip({
      content: `Donaudampfschifffahrtsgesellschaftskapitän is a German compound word`,
      placement: `top`,
    })}
  >
    Long German word
  </button>
  <button
    {@attach tooltip({ content: `antidisestablishmentarianism`, placement: `left` })}
  >
    Single long word
  </button>
</div>
```

### Reactive content

A `MutationObserver` watches the trigger, so a tooltip already on screen re-renders and repositions when its `title`, `aria-label` or `data-title` changes — and when the trigger's own styling changes, the surface picks up the new theme with it.

```svelte example id="attachments-tooltip-reactive"
<script lang="ts">
  import { tooltip } from '$lib/attachments'
  let text = $state(`Edit me!`)
</script>

<input bind:value={text} style="width: 16ch" />
<button title={text} {@attach tooltip({ placement: `right` })}>Hover me</button>
```
