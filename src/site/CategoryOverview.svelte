<script lang="ts">
  import { SubpageGrid } from 'svelte-widgets'
  import { demo_nav_routes } from '../routes/(demos)'
  import { demo_card } from './paths'

  let { name }: { name: string } = $props()
  const category = $derived.by(() => {
    const match = demo_nav_routes.find((entry) => entry.name === name)
    if (!match) throw new Error(`Unknown demo category: ${name}`)
    return match
  })
</script>

<SubpageGrid
  title={category.label}
  subtitle={category.description}
  subpages={category.children.filter((route) => route !== category.href).map(demo_card)}
/>
