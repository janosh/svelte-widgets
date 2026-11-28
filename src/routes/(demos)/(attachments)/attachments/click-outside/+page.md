## `click_outside`

```svelte example id="attachments-click-outside"
<script lang="ts">
  import { click_outside, tooltip } from 'svelte-widgets/attachments'

  let open_menu = $state(false)
</script>

<div class="menu">
  <button
    class="toggle"
    onclick={() => (open_menu = !open_menu)}
    {@attach tooltip({ content: 'Toggle menu', placement: 'top' })}
  >
    Menu
  </button>

  {#if open_menu}
    <ul
      class="dropdown"
      style="list-style: none; margin: 0"
      {@attach click_outside({
        inside: ['.toggle'],
        escape: true,
        callback: () => (open_menu = false),
      })}
    >
      <li><a href="#one">First</a></li>
      <li><a href="#two">Second</a></li>
      <li>
        <a href="#noop" class="toggle">Clicking me won’t close (counts as inside)</a>
      </li>
    </ul>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: inline-block;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    min-width: 12rem;
    z-index: 2;
  }
  .dropdown a {
    color: var(--text-color);
    text-decoration: none;
    display: block;
    padding: 0.2rem 0;
  }
  .dropdown a:hover {
    text-decoration: underline;
  }
</style>
```

Dismissal happens on `pointerdown`, not `click`, so a right-click or a press the OS turns into a window drag still closes the surface. Presses in a scrollbar gutter are ignored, so reaching for the scrollbar does not close what you are scrolling toward. `dismiss_on: 'release'` waits for the click instead: a pan started behind a surface floating over draggable content no longer closes it, a right-click leaves it open, and an outside `<input type="checkbox" bind:checked={open}>` can close it (dismissing on the press writes `checked=false` before the click's pre-click activation flips it back, reopening the surface). Both modes listen in the capture phase, ahead of the pressed element's own handlers, so put in `inside` any control that toggles the surface from its own click handler, and any outside trigger that opens on `pointerdown` (under `release` its own click would dismiss it).

`inside` lists regions outside the node that count as inside: elements for portalled content, selectors for triggers. `scope` confines the selector entries to one subtree when several instances of a component share trigger selectors, and `escape: true` also dismisses on Escape. Escape dismisses only the most recently attached surface, so a dropdown inside a modal closes the dropdown and leaves the modal standing.

`callback` receives `(node, config, detail)` and the node also fires a `dismiss` event carrying the same `detail` of `{ focus_inside, via, event }`. `focus_inside` tells an Escape handler whether to move focus back to the trigger; `event` is the press or keydown behind the dismissal. `disabled: true` registers nothing.
