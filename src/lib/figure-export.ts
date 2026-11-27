// Standalone figure export: live SVG (and HTML laid out as a figure) to self-contained SVG
// markup or a PNG declaring its DPI. The DOM conventions it honors:
// - `data-export-exclude`: element (and subtree) left out of exports
// - `data-export-only`: static stand-in, hidden on screen (display: none), shown in exports
// - `data-export-overlay`: HTML root laid over a chart's SVG (legend, color bar), a sibling
//   or descendant of the SVG's parent, redrawn as SVG at its on-screen position
// - `canvas_painters`: canvases inside a <foreignObject> repaint at export resolution
import { clamp, get_uuid, hash_string, to_error } from './utils'

// Default PNG resolution: exactly 2x CSS pixels
export const DEFAULT_PNG_DPI = 144

// Repaints a foreignObject canvas onto another canvas at a given pixel ratio. Charts register
// one per canvas so SVG/PNG export embeds the marks at export resolution, not as an
// upscaled screen bitmap.
export const canvas_painters = new WeakMap<
  HTMLCanvasElement,
  (target: HTMLCanvasElement, pixel_ratio: number) => void
>()

// PNG DPI -> render scale relative to the 72 DPI baseline, capped at 10x. DPI floors
// at 1 (non-finite -> 72) so bad inputs can't yield 0x0 canvases or NaN pixel ratios.
export const dpi_to_scale = (png_dpi: number): number =>
  clamp(Number.isFinite(png_dpi) ? png_dpi : 72, 1, 720) / 72

// Encoding cost grows with image pixels or recording size, but stalled exports stay bounded.
export const export_timeout_ms = (estimated_megabytes: number): number =>
  Math.min(300_000, 30_000 + estimated_megabytes * 1000)

// `operation`'s result, or an Error naming `message` once `timeout_ms` passes first
export async function with_timeout<Value>(
  operation: () => Promise<Value>,
  timeout_ms: number,
  message: string,
): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${message} timed out after ${timeout_ms}ms`)),
          timeout_ms,
        )
      }),
    ])
  } catch (error) {
    throw to_error(error)
  } finally {
    clearTimeout(timer)
  }
}

// CRC-32 of PNG chunk types and data (ISO 3309, as zlib computes it)
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let crc = byte
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc
})
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// The PNG declaring `png_dpi` as its physical resolution (a pHYs chunk right after IHDR,
// replacing one the encoder wrote): without it documents assume 72 or 96 DPI and place a
// 300 DPI export at 3-4x its on-screen size
export async function set_png_dpi(png: Blob, png_dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const chunk_type = (pos: number) =>
    String.fromCodePoint(...bytes.subarray(pos + 4, pos + 8))
  if (
    !PNG_SIGNATURE.every((byte, idx) => bytes[idx] === byte) ||
    chunk_type(8) !== `IHDR`
  )
    throw new Error(`Canvas encoder returned no PNG (${bytes.length} bytes)`)
  const phys = new Uint8Array(21)
  const phys_view = new DataView(phys.buffer)
  phys_view.setUint32(0, 9)
  phys.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  const pixels_per_meter = Math.round(png_dpi / 0.0254)
  phys_view.setUint32(8, pixels_per_meter)
  phys_view.setUint32(12, pixels_per_meter)
  phys[16] = 1 // unit: meter
  phys_view.setUint32(17, crc32(phys.subarray(4, 17)))
  const ihdr_end = 8 + 12 + view.getUint32(8)
  const parts: Uint8Array[] = [bytes.subarray(0, ihdr_end), phys]
  // pHYs must precede the image data, so only the chunks before IDAT can hold one
  let pos = ihdr_end
  while (pos < bytes.length && chunk_type(pos) !== `IDAT`) {
    const end = pos + 12 + view.getUint32(pos)
    if (chunk_type(pos) !== `pHYs`) parts.push(bytes.subarray(pos, end))
    pos = end
  }
  parts.push(bytes.subarray(pos))
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: `image/png` })
}

// A canvas's pixels as a PNG declaring `png_dpi`, its encode bounded by export_timeout_ms
export const encode_canvas_png = (
  canvas: HTMLCanvasElement,
  png_dpi: number,
): Promise<Blob> =>
  with_timeout(
    () =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to generate PNG`))),
          `image/png`,
        )
      }),
    export_timeout_ms((canvas.width * canvas.height * 4) / 1e6),
    `PNG toBlob`,
  ).then((blob) => set_png_dpi(blob, png_dpi))

