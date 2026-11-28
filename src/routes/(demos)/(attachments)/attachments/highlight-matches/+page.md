## `highlight_matches`

```svelte example id="attachments-highlight"
<script lang="ts">
  import { highlight_matches } from 'svelte-widgets/attachments'

  let search_text = $state('')
  let disabled = $state(false)

  // Only highlight inside .target; skip any node inside .no-hl
  const node_filter = (node: Node): number =>
    node.parentElement?.closest('.no-hl')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT
</script>

<div style="display: inline-flex; gap: 0.6em; align-items: center">
  <label for="highlight-search">Search</label>
  <input
    id="highlight-search"
    placeholder="type to highlight..."
    bind:value={search_text}
    style="min-width: 16ch"
  />
  <input id="toggle-disabled" type="checkbox" bind:checked={disabled} />
  <label for="toggle-disabled">disabled</label>
</div>

<article
  class="target"
  {@attach highlight_matches({
    query: search_text.toLowerCase(),
    disabled,
    node_filter,
    scroll_to_match: false,
  })}
>
  <p>
    This paragraph highlights matches inside text and inline elements. Try words like
    <em>ancient</em> or <strong>giant</strong>.
  </p>
  <p class="no-hl" style="opacity: 0.7">This line is excluded via node_filter.</p>
</article>

<style>
  /* Style the CSS Highlight API range */
  ::highlight(highlight-match) {
    background: rgba(255, 230, 0, 0.35);
    outline: 1px solid rgba(255, 230, 0, 0.8);
  }
  .target {
    margin: 0.75rem 0;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
  }
</style>
```

Matching folds case, Unicode normalization and whitespace and spans inline markup; `fuzzy: true` highlights a subsequence match character by character instead. `css_class` (default `highlight-match`) names the `::highlight()` rule, `duration_ms` removes matches after a delay, and `scroll_to_match` scrolls the first match smoothly to the center by default (`false` keeps the viewport fixed, or pass your own `ScrollIntoViewOptions`). `on_highlight({ node, ranges })` runs after every pass, also without the CSS Highlight API. Highlights rerun when the subtree changes; `observe_mutations: false` freezes what the DOM held on attach, and `{ debounce_ms, max_wait_ms }` coalesces bursts.
