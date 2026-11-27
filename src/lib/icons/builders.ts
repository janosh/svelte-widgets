// Builders for IconData glyphs in the library's 24x24 frame, shared by custom.ts and by consumers
// that draw their own glyphs in the same style
import type { IconData } from './types.ts'

type IconPaint = Pick<IconData, 'stroke' | 'fill'>
// pure-call annotations let bundlers drop unused `export const X = markup_icon(...)` glyphs;
// declared as functions, the one form esbuild, rollup and terser all document for the annotation
/* #__NO_SIDE_EFFECTS__ */ export function markup_icon(
  markup: string,
  paint?: IconPaint,
): IconData {
  return { viewBox: `0 0 24 24`, markup, ...paint }
}
/* #__NO_SIDE_EFFECTS__ */ export function path_icon(
  d: string,
  paint?: IconPaint,
): IconData {
  return { viewBox: `0 0 24 24`, d, ...paint }
}
