## `forward_window_keydown`

`forward_window_keydown` sends page-level keys to the viewer under the pointer while focus is on the page or the viewer root, but leaves keys with focused descendant controls.

```svelte example id="attachments-forward-window-keydown"
<script lang="ts">
  import { forward_window_keydown } from '$lib/attachments'

  let last_key = $state(`none`)
</script>

<div
  tabindex="-1"
  style="padding: 1rem; border: 1px solid currentColor"
  {@attach forward_window_keydown({
    handle: (event) => {
      if (!event.key.startsWith(`Arrow`)) return false
      last_key = event.key
      return true
    },
  })}
>
  Hover here, leave focus on the page and press an arrow key. Last key: {last_key}
</div>
```
