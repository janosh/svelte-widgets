import { untrack } from 'svelte'

type Report<Via> = ((detail: { via: Via | `programmatic` }) => void) | undefined
type Pending<OpenVia, CloseVia> =
  | { open: true; via: OpenVia }
  | { open: false; via: CloseVia }
// a cause both directions share (e.g. `trigger`) can toggle; others pick a direction
type ChangeOpen<OpenVia, CloseVia> = {
  (open: true, via: OpenVia): void
  (open: false, via: CloseVia): void
  (open: boolean, via: OpenVia & CloseVia): void
}

// One open/close contract for overlays with a bindable `open`: each change of `open` reports
// once, to on_open or on_close, with what caused it. Components change `open` through the
// returned setter, naming the cause; a change that came through the bound prop reports
// `programmatic`. Mounting reports nothing, whatever the initial state. The callbacks are
// getters so prop updates are seen. Call during component init: it registers an effect.
export const track_open = <OpenVia extends string, CloseVia extends string>(
  get_open: () => boolean,
  set_open: (open: boolean) => void,
  on_open: () => Report<OpenVia>,
  on_close: () => Report<CloseVia>,
): ChangeOpen<OpenVia, CloseVia> => {
  // plain bookkeeping, so recording the state does not retrigger the effect
  let was_open = untrack(get_open)
  let pending: Pending<OpenVia, CloseVia> | null = null
  $effect(() => {
    const open = get_open()
    const cause = pending
    pending = null
    if (open === was_open) return
    // recorded before the callbacks, so one that flips `open` back is seen as a new change
    was_open = open
    // the setter records a cause only for a real change, so its direction matches; checking
    // it just narrows the via type
    untrack(() => {
      if (open) on_open()?.({ via: cause?.open ? cause.via : `programmatic` })
      else on_close()?.({ via: cause?.open === false ? cause.via : `programmatic` })
    })
  })
  return (open: boolean, via: OpenVia | CloseVia) => {
    // a no-op change leaves no cause behind to mislabel the next bound-prop change
    if (open === untrack(get_open)) return
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the overloads tie via to open
    pending = { open, via } as Pending<OpenVia, CloseVia>
    set_open(open)
  }
}
