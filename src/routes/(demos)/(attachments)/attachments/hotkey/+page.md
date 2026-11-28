## `hotkey`

Declarative keybindings over the same matcher `CommandMenu` uses. `mod` is Cmd on Apple keyboards and Ctrl elsewhere. Bare keys stay out of the way while you type in a field; chords always fire.

```svelte example id="attachments-hotkey"
<script lang="ts">
  import { hotkey } from 'svelte-widgets/attachments'

  let log = $state<string[]>([])
  const record = (label: string) => (log = [label, ...log].slice(0, 5))
</script>

<input
  placeholder="mod+b works here, ? does not, Enter does"
  {@attach hotkey({
    global: true,
    bindings: [
      { keys: `mod+b`, handler: () => record(`bold`) },
      { keys: [`?`, `shift+/`], handler: () => record(`help`) },
      { keys: `Enter`, handler: () => record(`submit`), allow_in_inputs: true },
    ],
  })}
/>
<ol style="margin: 6pt 0 0">
  {#each log as entry, idx (idx)}<li>{entry}</li>{/each}
</ol>
```

Bindings listen on the attached node by default, so a shortcut dies with the surface that owns it; `global: true` listens on the document. Each binding also takes `disabled`, and `prevent_default` (default `true`).
