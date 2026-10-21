import type { Attachment } from 'svelte/attachments'

export type InViewOptions = {
  root?: Element | Document | null // viewport by default
  root_margin?: string // grows the root box so work starts before the node scrolls in
  threshold?: number | number[]
  // Fire once on first intersection and stop observing: for lazy mounts and one-off loads
  once?: boolean
}

// Report when the node enters or leaves the (margin-grown) viewport. Without `once`, the
// callback runs on every crossing; with it, only on the first entry.
export const in_view =
  (
    callback: (visible: boolean, entry: IntersectionObserverEntry) => void,
    options: InViewOptions = {},
  ): Attachment =>
  (node) => {
    const { root, root_margin, threshold, once = false } = options
    const observer = new IntersectionObserver(
      (entries) => {
        // a batch can hold several crossings of this node, the last is current
        const entry = entries.at(-1)
        if (!entry) return
        if (once) {
          if (!entry.isIntersecting) return
          observer.disconnect()
        }
        callback(entry.isIntersecting, entry)
      },
      { root, rootMargin: root_margin, threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }
