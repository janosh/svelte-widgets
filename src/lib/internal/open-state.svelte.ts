import { untrack } from 'svelte'

// One open/close contract for overlays with a bindable `open`: each change of `open` is
// reported once, through `report(open, via)`, with what caused it. Components change `open`
// through the returned setter, naming the cause; a change that came through the bound prop
// reports `programmatic`. Mounting reports nothing, whatever the initial state.
// Call during component init: it registers an effect.
export const track_open = <Via extends string>(
  get_open: () => boolean,
  set_open: (open: boolean) => void,
  report: (open: boolean, via: Via | `programmatic`) => void,
): ((open: boolean, via: Via) => void) => {
  // plain bookkeeping, so recording the state does not retrigger the effect
  let was_open = untrack(get_open)
  let pending_via: Via | null = null
  $effect(() => {
    const open = get_open()
    const via = pending_via ?? `programmatic`
    pending_via = null
    if (open === was_open) return
    // recorded before the callbacks, so one that flips `open` back is seen as a new change
    was_open = open
    untrack(() => report(open, via))
  })
  return (open, via) => {
    // a no-op change leaves no cause behind to mislabel the next bound-prop change
    if (open === untrack(get_open)) return
    pending_via = via
    set_open(open)
  }
}
