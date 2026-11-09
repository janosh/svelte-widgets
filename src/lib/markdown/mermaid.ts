// Client-side Mermaid rendering for `<pre class="mermaid">` blocks that
// `create_markdown({ mermaid: true })` emits. Mermaid is an optional peer, imported on
// the first diagram, so pages without diagrams never load it.
import type { MermaidConfig } from 'mermaid'
import type { Attachment } from 'svelte/attachments'

export type MermaidDiagramConfig = Omit<MermaidConfig, 'startOnLoad'>

export const MERMAID_SELECTOR = `pre.mermaid`
let config: MermaidDiagramConfig = {}
// Authored source per block, so theme changes re-render from it rather than from the SVG
const sources = new WeakMap<Element, string>()
// mermaid.initialize() is global, so renders run one at a time with their own theme
let queue: Promise<void> = Promise.resolve()
let render_count = 0

// Applies to diagrams rendered afterwards, e.g. from SvelteKit's client `init` hook.
// An explicit `theme` disables following the page's light/dark scheme.
export const configure_mermaid = (options: MermaidDiagramConfig): void => {
  config = { ...options }
}

// Mirrors apply_theme_mode from svelte-widgets/theme: an explicit root `data-theme`
// wins, anything else follows prefers-color-scheme.
const color_scheme = (): `light` | `dark` => {
  const { theme } = document.documentElement.dataset
  if (theme === `light` || theme === `dark`) return theme
  return matchMedia(`(prefers-color-scheme: dark)`).matches ? `dark` : `light`
}

const diagram_theme = (): NonNullable<MermaidConfig['theme']> =>
  config.theme ?? (color_scheme() === `dark` ? `dark` : `default`)

// Render every block in `root` (or `root` itself) not yet rendered with the current theme.
// Resolves after rendering; a failing diagram keeps its source and records the error.
export function render_mermaid(root: HTMLElement): Promise<void> {
  const run = async () => {
    const theme = diagram_theme()
    const blocks = [
      ...(root.matches(MERMAID_SELECTOR) ? [root] : []),
      ...root.querySelectorAll<HTMLElement>(MERMAID_SELECTOR),
    ].filter((block) => block.isConnected && block.dataset.mermaidTheme !== theme)
    if (!blocks.length) return
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ ...config, theme, startOnLoad: false })
    for (const block of blocks) {
      const source = sources.get(block) ?? block.textContent
      sources.set(block, source)
      try {
        const { svg, bindFunctions } = await mermaid.render(
          `widgets-mermaid-${++render_count}`,
          source,
        )
        block.innerHTML = svg
        bindFunctions?.(block)
        delete block.dataset.mermaidError
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        block.textContent = source
        block.dataset.mermaidError = message
        console.error(`Mermaid diagram failed to render: ${message}`, { source, error })
      }
      block.dataset.mermaidTheme = theme
    }
  }
  queue = queue.then(run)
  return queue
}

// Attach to a `<pre class="mermaid">` or any container of them, such as an element
// holding `{@html}` from render_markdown(). Renders blocks added later and re-renders
// when the root `data-theme` or the OS color scheme changes.
export const mermaid_diagrams: Attachment<HTMLElement> = (node) => {
  const render = () => void render_mermaid(node)
  render()
  const media = matchMedia(`(prefers-color-scheme: dark)`)
  media.addEventListener(`change`, render)
  const theme_observer = new MutationObserver(render)
  theme_observer.observe(document.documentElement, { attributeFilter: [`data-theme`] })
  // Own SVG writes also trigger this; blocks already rendered with the theme are skipped
  const content_observer = new MutationObserver(render)
  content_observer.observe(node, { childList: true, subtree: true })
  return () => {
    media.removeEventListener(`change`, render)
    theme_observer.disconnect()
    content_observer.disconnect()
  }
}
