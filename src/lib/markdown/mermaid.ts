// Client-side Mermaid rendering for `<pre class="mermaid">` blocks that
// `create_markdown({ mermaid: true })` emits. Mermaid is an optional peer, imported on
// the first diagram, so pages without diagrams never load it.
import type { MermaidConfig } from 'mermaid'
import type { Attachment } from 'svelte/attachments'
import { is_dark_mode, watch_theme_changes } from '../theme-core'

// Mermaid's own config (its MermaidConfig, minus startOnLoad), declared structurally so the
// published types don't need the optional `mermaid` package installed
export type MermaidDiagramConfig = { theme?: string; [option: string]: unknown }

export const MERMAID_SELECTOR = `pre.mermaid`
// Authored source per block, so theme changes re-render from it rather than from the SVG
const sources = new WeakMap<Element, string>()
// mermaid.initialize() is global, so renders run one at a time with their own theme
let queue: Promise<void> = Promise.resolve()
let render_count = 0

// Render every block in `root` (or `root` itself) not yet rendered with the current theme.
// An explicit `config.theme` disables following the page's light/dark scheme.
// Resolves after rendering; a failing diagram keeps its source and records the error.
export function render_mermaid(
  root: HTMLElement,
  config: MermaidDiagramConfig = {},
): Promise<void> {
  const run = async () => {
    // the scheme `root` renders in (apply_theme_mode sets the root's inline, custom themes such
    // as a `black` one declare it in CSS, a panel may nest its own), else the OS preference
    const theme = config.theme ?? (is_dark_mode(root) ? `dark` : `default`)
    const blocks = [
      ...(root.matches(MERMAID_SELECTOR) ? [root] : []),
      ...root.querySelectorAll<HTMLElement>(MERMAID_SELECTOR),
    ].filter((block) => block.isConnected && block.dataset.mermaidTheme !== theme)
    if (!blocks.length) return
    const { default: mermaid } = await import('mermaid')
    // hosts pass Mermaid's own options, which mermaid validates itself
    mermaid.initialize({ ...config, theme, startOnLoad: false } as MermaidConfig)
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

// Attachment factory for a `<pre class="mermaid">` or any container of them, such as an
// element holding `{@html}` from render_markdown(). Renders blocks added later and
// re-renders when the scheme it renders in may have changed (see watch_theme_changes).
export const mermaid_diagrams =
  (config: MermaidDiagramConfig = {}): Attachment<HTMLElement> =>
  (node) => {
    const render = () => void render_mermaid(node, config)
    render()
    // Own SVG writes also trigger this; blocks already rendered with the theme are skipped
    const observer = new MutationObserver(render)
    observer.observe(node, { childList: true, subtree: true })
    const stop_theme = watch_theme_changes(node, render)
    return () => {
      stop_theme()
      observer.disconnect()
    }
  }
