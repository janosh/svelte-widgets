# Live Markdown hot reload

Increment the counter below. When running `npx vp dev`, edit this paragraph in `src/routes/(demos)/(authoring)/authoring/hot-reload/+page.md` and save. The prose updates while the counter keeps its value.

```svelte example id="persistent-counter"
<script>
  let count = $state(0)
</script>

<button onclick={() => count++}>Count: {count}</button>
```

The example has an explicit `id`, so its module identity survives edits around it. Ordinary headings, paragraphs, and code fences are isolated during development. Changes to frontmatter, page scripts, or the arrangement of live examples can replace the parent and reset state. Pages with scoped styles keep their original component tree.

[Return to the interactive authoring labs](/authoring#incremental-compilation).
