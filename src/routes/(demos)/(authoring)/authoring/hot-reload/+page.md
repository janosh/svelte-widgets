---
title: Live Markdown hot reload
description: Runnable Svelte examples with ordinary hot reload.
categories: [Markdown, Authoring]
---

# Live Markdown hot reload

Increment the counter below. When running `npx vp dev`, edit this paragraph in `src/routes/(demos)/(authoring)/authoring/hot-reload/+page.md` and save. The page updates automatically; edits may reset the counter.

```svelte example id="counter"
<script>
  let count = $state(0)
</script>

<button onclick={() => count++}>Count: {count}</button>
```

The explicit `id` keeps the example's module identity stable across edits. The page still uses ordinary Svelte hot reload, which may recreate the example.

[Return to the interactive authoring labs](../authoring#incremental-compilation).
