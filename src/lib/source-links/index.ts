// Link exact, unambiguous source names in code spans to files or exported definitions.
// `virtual:source-symbols` supplies locations pinned to the build commit.

import { merge_defaults, SOURCE_LINKS_LABELS, type SourceLinksLabels } from '../labels'

export type SourceSymbols = {
  repo: string // repository URL, e.g. https://github.com/janosh/svelte-widgets
  ref: string // commit the site was built from (`main` when built outside git)
  files: string[] // repo-relative source paths, e.g. /src/lib/Footer.svelte
  symbols: Record<string, string> // exported name -> `/path.ts#L12`
}

export type SourceLinks = {
  // repo path (with `#Lline` for definitions) behind `name`, undefined when unknown or ambiguous
  source_location: (name: string) => string | undefined
  source_href: (name: string) => string | undefined
  // Svelte attachment: links every matching <code> under `root`, now and as content arrives
  link_source_mentions: (root: HTMLElement) => () => void
}

// marks our own anchors and records the code-span text each was built from, so a later
// scan can tell a stale link from a current one
const OWN_LINK_ATTR = `data-source-link`

export function create_source_links(
  { repo, ref, files, symbols }: SourceSymbols,
  labels?: Partial<SourceLinksLabels>,
): SourceLinks {
  const msg = merge_defaults(SOURCE_LINKS_LABELS, labels)
  // name -> repo path, or null once two files claim the name
  const location_by_name = new Map<string, string | null>()
  const register = (name: string, location: string): void => {
    location_by_name.set(name, location_by_name.has(name) ? null : location)
  }
  for (const path of files) {
    const basename = path.split(`/`).pop() ?? path
    register(basename, path)
    // Components are referred to by bare name far more often than by file name
    if (basename.endsWith(`.svelte`)) register(basename.slice(0, -`.svelte`.length), path)
  }
  for (const [name, location] of Object.entries(symbols)) {
    if (!location_by_name.has(name)) location_by_name.set(name, location)
  }

  const source_location = (name: string): string | undefined =>
    location_by_name.get(name.trim()) ?? undefined
  const href_of = (location: string): string => `${repo}/blob/${ref}${location}`
  const source_href = (name: string): string | undefined => {
    const location = source_location(name)
    return location && href_of(location)
  }

  // Client-side navigation swaps the page inside the same root, hence the MutationObserver.
  // The anchor goes inside the code element and adopts its child nodes, keeping Svelte's
  // references to them valid; code already holding a link is left alone.
  const link_source_mentions = (root: HTMLElement): (() => void) => {
    const scan = (): void => {
      for (const code of root.querySelectorAll(`code`)) {
        if (code.closest(`a, pre`)) continue
        const existing = code.querySelector(`a`)
        const built_from = existing?.getAttribute(OWN_LINK_ATTR) ?? null
        // An anchor without our marker is the author's own link, which stays untouched.
        if (existing && built_from === null) continue
        const name = (code.textContent ?? ``).trim()
        if (existing) {
          // Our anchor owns the span's text nodes, so Svelte patches text in place and the
          // span stops matching the name the link was built from — without this the link
          // points at what the span used to say, forever.
          if (built_from === name) continue
          code.append(...existing.childNodes)
          existing.remove()
        }
        const location = source_location(name)
        if (!location) continue
        const link = document.createElement(`a`)
        link.href = href_of(location)
        link.target = `_blank`
        link.rel = `noopener`
        link.title = msg.link_title(location.slice(1))
        link.setAttribute(OWN_LINK_ATTR, name)
        link.append(...code.childNodes)
        code.append(link)
      }
    }
    let frame = 0
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(scan)
    }
    schedule()
    const observer = new MutationObserver(schedule)
    // `characterData` because a reactive `<code>{name}</code>` rewrites its text node in
    // place: no childList record, but the link built from the old text is now wrong. The
    // rAF above coalesces the extra traffic to one scan per frame.
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }

  return { source_location, source_href, link_source_mentions }
}
