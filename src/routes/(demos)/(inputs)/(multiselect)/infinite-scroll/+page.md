## Dynamic Options Loading

For large datasets or server-side data, use `load_options` to dynamically load options as the user scrolls and searches. The component handles all state management, debouncing, and pagination automatically. Requested in [GitHub discussion #342](https://github.com/janosh/svelte-widgets/discussions/342).

### Basic Example

This runnable example filters an in-memory dataset with a simulated network delay. Enable **Fail the next request**, then search to try the built-in Retry button. Search for `no match` to see the empty-results state.

```svelte example id="load-basic"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { LoadOptionsParams, LoadOptionsResult } from 'svelte-widgets'

  let fail_next = $state(false)

  // stands in for a database/API
  const all_items: string[] = Array.from({ length: 10000 }, (_, idx) => `Item ${idx + 1}`)

  async function load_options(
    params: LoadOptionsParams,
  ): Promise<LoadOptionsResult<string>> {
    const { search, offset, limit, signal } = params
    // simulated network delay
    await new Promise((resolve) => setTimeout(resolve, 300))
    signal?.throwIfAborted()

    if (fail_next) {
      fail_next = false
      throw new Error(`Simulated network failure`)
    }
    const filtered = search
      ? all_items.filter((item) => item.toLowerCase().includes(search.toLowerCase()))
      : all_items

    const options = filtered.slice(offset, offset + limit)
    const has_more = offset + limit < filtered.length
    return { options, has_more }
  }
</script>

<label><input type="checkbox" bind:checked={fail_next} /> Fail the next request</label>
<MultiSelect {load_options} placeholder="Search 10,000 items..." />
```

The component handles the required state management:

- Loading initial options when dropdown opens
- Loading more as user scrolls
- Debounced search with automatic reset
- Canceling superseded requests through `signal`
- Loading indicators and a Retry button after failures; previously loaded options remain available

### Simulated User API

This runnable example searches an in-memory user list; it does not contact a server. Use the REST recipe below to connect your own backend:

```svelte example id="load-api"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { LoadOptionsParams, LoadOptionsResult, ObjectOption } from 'svelte-widgets'

  interface User extends ObjectOption {
    email: string
    id: number
  }

  // Simulated API
  async function fetch_users({
    search,
    offset,
    limit,
    signal,
  }: LoadOptionsParams): Promise<LoadOptionsResult<User>> {
    await new Promise((resolve) => setTimeout(resolve, 400))
    signal?.throwIfAborted()

    // Simulated database
    const all_users: User[] = Array.from({ length: 2000 }, (_, idx) => ({
      label: `User ${idx + 1}`,
      email: `user${idx + 1}@example.com`,
      id: idx + 1,
    }))

    const filtered = search
      ? all_users.filter(
          (user) =>
            user.label.toLowerCase().includes(search.toLowerCase()) ||
            user.email.toLowerCase().includes(search.toLowerCase()),
        )
      : all_users

    return {
      options: filtered.slice(offset, offset + limit),
      has_more: offset + limit < filtered.length,
    }
  }
</script>

<MultiSelect load_options={fetch_users} placeholder="Search users by name or email...">
  {#snippet children({ option })}
    <div>
      <strong>{option.label}</strong>
      <small style="opacity: 0.7; margin-left: 8px">{option.email}</small>
    </div>
  {/snippet}
</MultiSelect>
```

### REST API Recipe

This complete component expects your endpoint to return `{ items: string[], total: number }`. Adapt the endpoint and response type to your API. HTTP failures must throw: `fetch` resolves normally for responses such as 404 or 500.

```svelte
<script lang="ts">
  import {
    MultiSelect,
    type LoadOptionsParams,
    type LoadOptionsResult,
  } from 'svelte-widgets'

  async function load_options({
    search,
    offset,
    limit,
    signal,
  }: LoadOptionsParams): Promise<LoadOptionsResult<string>> {
    const query = new URLSearchParams({
      q: search,
      skip: String(offset),
      take: String(limit),
    })
    const response = await fetch(`/api/items?${query}`, { signal })
    if (!response.ok) throw new Error(`Loading items failed: HTTP ${response.status}`)
    const { items, total }: { items: string[]; total: number } = await response.json()
    return { options: items, has_more: offset + items.length < total }
  }
</script>

<MultiSelect {load_options} placeholder="Search remote items..." />
```

`URLSearchParams` preserves punctuation such as `&` and `#` within the search term. Forward `signal` so a new search, closing the dropdown, or unmounting cancels the old fetch. Let errors propagate so the component can show Retry; returning an empty array from a catch would hide the failure. A successful empty response is `{ items: [], total: 0 }` and shows the normal no-matches message without Retry.

### Configuration Options

For advanced control, pass an object with `fetch` function and config:

```svelte example id="load-config"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { LoadOptionsParams, LoadOptionsResult } from 'svelte-widgets'

  const all_items: string[] = Array.from({ length: 500 }, (_, idx) => `Option ${idx + 1}`)

  async function load_options(
    params: LoadOptionsParams,
  ): Promise<LoadOptionsResult<string>> {
    const { search, offset, limit, signal } = params
    await new Promise((resolve) => setTimeout(resolve, 200))
    signal?.throwIfAborted()

    const filtered = search
      ? all_items.filter((item) => item.toLowerCase().includes(search.toLowerCase()))
      : all_items

    return {
      options: filtered.slice(offset, offset + limit),
      has_more: offset + limit < filtered.length,
    }
  }
</script>

<MultiSelect
  load_options={{ fetch: load_options, debounce_ms: 500, batch_size: 20 }}
  placeholder="Custom config (500ms debounce, 20 items per batch)"
/>
```

### Object Options with Custom Display

Use object options with custom snippets:

```svelte example id="load-objects"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { LoadOptionsParams, LoadOptionsResult, ObjectOption } from 'svelte-widgets'

  interface Language extends ObjectOption {
    year: number
  }

  const all_languages: Language[] = [
    { label: `JavaScript`, year: 1995 },
    { label: `TypeScript`, year: 2012 },
    { label: `Python`, year: 1991 },
    { label: `Rust`, year: 2010 },
    { label: `Go`, year: 2009 },
    { label: `Java`, year: 1995 },
    { label: `C++`, year: 1985 },
    { label: `C#`, year: 2000 },
    { label: `Ruby`, year: 1995 },
    { label: `Swift`, year: 2014 },
  ]

  async function load_options(
    params: LoadOptionsParams,
  ): Promise<LoadOptionsResult<Language>> {
    const { search, offset, limit, signal } = params
    await new Promise((resolve) => setTimeout(resolve, 200))
    signal?.throwIfAborted()

    const filtered = search
      ? all_languages.filter((lang) =>
          lang.label.toLowerCase().includes(search.toLowerCase()),
        )
      : all_languages

    return {
      options: filtered.slice(offset, offset + limit),
      has_more: offset + limit < filtered.length,
    }
  }
