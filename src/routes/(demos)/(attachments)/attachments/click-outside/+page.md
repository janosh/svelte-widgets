## `click_outside`

```svelte example id="attachments-click-outside"
<script lang="ts">
  import { click_outside, tooltip } from '$lib/attachments'

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

Dismissal happens on `pointerdown`, not `click`, so a right-click or a press the OS
turns into a window drag still closes the surface. Presses that land in a scrollbar
gutter are ignored, so reaching for the scrollbar does not close what you are
scrolling toward. A surface floating over something draggable can pass
`dismiss_on: 'release'` to wait for the click instead, so starting a pan behind it
does not make it vanish mid-drag, and a right-click leaves it standing. `release` is
also what lets an outside `<input type="checkbox" bind:checked={open}>` close the
surface: dismissing on the press writes `checked=false` back to the DOM before the
click, whose pre-click activation flips it to true again for the binding to commit,
reopening what the user just closed. Both modes dismiss from the capture phase, ahead of
the pressed element's own handlers, so a control that toggles the surface from its own
click handler belongs in `inside` — as does an outside trigger that opens on
`pointerdown`, whose own click would otherwise dismiss under `release`.

Pass `inside` for regions that count as inside though they sit outside the node:
elements for portalled content the node no longer contains, selectors for triggers.
`scope` confines the selector entries to one subtree when several instances of a
component share trigger selectors, and `escape: true` also dismisses on Escape. Escape
dismisses one surface at a time — the most recently attached one — so a dropdown
inside a modal closes the dropdown and leaves the modal standing.

`callback` receives `(node, config, detail)` and the node also fires a `dismiss`
event carrying the same `detail` of `{ focus_inside, via, event }`. `focus_inside`
tells an Escape handler whether to move focus back to the trigger, and `event` is the
press or keydown behind the dismissal, to forward to your own close handler.
