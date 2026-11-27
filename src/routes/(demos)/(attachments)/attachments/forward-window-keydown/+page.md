## `forward_window_keydown`

`forward_window_keydown` sends page-level keys to the viewer under the pointer while focus is on the page or the viewer root, but leaves keys with focused descendant controls.

```svelte example id="attachments-forward-window-keydown"
<script lang="ts">
  import { forward_window_keydown } from 'svelte-widgets/attachments'

  let last_key = $state(`none`)
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable so it receives arrow keys) -->
<div
  tabindex="0"
  style="padding: 1rem; border: 1px solid currentColor"
  {@attach forward_window_keydown({
    handle: (event) => {
      if (!event.key.startsWith(`Arrow`)) return false
      last_key = event.key
      return true
    },
  })}
>
  Hover here, focus this box and press an arrow key. Last key: {last_key}
</div>
```

`viewer_keys(() => ({ r: reset, Escape: close }))` builds on it for plain-key shortcuts: keys reach the viewer under the pointer or holding focus, chords stay the browser's (Cmd/Ctrl+R reloads), typing and autorepeat are ignored, letters are bound lowercase and also fire under Caps Lock, but Shift+letter is a different shortcut, and an action returning `false` leaves the key to the page. `viewer_keydown(handle, hover_handle?)` is the general form, taking any keydown handler.