</script>

<MultiSelect {load_options} placeholder="Search languages...">
  {#snippet children({ option })}
    <span>{option.label} <small style="opacity: 0.6">({option.year})</small></span>
  {/snippet}
</MultiSelect>
```

### Lazy Loading on Open

By default, options load when the dropdown opens. Set `on_open: false` to disable:

```svelte example id="load-lazy"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { LoadOptionsParams, LoadOptionsResult } from 'svelte-widgets'

  const items: string[] = Array.from({ length: 100 }, (_, idx) => `Item ${idx + 1}`)

  async function load_options(
    params: LoadOptionsParams,
  ): Promise<LoadOptionsResult<string>> {
    const { search, offset, limit, signal } = params
    await new Promise((resolve) => setTimeout(resolve, 300))
    signal?.throwIfAborted()
    const filtered = search
      ? items.filter((item) => item.toLowerCase().includes(search.toLowerCase()))
      : items
    return {
      options: filtered.slice(offset, offset + limit),
      has_more: offset + limit < filtered.length,
    }
  }

  let selected: string[] = $state([])
</script>

<MultiSelect
  load_options={{ fetch: load_options, on_open: false }}
  bind:value={selected}
  placeholder="Type to search (won't load on open)..."
/>

<p>Selected: {selected.join(`, `) || `none`}</p>
```

## Props Reference

The `load_options` prop accepts either a function (simple) or an object (with config):

```typescript
// Function shorthand
load_options={myFetchFn}

// With config: object with fetch + options
load_options={{ fetch: myFetchFn, debounce_ms: 500, batch_size: 20, on_open: false }}
```

| Config Key    | Type      | Default | Description                                 |
| ------------- | --------- | ------- | ------------------------------------------- |
| `fetch`       | `fn`      | —       | Async function to load options (required)   |
| `debounce_ms` | `number`  | `300`   | Debounce delay for search queries           |
| `batch_size`  | `number`  | `50`    | Number of options to load per batch         |
| `on_open`     | `boolean` | `true`  | Whether to load options when dropdown opens |

### LoadOptions Parameters

```typescript
interface LoadOptionsParams {
  search: string // Current search text
  offset: number // Number of options already loaded (for pagination)
  limit: number // Batch size to load
  signal?: AbortSignal // Aborted when a request is superseded or closed
}

interface LoadOptionsResult<T> {
  options: T[] // Array of options to add
  has_more: boolean // Whether more options are available
  replace?: boolean // Replace loaded options with this ordered snapshot
  error?: Error // Show partial results alongside Retry
}
```

### Cursor-based pagination

For cursor APIs, keep the next cursor in a closure. An `offset` of `0` starts a fresh search or a reopened dropdown. This example expects `{ items: string[], next_cursor: string | null }`, where `null` means the last page.

```ts
import type { LoadOptionsParams, LoadOptionsResult } from 'svelte-widgets'

function make_load_options() {
  let cursor: string | null = null

  return async ({
    search,
    offset,
    limit,
    signal,
  }: LoadOptionsParams): Promise<LoadOptionsResult<string>> => {
    if (offset === 0) cursor = null
    const params = new URLSearchParams({ q: search, limit: String(limit) })
    if (cursor !== null) params.set(`cursor`, cursor)
    const response = await fetch(`/api/items?${params}`, { signal })
    if (!response.ok) throw new Error(`Loading items failed: HTTP ${response.status}`)
    const { items, next_cursor }: { items: string[]; next_cursor: string | null } =
      await response.json()
    // Check after the final await before updating shared pagination state.
    signal?.throwIfAborted()
    cursor = next_cursor
    return { options: items, has_more: next_cursor !== null }
  }
}
```

The component aborts superseded requests. Checking the signal after parsing prevents a late response from overwriting the current search's cursor, even if the request transport ignored cancellation. Failed requests leave the cursor unchanged, so Retry requests the same page. Each non-final cursor page must contain options: an empty batch stops automatic pagination to avoid a request loop.

Create one loader per MultiSelect instance and pass the same reference; changing the `fetch` identity resets the loaded batch:

```svelte
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  // Define make_load_options from the recipe above in this script.
  const load_options = make_load_options()
</script>

<MultiSelect {load_options} />
```

### Error Handling

If `load_options` throws or rejects, the component displays an error and a Retry button while keeping previously loaded options available. Retry repeats the failed request; changing the search starts a new request.

For partial failures, return successful `options` with `error`. Retry passes the number of loaded options as `offset`, so retain failed items in the loader and retry those downloads. Return `replace: true` with the full ordered result snapshot to restore their original positions without appending duplicates. Retry remains available even when `has_more` is `false`.