// PNG of a scene drawn in CSS pixels: `paint` runs on a fresh canvas pre-scaled by `scale`,
// so canvas-drawn marks come out crisp instead of as an upscaled screen bitmap. `png_dpi` is
// the resolution the file declares, by default the one `scale` realizes (see dpi_to_scale).
export async function paint_png_blob(
  width: number,
  height: number,
  scale: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
  png_dpi = scale * 72,
): Promise<Blob> {
  const canvas = document.createElement(`canvas`)
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext(`2d`)
  if (!ctx) throw new Error(`Canvas 2D context not available`)
  ctx.scale(scale, scale)
  paint(ctx)
  return encode_canvas_png(canvas, png_dpi)
}

// === SVG serialization ===

export const SVG_NS = `http://www.w3.org/2000/svg`

// Paint properties a standalone SVG must carry itself (it loses the page stylesheets), with
// their initial values. Inherited ones are written only where they change from the parent,
// the others only where they leave their initial value, so the file stays small. The fonts
// have no fixed initial value, so the root always pins the page's.
const INHERITED_STYLES: Record<string, string> = {
  fill: `rgb(0, 0, 0)`,
  'fill-opacity': `1`,
  stroke: `none`,
  'stroke-width': `1`,
  'stroke-opacity': `1`,
  'stroke-dasharray': `none`,
  'stroke-linecap': `butt`,
  'stroke-linejoin': `miter`,
  'font-family': ``,
  'font-size': ``,
  'font-weight': `400`,
  'font-style': `normal`,
  'text-anchor': `start`,
  'dominant-baseline': `auto`,
  'paint-order': `normal`,
  visibility: `visible`,
}
const OWN_STYLES: Record<string, string> = {
  opacity: `1`,
  'stop-color': `rgb(0, 0, 0)`,
  'stop-opacity': `1`,
  // a figure stretching a large viewBox into a few px would otherwise lose its strokes
  'vector-effect': `none`,
  // page CSS may clip a plot area, and a lost clip shows marks panned beyond it
  'clip-path': `none`,
}
// Containers whose content only renders where referenced, so nothing in them is stripped
const DEFINITION_TAGS = new Set([
  `defs`,
  `clipPath`,
  `mask`,
  `pattern`,
  `marker`,
  `symbol`,
  `linearGradient`,
  `radialGradient`,
  `filter`,
])
// oxfmt-ignore
const SHAPE_TAGS = new Set([`rect`, `circle`, `ellipse`, `path`, `line`, `polyline`, `polygon`])
const is_no_paint = (paint: string): boolean =>
  paint === `none` || paint === `transparent` || /^rgba\(.*,\s*0\)$/.test(paint)

type ResolvedStyles = Record<string, string>

// Write each paint property onto `clone` where it differs from what the clone would inherit,
// and drop authored ones that are redundant, except in definitions: content a <use> clones
// inherits from the use site, so its authored values are never redundant. Reads the browser's computed style, falling back
// to the authored attribute for engines that don't compute SVG presentation attributes.
function inline_styles(
  live: Element,
  clone: Element,
  parent: ResolvedStyles | null,
  in_defs: boolean,
): ResolvedStyles {
  const computed = getComputedStyle(live)
  const resolved: ResolvedStyles = {}
  const style = (clone as SVGElement).style
  for (const [props, inherited] of [
    [INHERITED_STYLES, true],
    [OWN_STYLES, false],
  ] as const) {
    for (const [prop, initial] of Object.entries(props)) {
      const expected = (inherited ? parent?.[prop] : undefined) ?? initial
      // empty strings mean "not set" at every level, hence find(Boolean) rather than ??
      let value = (
        [
          computed.getPropertyValue(prop),
          (live as SVGElement).style?.getPropertyValue(prop),
          live.getAttribute(prop),
        ].find(Boolean) ?? expected
      ).replaceAll(/(?<num>\d)px\b/g, `$<num>`)
      if (prop === `font-weight` && value === `normal`) value = `400`
      resolved[prop] = value
      style?.removeProperty(prop)
      if (value !== expected) clone.setAttribute(prop, value)
      else if (!in_defs) clone.removeAttribute(prop)
    }
  }
  // Read for stripping, never written: an element is either exported visible or dropped
  resolved.display =
    [computed.display, live.getAttribute(`display`)].find(Boolean) ?? `inline`
  return resolved
}

