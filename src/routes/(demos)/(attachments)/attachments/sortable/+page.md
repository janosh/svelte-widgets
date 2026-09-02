## `sortable`

```svelte example id="attachments-sortable"
<script lang="ts">
  import { sortable } from '$lib/attachments'

  const planets = [
    { planet: `Mercury`, moons: 0, discovery: `ancient`, notes: `` },
    { planet: `Venus`, moons: 0, discovery: `ancient`, notes: `Very bright` },
    { planet: `Earth`, moons: 1, discovery: `ancient`, notes: `Leads with zeros` },
    { planet: `Mars`, moons: 2, discovery: `1610`, notes: `Phobos/Deimos` },
    { planet: `Jupiter`, moons: 95, discovery: `1610`, notes: `Gas giant` },
  ]
</script>

<!-- four columns do not fit a phone; scroll the table in its own box rather than the page -->
<div style="overflow-x: auto">
  <table {@attach sortable()} class="demo-table">
    <thead>
      <tr>
        <th>Planet</th>
        <th>Moons</th>
        <th>Discovery</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      {#each planets as { planet, moons, discovery, notes }}
        <tr>
          <td>{planet}</td>
          <td>{moons}</td>
          <td>{discovery}</td>
          <td>{notes}</td>
        </tr>
      {/each}
    </tbody>
    <caption style="caption-side: bottom; padding-top: 0.5em">
      Click headers to sort; click again to reverse
    </caption>
  </table>
</div>

<style>
  .demo-table {
    width: 100%;
  }
  .demo-table :is(th, td) {
    padding: 0.4em 0.6em;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  thead th:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  tbody tr:nth-child(odd) {
    background: rgba(255, 255, 255, 0.04);
  }
  tbody tr:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
```
