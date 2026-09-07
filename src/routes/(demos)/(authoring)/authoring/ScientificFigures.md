<script>
  import 'katex/dist/katex.min.css'
</script>

## Figure and equation navigation

The sidebar separates figures and equations, preserving document order within each section. Optional `label="…"` metadata gives each entry a short title without changing its caption or number. Mass–energy equivalence, $E = mc^2$, appears in [@eq:mass-energy]. Repeating [@eq:mass-energy] still produces one navigation entry.

![Two interacting particles](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='240'%20height='80'%20viewBox='0%200%20240%2080'%3E%3Cpath%20d='M60%2040H180'%20stroke='gray'/%3E%3Ccircle%20cx='60'%20cy='40'%20r='20'%20fill='steelblue'/%3E%3Ccircle%20cx='180'%20cy='40'%20r='20'%20fill='coral'/%3E%3C/svg%3E){#fig:particles label="Particle interaction"}

$$ {#eq:mass-energy label="Mass–energy equivalence"}
E = mc^2
$$

For a spring, Hooke's law $F = -kx$ relates restoring force to displacement, as shown in [@eq:hooke].

![Spring displacement](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='240'%20height='80'%20viewBox='0%200%20240%2080'%3E%3Cpath%20d='M30%2015V65M30%2040H50L60%2025L80%2055L100%2025L120%2055L130%2040H180'%20stroke='steelblue'%20stroke-width='3'%20fill='none'/%3E%3Crect%20x='180'%20y='20'%20width='40'%20height='40'%20rx='4'%20fill='coral'/%3E%3C/svg%3E){#fig:spring label="Spring model"}

$$ {#eq:hooke label="Hooke's law"}
F = -kx
$$

<style>
  .equation {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1em;
    align-items: center;
  }
</style>