// Hidden elements, transparent hit targets and interaction-only markup render nothing
function renders_nothing(live: Element, styles: ResolvedStyles): boolean {
  if (live.hasAttribute(`data-export-exclude`)) return true
  if (live.hasAttribute(`data-export-only`)) return false
  if (styles.display === `none` || styles.opacity === `0`) return true
  if (styles.visibility === `hidden` && live.childElementCount === 0) return true
  return (
    SHAPE_TAGS.has(live.localName) &&
    (live.localName === `line` || is_no_paint(styles.fill)) && // lines have no fill
    (is_no_paint(styles.stroke) || styles[`stroke-width`] === `0`)
  )
}

// A <canvas> inside a <foreignObject> is a live bitmap, not markup: the serializer would emit
// an empty element. Swap it for an <image> of its pixels, repainted at `scale` when the chart
// registered a painter for it (see canvas_painters) so raster exports stay sharp.
function foreign_canvas_image(live: Element, scale: number): SVGImageElement | null {
  const canvas = live.querySelector(`canvas`)
  if (!canvas?.width || !canvas.height) return null
  const painter = canvas_painters.get(canvas)
  let source = canvas
  if (painter) {
    source = document.createElement(`canvas`)
    painter(source, scale)
  }
  let href: string
  try {
    href = source.toDataURL(`image/png`)
  } catch {
    return null // tainted by a cross-origin draw: nothing can be read back
  }
  const image = document.createElementNS(SVG_NS, `image`)
  for (const attr of [`x`, `y`, `width`, `height`]) {
    const value = live.getAttribute(attr)
    if (value != null) image.setAttribute(attr, value)
  }
  image.setAttribute(`href`, href)
  return image
}

type WalkState = { max_stroke: number; raster_scale: number }

// Walk the live tree and its clone in lockstep: inline styles, strip what renders nothing,
// rasterize foreign canvases and track the widest stroke (for edge padding)
function prepare_clone(
  live: Element,
  clone: Element,
  parent: ResolvedStyles | null,
  in_defs: boolean,
  state: WalkState,
): void {
  const styles = inline_styles(live, clone, parent, in_defs)
  // Static stand-ins for interactive markup, hidden on screen
  if (live.hasAttribute(`data-export-only`)) clone.removeAttribute(`display`)
  if (!in_defs && renders_nothing(live, styles)) return clone.remove()
  if (live.localName === `foreignObject`) {
    if (!live.querySelector(`canvas`)) return
    const image = foreign_canvas_image(live, state.raster_scale)
    if (image) clone.replaceWith(image)
    else clone.remove()
    return
  }
  if (!in_defs && !is_no_paint(styles.stroke)) {
    // stroke widths may carry units (`1.5px`), which Number() rejects
    const stroke_width = Number.parseFloat(styles[`stroke-width`]) // oxlint-disable-line unicorn/prefer-number-coercion
    state.max_stroke = Math.max(state.max_stroke, stroke_width || 0)
  }
  const children_in_defs = in_defs || DEFINITION_TAGS.has(live.localName)
  const clone_children = [...clone.children]
  ;[...live.children].forEach((child, idx) => {
    if (clone_children[idx])
      prepare_clone(child, clone_children[idx], styles, children_in_defs, state)
  })
}

