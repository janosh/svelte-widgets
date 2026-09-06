---
title: Packaged Markdown
---

# {title}

| Feature | Works |
| ------- | ----- |
| GFM     | Yes   |

```svelte example
<script>
  let count = $state(0)
</script>

<button onclick={() => count++}>Count: {count}</button>

<style>
  button {
    color: rebeccapurple;
  }
</style>
```
