## `focus_trap`

Keeps Tab inside a surface and hands the keyboard back when it closes — the other half of what `click_outside` starts. Nested traps stack like Escape layers: only the innermost one steers Tab. Use it for non-native surfaces; a modal `<dialog>` opened with `showModal()` already gets browser-owned focus containment.

```svelte example id="attachments-focus-trap"
<script lang="ts">
  import { click_outside, focus_trap } from '$lib/attachments'

  let open = $state(false)
  let trigger = $state<HTMLButtonElement | null>(null)
</script>

<button bind:this={trigger} onclick={() => (open = true)}>Open panel</button>

{#if open}
  <div
    role="dialog"
    aria-label="Trapped panel"
    style="display: grid; gap: 6pt; max-width: 20em; margin-top: 1ex; padding: 1ex 1em; border: 1px solid gray; border-radius: 5pt"
    {@attach focus_trap({ restore: trigger })}
    {@attach click_outside({ escape: true, callback: () => (open = false) })}
  >
    <input placeholder="Tab cycles between these" />
    <input placeholder="…and never leaves the panel" />
    <button onclick={() => (open = false)}>Close</button>
  </div>
{/if}
```

`initial` picks the entry point (an element, a selector, or `false` to leave focus
alone) and `restore` the exit point, defaulting to whatever held focus when the trap
went up. `include` extends the trap over portalled parts of the same surface.

Open shadow roots participate in the trap; closed roots need their own trap or a focusable host.

`root` narrows the trap to a descendant, for a node that wraps the surface together with siblings Tab must not reach — a layered surface's backdrop button, for example. Element, selector or function returning either, resolved per keystroke like `click_outside`'s `scope`, so a selector matches markup rendered after setup and a function covers a `bind:this` still null then; `initial` resolves within it. `on_escape` joins the layer stack `click_outside` uses, so only the innermost trap hears and cancels the key. `recapture` pulls focus back to where it last sat inside whenever something outside takes it. All three are off unless asked for: the attached node is the trap and Escape passes through untouched.

```svelte
<div
  class="dialog-layer"
  {@attach focus_trap({ root: `.dialog`, on_escape: on_close, recapture: true })}
>
  <button class="dialog-backdrop" onclick={on_close}></button>
  <section class="dialog" role="dialog" aria-modal="true">…</section>
</div>
```