// Rounds decimals with more than `digits` fraction digits (or a negative exponent) to `digits`
// places, long floats dominating chart file sizes. url(#…) references match first and stay
// verbatim: ids are UUIDs, whose `3e-1234` reads as a number. Whole number tokens match, never
// a tail like `99.9999` in compact path data `0.99.9999`, and a rounded number that lost the
// dot or sign separating it from a neighbor (`0.99.9999`, `1-0.001`) gets a space.
const NUMBER_TOKEN = /url\([^)]*\)|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi
const round_decimals = (text: string, digits: number): string => {
  const long_decimal = new RegExp(`\\.\\d{${digits + 1}}|e-`, `i`)
  const factor = 10 ** digits
  return !long_decimal.test(text)
    ? text
    : text.replaceAll(NUMBER_TOKEN, (match, offset: number) => {
        // a leading zero before a digit marks compact arc flags (`a5 5 0 011.5 2`)
        if (/^url\(|^-?0\d/.test(match) || !long_decimal.test(match)) return match
        const rounded = String(Math.round(Number(match) * factor) / factor || 0)
        const merges_before = /[\d.]/.test(text[offset - 1] ?? ``) && /^\d/.test(rounded)
        const merges_after = text[offset + match.length] === `.` && !rounded.includes(`.`)
        return `${merges_before ? ` ` : ``}${rounded}${merges_after ? ` ` : ``}`
      })
}
// Fraction digits resolving 1/10000 of the viewBox's shorter side, at least 2 (0.01 units, far
// below a pixel when user units are px): fixed 2 would zero marks drawn in tiny user units
function fraction_digits(viewbox: SvgViewbox | null): number {
  if (!viewbox) return 2
  const shorter_side = Math.min(viewbox[2], viewbox[3])
  return Math.max(2, Math.ceil(4 - Math.log10(shorter_side)))
}
// Markup the standalone file has no use for: interaction and test hooks and event routing.
// Classes stay as layer names for editing the figure in vector tools, minus Svelte's
// scoping hashes, which only meant something to the page stylesheet.
const DROP_ATTR = /^(?:data-|aria-|role$|tabindex$|pointer-events$|cursor$)/
// transforms carry dimensionless factors (`scale(0.004)`), not coordinates
// oxfmt-ignore
const NOT_ROUNDED = new Set([`href`, `xlink:href`, `id`, `class`, `font-family`, `transform`, `gradientTransform`, `patternTransform`])
const INTERACTION_STYLES = [`cursor`, `pointer-events`, `user-select`, `touch-action`]

function minify_clone(root: Element, digits: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  // a TreeWalker yields plain Nodes, which lack ChildNode.remove()
  // oxlint-disable-next-line prefer-dom-node-remove
  for (const comment of comments) comment.parentNode?.removeChild(comment)
  for (const element of [root, ...root.querySelectorAll(`*`)]) {
    const style = (element as SVGElement).style
    for (const prop of INTERACTION_STYLES) style?.removeProperty(prop)
    if (style && !style.length) element.removeAttribute(`style`)
    const classes = element
      .getAttribute(`class`)
      ?.replaceAll(/(?<![\w-])svelte-[a-z0-9]+(?![\w-])/g, ``)
      .trim()
    if (classes) element.setAttribute(`class`, classes.replaceAll(/\s+/g, ` `))
    else element.removeAttribute(`class`)
    // a snapshot: the live NamedNodeMap shifts as attributes are removed
    for (const { name, value } of Array.from(element.attributes)) {
      if (DROP_ATTR.test(name)) element.removeAttribute(name)
      else if (!NOT_ROUNDED.has(name))
        element.setAttribute(name, round_decimals(value, digits))
    }
  }
  // Groups emptied by the stripping above render nothing (definition containers may be
  // referenced by id, so they stay)
  for (const group of [...root.querySelectorAll(`g`)].toReversed())
    if (!group.firstElementChild && !group.closest(`defs`)) group.remove()
}

// Ids from crypto.randomUUID() and mount-order $props.id() made every export of an unchanged
// figure differ, so all ids are renamed by `name(index)` in document order, with every
// same-document reference (href="#id", url(#id) in attributes and inline styles) following.
// A reference to an id outside the figure gets a fresh name too: still dangling, but stable
// and unable to hit a renamed id.
const URL_REF = /url\(\s*(?<quote>['"]?)#(?<ref>[^'")\s]+)\k<quote>\s*\)/g
function rename_ids(root: Element, name: (idx: number) => string): void {
  const elements = [root, ...root.querySelectorAll(`*`)]
  const ids = new Map<string, string>()
  const rename = (id: string): string => {
    const new_id = ids.get(id) ?? name(ids.size)
    ids.set(id, new_id)
    return new_id
  }
  for (const element of elements) {
    const id = element.getAttribute(`id`)
    if (id !== null) element.setAttribute(`id`, rename(id))
  }
  for (const element of elements) {
    for (const { name: attr, value } of Array.from(element.attributes)) {
      const new_value = /^(?:xlink:)?href$/.test(attr)
        ? value.replace(/^#(?<ref>.+)$/, (_, ref: string) => `#${rename(ref)}`)
        : value.replaceAll(
            URL_REF,
            (_, quote: string, ref: string) => `url(${quote}#${rename(ref)}${quote})`,
          )
      if (new_value !== value) element.setAttribute(attr, new_value)
    }
  }
}

// Stable ids that still differ between figures, so two exports inlined in one page don't
// resolve each other's clip paths: a hash of the figure with its ids numbered prefixes them.
function renumber_ids(root: Element): void {
  rename_ids(root, (idx) => `id${idx}`)
  const prefix = `f${hash_string(root.outerHTML).toString(36)}`
  rename_ids(root, (idx) => `${prefix}-${idx}`)
}

type SvgViewbox = [x: number, y: number, width: number, height: number]

function svg_viewbox(svg: SVGElement, padding = 0): SvgViewbox | null {
  const viewbox = svg.getAttribute(`viewBox`)?.trim()
  // Without a viewBox, SVG coordinates use the viewport's resolved length units.
  const { width: css_width, height: css_height } = viewbox ? {} : getComputedStyle(svg)
  const parts = viewbox
    ? viewbox.split(/[\s,]+/).map(Number)
    : // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed CSS dimensions include px
      [0, 0, Number.parseFloat(css_width ?? ``), Number.parseFloat(css_height ?? ``)]
  if (parts.length !== 4) return null
  const [coord_x, coord_y, width, height] = parts
  if (!(width > 0 && height > 0)) return null
  const padded: SvgViewbox = [
    coord_x - padding,
    coord_y - padding,
    width + 2 * padding,
    height + 2 * padding,
  ]
  return padded.every(Number.isFinite) ? padded : null
}

// Standalone SVG markup of a live figure, never mutating it: computed paint styles inlined
// minimally, HTML overlays (legends, color bars) redrawn as SVG, hidden and interaction-only
// elements dropped, coordinates rounded (see fraction_digits), and the viewBox padded by half
// the widest stroke so edge strokes aren't clipped. Foreign canvases embed at `scale`; a
// raster export also sizes the root to its viewBox times `scale` in pixels.
function serialize_svg(
  svg: SVGElement,
  scale: number,
  raster = false,
): { markup: string; size: [width: number, height: number] | null } {
  const clone = svg.cloneNode(true) as SVGElement
  const state: WalkState = { max_stroke: 0, raster_scale: scale }
  prepare_clone(svg, clone, null, false, state)
  const overlays = export_overlays(svg)
  clone.append(...overlays.groups)
  const digits = fraction_digits(svg_viewbox(svg))
  clone.style.removeProperty(`width`)
  clone.style.removeProperty(`height`)
  minify_clone(clone, digits)
  // set after rounding, which would skew a scale like 1/3 across the whole overlay
  if (overlays.transform)
    for (const group of overlays.groups)
      group.setAttribute(`transform`, overlays.transform)
  renumber_ids(clone)
  // the figure's accessible name, as a <title> since minify_clone drops aria attributes
  const name = svg.getAttribute(`aria-label`)
  if (name)
    clone.prepend(
      Object.assign(document.createElementNS(SVG_NS, `title`), { textContent: name }),
    )
  const viewbox = svg_viewbox(svg, state.max_stroke / 2)
  // Floor at 1px: small viewBoxes at low DPI round to 0 and make toBlob fail confusingly
  const size: [number, number] | null = viewbox
    ? ([viewbox[2], viewbox[3]].map((len) =>
        raster
          ? Math.max(1, Math.round(len * scale))
          : Math.round(len * 10 ** digits) / 10 ** digits,
      ) as [number, number])
    : null
  if (viewbox) clone.setAttribute(`viewBox`, round_decimals(viewbox.join(` `), digits))
  if (size) set_attrs(clone, { width: size[0], height: size[1] })
  clone.setAttribute(`xmlns`, SVG_NS)
  return { markup: new XMLSerializer().serializeToString(clone), size }
}

// Standalone SVG file content of a live figure (see serialize_svg), canvases embedded at png_dpi
export const svg_to_string = (svg: SVGElement, png_dpi = DEFAULT_PNG_DPI): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${serialize_svg(svg, dpi_to_scale(png_dpi)).markup}`

// Rasterize a live SVG figure at `png_dpi` (72 DPI = one pixel per viewBox unit)
export async function svg_to_png_blob(
  svg: SVGElement,
  png_dpi = DEFAULT_PNG_DPI,
): Promise<Blob> {
  if (!Number.isFinite(png_dpi) || png_dpi <= 0)
    throw new Error(`Invalid PNG DPI for export`)
  const scale = dpi_to_scale(png_dpi)
  const { markup, size } = serialize_svg(svg, scale, true)
  if (!size) throw new Error(`Invalid SVG dimensions for PNG export`)
  const [width, height] = size
  return with_svg_image(markup, width * height, (img) =>
    paint_png_blob(
      width,
      height,
      1,
      (ctx) => ctx.drawImage(img, 0, 0, width, height),
      scale * 72,
    ),
  )
}

// Load SVG markup into an <img> (timeout scaled by its pixel count), run `use` on it, then
// release the object URL
export async function with_svg_image<Value>(
  markup: string,
  n_pixels: number,
  use: (img: HTMLImageElement) => Promise<Value>,
): Promise<Value> {
  const url = URL.createObjectURL(
    new Blob([markup], { type: `image/svg+xml;charset=utf-8` }),
  )
  const listeners = new AbortController()
  try {
    const img = new Image()
    await with_timeout(
      () =>
        new Promise<void>((resolve, reject) => {
          const event_options = { once: true, signal: listeners.signal }
          img.addEventListener(`load`, () => resolve(), event_options)
          img.addEventListener(
            `error`,
            () => reject(new Error(`Failed to load SVG for PNG export`)),
            event_options,
          )
          img.src = url
        }),
      export_timeout_ms((n_pixels * 4) / 1e6),
      `SVG image load`,
    )
    return await use(img)
  } catch (error) {
    throw to_error(error)
  } finally {
    listeners.abort()
    URL.revokeObjectURL(url)
  }
}

// === HTML overlays ===
// Legends and color bars are HTML laid over a chart's SVG. Components mark such roots with
// `data-export-overlay`; on export each is redrawn as static SVG at its on-screen position.

type Attrs = Record<string, string | number>
const set_attrs = <El extends Element>(element: El, attrs: Attrs): El => {
  for (const [name, value] of Object.entries(attrs))
    element.setAttribute(name, String(value))
  return element
}
export const svg_el = (tag: string, attrs: Attrs): SVGElement =>
  set_attrs(document.createElementNS(SVG_NS, tag), attrs)

const SIDE_DEGREES: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 }

// A computed `linear-gradient([to <side> | <angle>deg,] <color> <offset>, ...)` as an SVG
// gradient vector (in bounding-box units, exact for axis-aligned angles) plus [color, offset]
// stops, or null for any other background. Browsers compute `to bottom` as no direction.
function parse_linear_gradient(background_image: string) {
  const { side, deg, args } =
    /^linear-gradient\((?:to (?<side>\w+), |(?<deg>-?[\d.]+)deg, )?(?<args>.*)\)$/s.exec(
      background_image.trim(),
    )?.groups ?? {}
  // a corner (`to top right`) or another angle unit is left unparsed in args
  if (args === undefined || /^(?:to |-?[\d.]+[a-z]+,)/.test(args)) return null
  const angle = deg === undefined ? SIDE_DEGREES[side ?? `bottom`] : Number(deg)
  if (angle === undefined) return null
  const radians = (angle * Math.PI) / 180
  // rounded so axis-aligned angles give exact 0/0.5/1 instead of 6e-17 residues
  const [dx, dy] = [Math.sin(radians), -Math.cos(radians)].map(
    (component) => Math.round(component * 1e6) / 2e6 || 0,
  )
  const vector = [0.5 - dx, 0.5 - dy, 0.5 + dx, 0.5 + dy]
  // split on commas outside parentheses (color functions like rgb(1, 2, 3) nest their own),
  // then each stop at the space before its percent offset. Browsers drop the offsets of
  // evenly spaced stops from computed values, so a stop without one gets its even spacing
  // (color bars set all offsets or none, so mixed lists needn't interpolate per CSS).
  const parts = args.split(/,(?![^(]*\))/).map((stop) => stop.trim())
  const stops = parts.map((stop, idx) => {
    const { color = stop, offset = `${(100 * idx) / Math.max(1, parts.length - 1)}%` } =
      /^(?<color>.+?)\s+(?<offset>-?[\d.]+%)$/.exec(stop)?.groups ?? {}
    return [color, offset]
  })
  return { vector, stops }
}

// Redraw an HTML overlay as SVG in the coordinate frame of `origin` (the chart SVG's box):
// solid and gradient backgrounds become rects, nested SVGs (legend markers) are cloned in
// place, text runs become <text> at their laid-out position with the computed font.
export function overlay_to_svg(root: HTMLElement, origin: DOMRect): SVGElement {
  // clipPath and linearGradient never render themselves, so they can live in the group. The
  // reset paints stop it inheriting the chart root's (e.g. a centered text-anchor)
  const group = svg_el(`g`, { 'text-anchor': `start`, stroke: `none` })
  const box = (rect: DOMRect) => ({
    x: rect.left - origin.left,
    y: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  })
  // A scrolling legend shows only what fits its box
  if (![``, `visible`].includes(getComputedStyle(root).overflowY)) {
    const id = `export-overlay-clip-${get_uuid()}`
    const clip = svg_el(`clipPath`, { id })
    const clip_box = box(root.getBoundingClientRect())
    clip.append(svg_el(`rect`, clip_box))
    group.append(clip)
    group.setAttribute(`clip-path`, `url(#${id})`)
  }

  const add_background = (
    element: Element,
    style: CSSStyleDeclaration,
    opacity: number,
  ) => {
    const rect = box(element.getBoundingClientRect())
    if (!(rect.width > 0 && rect.height > 0)) return
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed CSS lengths include px
    const radius = Number.parseFloat(style.borderTopLeftRadius) || 0
    const gradient = parse_linear_gradient(style.backgroundImage)
    let fill = style.backgroundColor
    if (gradient) {
      const id = `export-overlay-gradient-${get_uuid()}`
      const [x1, y1, x2, y2] = gradient.vector
      const element_gradient = svg_el(`linearGradient`, { id, x1, y1, x2, y2 })
      for (const [color, offset] of gradient.stops)
        element_gradient.append(svg_el(`stop`, { offset, 'stop-color': color }))
      group.append(element_gradient)
      fill = `url(#${id})`
    } else if (!fill || is_no_paint(fill)) return
    group.append(
      svg_el(`rect`, { ...rect, ...(radius && { rx: radius }), fill, opacity }),
    )
  }

  const add_text = (node: Text, style: CSSStyleDeclaration, opacity: number) => {
    const text = node.textContent?.replaceAll(/\s+/g, ` `).trim()
    if (!text) return
    const range = document.createRange()
    range.selectNodeContents(node)
    const rect = box(range.getBoundingClientRect())
    if (!(rect.width > 0 || rect.height > 0)) return
    const text_el = svg_el(`text`, {
      x: rect.x,
      y: rect.y + rect.height / 2,
      'dominant-baseline': `central`,
      fill: style.color,
      'font-size': style.fontSize,
      'font-family': style.fontFamily,
      'font-weight': style.fontWeight,
      'font-style': style.fontStyle,
      opacity,
    })
    text_el.textContent = text
    group.append(text_el)
  }

  const walk = (element: Element, parent_opacity: number) => {
    // Interactive controls have no static rendering (and raster exports must stay untainted)
    if (element.matches(`input, select, button, textarea, [data-export-exclude]`)) return
    const style = getComputedStyle(element)
    if (style.display === `none` || style.visibility === `hidden`) return
    const opacity = parent_opacity * (style.opacity === `` ? 1 : Number(style.opacity))
    if (!(opacity > 0)) return
    if (element instanceof SVGSVGElement) {
      const clone = element.cloneNode(true) as SVGSVGElement
      prepare_clone(element, clone, null, false, { max_stroke: 0, raster_scale: 1 })
      const nested_box = box(element.getBoundingClientRect())
      group.append(set_attrs(clone, { ...nested_box, opacity }))
      return
    }
    add_background(element, style, opacity)
    // Paint children in CSS stacking order, not DOM order: negative z-index, then in-flow
    // content, then positioned (z-index auto or 0), then positive z-index (e.g. colored
    // segments under their labels). toSorted is stable, so ties keep DOM order.
    const paint_layer = (node: ChildNode): number => {
      if (!(node instanceof Element)) return 0
      const { position, zIndex } = getComputedStyle(node)
      if (position === `static`) return 0
      return Number(zIndex) || 0.5 // NaN for auto
    }
    const layered = [...element.childNodes].map((child) => ({
      child,
      layer: paint_layer(child),
    }))
    for (const { child } of layered.toSorted((a, b) => a.layer - b.layer)) {
      if (child instanceof Text) add_text(child, style, opacity)
      else if (child instanceof Element) walk(child, opacity)
    }
  }
  walk(root, 1)
  return group
}

// SVG redraws of the HTML overlays a chart lays over `svg` (siblings marked data-export-overlay)
// and the transform from their CSS px into its user units (null when they coincide)
function export_overlays(svg: SVGElement): {
  groups: SVGElement[]
  transform: string | null
} {
  const overlays = [
    ...(svg.parentElement?.querySelectorAll<HTMLElement>(`[data-export-overlay]`) ?? []),
  ].filter((overlay) => !svg.contains(overlay))
  if (overlays.length === 0) return { groups: [], transform: null }
  const origin = svg.getBoundingClientRect()
  // Overlay boxes are CSS px from the SVG's box: a viewBox scaling or offsetting user units
  // (preserveAspectRatio included) needs the inverse screen mapping. Null when not rendered.
  const ctm = svg instanceof SVGGraphicsElement ? svg.getScreenCTM() : null
  const to_user =
    ctm && DOMMatrix.fromMatrix(ctm).inverse().translate(origin.left, origin.top)
  const { a, b, c, d, e, f } = to_user ?? {}
  return {
    groups: overlays.map((overlay) => overlay_to_svg(overlay, origin)),
    transform: to_user && !to_user.isIdentity ? `matrix(${[a, b, c, d, e, f]})` : null,
  }
}

// An HTML element (e.g. a CSS-grid heatmap) as a standalone SVG: the overlay redraw applied
// to the element itself inside an SVG of its size, so HTML figures share the SVG/PNG path
export function html_to_svg(element: HTMLElement): SVGSVGElement {
  const rect = element.getBoundingClientRect()
  if (!(rect.width > 0 && rect.height > 0))
    throw new Error(`Cannot export an element that has not been laid out (zero size)`)
  const svg = svg_el(`svg`, {
    viewBox: `0 0 ${rect.width} ${rect.height}`,
  }) as SVGSVGElement
  svg.append(overlay_to_svg(element, rect))
  return svg
}

// Watch a wrapper element for <canvas> insertion/removal: calls set with its first canvas (or
// null) immediately and whenever a canvas comes or goes. Returns a cleanup that disconnects
// the observer (or undefined when no wrapper is given). Used by export panes to enable canvas
// exports.
export function observe_canvas_presence(
  wrapper: HTMLElement | undefined,
  set: (canvas: HTMLCanvasElement | null) => void,
): (() => void) | undefined {
  if (!wrapper) {
    set(null)
    return undefined
  }
  const check = () => set(wrapper.querySelector(`canvas`))
  check()
  // Only an inserted or removed canvas (or subtree holding one) can change the answer: a
  // viewer's tables and labels re-render on every frame, and querying its whole tree each
  // time cost a frame switch more than rendering it
  const holds_canvas = (nodes: NodeList): boolean =>
    [...nodes].some(
      (node) =>
        node instanceof Element &&
        (node.localName === `canvas` || node.querySelector(`canvas`) !== null),
    )
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (rec) => holds_canvas(rec.addedNodes) || holds_canvas(rec.removedNodes),
      )
    )
      check()
  })
  observer.observe(wrapper, { childList: true, subtree: true })
  return () => observer.disconnect()
}
