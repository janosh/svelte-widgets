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
  ) =>
  (node: Element): (() => void) => {
    const { root, root_margin, threshold, once = false } = options
    const observer = new IntersectionObserver(
      (entries) => {
        // a batch can hold several crossings of this node: the last is current, but `once`
        // wants the first entry, which a later exit in the same batch must not hide
        const entry = once
          ? entries.find(({ isIntersecting }) => isIntersecting)
          : entries.at(-1)
        if (!entry) return
        if (once) observer.disconnect()
        callback(entry.isIntersecting, entry)
      },
      { root, rootMargin: root_margin, threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }
