import {
  dpi_to_scale,
  export_figure,
  observe_canvas_presence,
  set_export_painter,
  set_png_dpi,
  type FigureExportOptions,
} from '#lib/figure-export.ts'
import { crc32 } from 'node:zlib'
import { next_task as flush } from './index'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vite-plus/test'

// Restores every vi.spyOn (document.createElement, URL) and stubbed global between tests
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// A 1x1 PNG without a pHYs chunk
const png_base64 = `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`
const png_blob = (): Blob =>
  new Blob([Buffer.from(png_base64, `base64`)], { type: `image/png` })

const mock_object_url = (url = `blob:test-url`) => ({
  create: vi.spyOn(URL, `createObjectURL`).mockReturnValue(url),
  revoke: vi.spyOn(URL, `revokeObjectURL`).mockImplementation(() => {}),
})

// The chunk types of a PNG in file order, checking each chunk's CRC, plus the DPI its pHYs
// declares (null without one)
const read_png = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const chunks: string[] = []
  let dpi: number | null = null
  for (let pos = 8; pos < bytes.length;) {
    const length = view.getUint32(pos)
    const type = new TextDecoder().decode(bytes.subarray(pos + 4, pos + 8))
    expect(view.getUint32(pos + 8 + length)).toBe(
      crc32(bytes.subarray(pos + 4, pos + 8 + length)),
    )
    if (type === `pHYs`) {
      expect([view.getUint32(pos + 8), bytes[pos + 16]]).toEqual([
        view.getUint32(pos + 12),
        1,
      ])
      dpi = view.getUint32(pos + 8) * 0.0254
    }
    chunks.push(type)
    pos += 12 + length
  }
  return { chunks, dpi }
}

const make_mock_toBlob = () =>
  vi.fn((callback_fn: BlobCallback) => callback_fn(png_blob()))

function make_svg(viewBox?: string): SVGElement {
  const svg = document.createElementNS(`http://www.w3.org/2000/svg`, `svg`)
  if (viewBox) svg.setAttribute(`viewBox`, viewBox)
  return svg
}

// Offscreen raster canvas returned by document.createElement(`canvas`) for the current
// test; exports draw into it and read its width/height.
const mock_offscreen_canvas = (): HTMLCanvasElement & {
  getContext: ReturnType<typeof vi.fn>
} => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      scale: vi.fn(),
    }),
    toBlob: make_mock_toBlob(),
  }
  vi.spyOn(document, `createElement`).mockReturnValue(canvas as unknown as HTMLElement)
  return canvas as unknown as HTMLCanvasElement & { getContext: ReturnType<typeof vi.fn> }
}

// Keep image events controllable, including slow loads and late events after a timeout.
const mock_image = (
  src_behaviour: `load` | `error` | `throw` | `never`,
  delay_ms = 0,
) => {
  const images: EventTarget[] = []
  vi.stubGlobal(
    `Image`,
    class MockImage extends EventTarget {
      constructor() {
        super()
        images.push(this)
      }
      set src(_url: string) {
        if (src_behaviour === `throw`) throw new Error(`image setup failed`)
        if (src_behaviour === `never`) return
        const dispatch = () => this.dispatchEvent(new Event(src_behaviour))
        if (delay_ms) setTimeout(dispatch, delay_ms)
        else queueMicrotask(dispatch)
      }
    },
  )
  return images
}

// Export panes enable canvas formats once the viewer holds a <canvas>. Only a canvas (or a
// subtree holding one) coming or going can change that, so other DOM churn under the wrapper,
// like a table re-rendering on every frame, must not re-query the whole tree.
test(`observe_canvas_presence hands over canvases coming and going, ignoring other churn`, async () => {
  const wrapper = document.createElement(`div`)
  document.body.append(wrapper)
  onTestFinished(() => wrapper.remove())
  const set = vi.fn()
  const query_spy = vi.spyOn(wrapper, `querySelector`)
  const stop = observe_canvas_presence(wrapper, set)
  onTestFinished(() => stop?.())
  expect(set.mock.calls).toEqual([[null]])
  const row = document.createElement(`p`)
  wrapper.append(row)
  row.textContent = `frame 2`
  await flush()
  expect(set).toHaveBeenCalledOnce()
  const nested = document.createElement(`div`)
  const canvas = document.createElement(`canvas`)
  nested.append(canvas)
  wrapper.append(nested)
  await flush()
  expect(set.mock.lastCall?.[0]).toBe(canvas)
  nested.remove()
  await flush()
  expect(set).toHaveBeenLastCalledWith(null)
  expect(query_spy).toHaveBeenCalledTimes(3)
  // without a wrapper there is nothing to observe
  const unwrapped = vi.fn()
  expect(observe_canvas_presence(undefined, unwrapped)).toBeUndefined()
  expect(unwrapped.mock.calls).toEqual([[null]])
})

test.each([
  [72, 1], // baseline
  [144, 2],
  [1440, 10], // capped at 10x
  [0.01, 1 / 72], // tiny positives floored at 1 DPI (no 0x0 canvases)
  [0, 1 / 72],
  [-50, 1 / 72],
  [NaN, 1], // non-finite (incl. Infinity) falls back to the 72 DPI baseline
  [Infinity, 1],
])(`dpi_to_scale(%s) = %s`, (png_dpi, expected) => {
  expect(dpi_to_scale(png_dpi)).toBeCloseTo(expected, 12)
})

describe(`set_png_dpi`, () => {
  test.each([72, 300, 600])(
    `declares %s DPI right after IHDR, replacing any pHYs`,
    async (dpi) => {
      const png = await set_png_dpi(png_blob(), dpi)
      expect(await read_png(png)).toEqual({
        chunks: [`IHDR`, `pHYs`, `IDAT`, `IEND`],
        dpi: expect.closeTo(dpi, 1),
      })
      // setting it again replaces the chunk instead of adding a second one
      expect(await read_png(await set_png_dpi(png, 150))).toEqual({
        chunks: [`IHDR`, `pHYs`, `IDAT`, `IEND`],
        dpi: expect.closeTo(150, 1),
      })
    },
  )

  test(`refuses bytes that are no PNG`, async () => {
    await expect(set_png_dpi(new Blob([`test`]), 300)).rejects.toThrow(
      `Canvas encoder returned no PNG (4 bytes)`,
    )
  })
})

const parse_svg = (markup: string): Element =>
  new DOMParser().parseFromString(markup, `image/svg+xml`).documentElement
const mount_svg = (markup: string): SVGSVGElement => {
  document.body.innerHTML = markup
  const svg = document.querySelector(`svg`)
  if (!svg) throw new Error(`svg not mounted`)
  return svg
}
// SVG file content of a figure
const svg_markup = async (
  root: SVGElement | HTMLElement,
  options: Omit<FigureExportOptions, `format`> = {},
): Promise<string> => (await export_figure(root, { ...options, format: `svg` })).text()
const png_of = (svg: SVGElement, dpi?: number): Promise<Blob> =>
  export_figure(svg, { format: `png`, dpi })
// `markup` mounted, exported and parsed back
const export_svg = async (markup: string): Promise<Element> =>
  parse_svg(await svg_markup(mount_svg(markup)))

describe(`export_figure as SVG`, () => {
  test.each([
    [undefined, false],
    [`0 0 200 150`, false],
    [`0 0 100 100`, true],
  ])(
    `emits standalone SVG with viewBox=%s, xmlns=%s without mutation`,
    async (viewbox, xmlns) => {
      const svg = make_svg(viewbox)
      if (xmlns) svg.setAttribute(`xmlns`, `http://www.w3.org/2000/svg`)
      const original_attrs = svg.attributes.length
      const result = await svg_markup(svg)
      expect(result).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /)
      expect(result).not.toContain(`<!DOCTYPE`)
      expect(result.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)).toHaveLength(1)
      if (viewbox) {
        expect(result).toContain(`viewBox="${viewbox}"`)
        const [, , width, height] = viewbox.split(` `)
        expect(result).toContain(`width="${width}" height="${height}"`)
      } else expect(result).not.toContain(`viewBox=`)
      expect(svg.attributes).toHaveLength(original_attrs)
    },
  )

  test.each([
    { attribute_width: `4`, style_width: ``, expected: `-2 -2 104 54` },
    { attribute_width: `2`, style_width: `8px`, expected: `-4 -4 108 58` },
  ])(
    `pads the viewBox by half the widest stroke $style_width`,
    async ({ attribute_width, style_width, expected }) => {
      const svg = make_svg(`0 0 100 50`)
      const rect = document.createElementNS(`http://www.w3.org/2000/svg`, `rect`)
      rect.setAttribute(`stroke`, `black`)
      rect.setAttribute(`stroke-width`, attribute_width)
      if (style_width) rect.style.strokeWidth = style_width
      svg.append(rect)
      expect(await svg_markup(svg)).toContain(`viewBox="${expected}"`)
      expect(svg.getAttribute(`viewBox`)).toBe(`0 0 100 50`)
    },
  )

  test(`renames random ids stably per figure, with every same-document reference`, async () => {
    // refs before their defs, spaced and double-quoted url(), xlink:href, a duplicate id,
    // an id on the root and a ref to an id outside the figure
    const figure = (uid: string, width = 9) =>
      `<svg id="root-${uid}" viewBox="0 0 10 10"><g clip-path="url( #clip-${uid} )"><rect fill="url('#grad-${uid}')" style='mask: url("#clip-${uid}")' width="${width}" height="9"/><use href="#grad-${uid}"/><use xlink:href="#grad-${uid}"/><use href="#gone-${uid}"/><a href="https://x.y/#keep"/></g><defs><clipPath id="clip-${uid}"><rect width="5" height="5"/></clipPath><linearGradient id="grad-${uid}"/><linearGradient id="grad-${uid}"/></defs></svg>`
    const exports: string[] = []
    for (const markup of [figure(`1e3126d8`), figure(`9b2c44f0`), figure(`1e3126d8`, 8)])
      exports.push(await svg_markup(mount_svg(markup)))
    const [first, second, other] = exports
    expect(first).toBe(second)
    const exported = parse_svg(first)
    const prefix = exported.id.replace(/-0$/, ``)
    expect(prefix).toMatch(/^f[0-9a-z]+$/)
    // two different figures inlined in one page must not share ids
    expect(parse_svg(other).id).not.toBe(exported.id)
    const ids = [exported, ...exported.querySelectorAll(`[id]`)].map((node) => node.id)
    expect(ids).toEqual([0, 1, 2, 2].map((idx) => `${prefix}-${idx}`))
    expect(exported.querySelector(`g`)?.getAttribute(`clip-path`)).toBe(
      `url(#${prefix}-1)`,
    )
    const rect = exported.querySelector(`g > rect`)
    expect(rect?.getAttribute(`fill`)).toBe(`url('#${prefix}-2')`)
    expect(rect?.getAttribute(`style`)).toMatch(
      new RegExp(`url\\(["']?#${prefix}-1["']?\\)`),
    )
    const hrefs = [...exported.querySelectorAll(`use, a`)].map(
      (node) => node.getAttribute(`href`) ?? node.getAttribute(`xlink:href`),
    )
    expect(hrefs).toEqual([
      `#${prefix}-2`,
      `#${prefix}-2`,
      `#${prefix}-3`,
      `https://x.y/#keep`,
    ])
  })

  test(`inlines stylesheet colors and fonts minimally and drops redundant attributes`, async () => {
    const style = document.createElement(`style`)
    style.textContent = `.tick-label { fill: rgb(200, 0, 0); font-size: 13px } .themed { stroke: rgb(0, 0, 200); stroke-width: 3px }`
    document.head.append(style)
    onTestFinished(() => style.remove())
    const exported = await export_svg(
      `<svg viewBox="0 0 100 100" style="cursor: crosshair" class="svelte-4hqm71"><g fill="blue" style="font-weight: 700"><text class="tick-label svelte-1stqk4m svelte-widgets-legend" style="font-weight: normal">1</text><rect class="themed" width="10" height="10"/><circle fill="blue" r="2"/></g></svg>`,
    )
    const [text, rect, circle] = [`text`, `rect`, `circle`].map((tag) =>
      exported.querySelector(tag),
    )
    // class-based styles survive without the page stylesheet...
    expect(text?.getAttribute(`fill`)).toBe(`rgb(200, 0, 0)`)
    expect(text?.getAttribute(`font-size`)).toBe(`13`)
    expect(text?.getAttribute(`font-weight`)).toBe(`400`) // `normal`, as its numeric weight
    expect(rect?.getAttribute(`stroke`)).toBe(`rgb(0, 0, 200)`)
    expect(rect?.getAttribute(`stroke-width`)).toBe(`3`)
    // ...inherited values are written once on the ancestor, not repeated per child
    expect(exported.querySelector(`g`)?.getAttribute(`fill`)).toBe(`blue`)
    expect(circle?.hasAttribute(`fill`)).toBe(false)
    // classes stay as layer names for vector editors, minus Svelte scoping hashes
    expect(text?.getAttribute(`class`)).toBe(`tick-label svelte-widgets-legend`)
    expect(exported.getAttributeNames()).not.toContain(`class`)
    expect(exported.getAttributeNames()).not.toContain(`style`) // interaction-only cursor
  })

  test(`strips hidden, transparent and interaction-only markup but keeps export-only`, async () => {
    const svg = mount_svg(`<svg viewBox="0 0 100 100" role="application" tabindex="0">
      <!-- svelte anchor -->
      <rect class="visible" width="5" height="5" fill="red" data-series-id="a" aria-label="bar"/>
      <rect width="5" height="5" fill="red" display="none"/>
      <rect width="5" height="5" fill="red" opacity="0"/>
      <circle class="marker-hit-target" r="8" fill="transparent"/>
      <line x1="0" x2="5" stroke="transparent" stroke-width="8"/>
      <g data-export-exclude><text>tooltip</text></g>
      <g><rect width="1" height="1" display="none"/></g>
      <text data-export-only display="none">static label</text>
      <defs><clipPath id="clip"><rect width="5" height="5" fill="none"/></clipPath><path id="glyph" fill="rgb(0, 0, 0)" d="M0 0h1"/></defs>
    </svg>`)
    const result = await svg_markup(svg)
    const exported = parse_svg(result)
    expect(exported.querySelectorAll(`rect`)).toHaveLength(2) // the visible one + clip shape
    expect(exported.querySelector(`circle, line`)).toBeNull()
    expect([...exported.querySelectorAll(`text`)].map((el) => el.textContent)).toEqual([
      `static label`,
    ])
    expect(exported.querySelector(`text`)?.hasAttribute(`display`)).toBe(false)
    // <use> content inherits from the use site, so its authored paint can't be elided
    expect(exported.querySelector(`defs path`)?.getAttribute(`fill`)).toBe(`rgb(0, 0, 0)`)
    expect(exported.querySelectorAll(`g`)).toHaveLength(0) // emptied groups are dropped
    expect(exported.querySelector(`clipPath rect`)).not.toBeNull()
    expect(result).not.toMatch(/<!--|data-|aria-|role=|tabindex=/)
  })

  test(`rounds a 100-unit figure to 2 decimals, leaving text, classes, hrefs and url() refs`, async () => {
    const attrs = `clip-path="url(#plot-clip-1a2b3c4d-4f3e-4234-9e12-3e4f5a6b7c8d)" class="x-3e-4" stroke="black"`
    const path = `<path id="p0.123456" d="M1.23456,2.5L-3.00499,4.1234e-7" transform="scale(0.004)" ${attrs}/>`
    const exported = await export_svg(
      `<svg viewBox="0 0 100.123456 100">${path}<text x="10.98765">0.123456</text></svg>`,
    )
    const attr = (name: string) => exported.querySelector(`path`)?.getAttribute(name)
    // ids are renamed (not rounded), and so is a ref to an id outside the figure
    const prefix = attr(`id`)?.replace(/-0$/, ``)
    expect([attr(`d`), attr(`id`)]).toEqual([`M1.23,2.5L-3,0`, `${prefix}-0`])
    expect([attr(`clip-path`), attr(`class`)]).toEqual([`url(#${prefix}-1)`, `x-3e-4`])
    expect(attr(`transform`)).toBe(`scale(0.004)`) // dimensionless factors keep precision
    expect(exported.querySelector(`text`)?.getAttribute(`x`)).toBe(`10.99`)
    expect(exported.querySelector(`text`)?.textContent).toBe(`0.123456`)
    expect(exported.getAttribute(`viewBox`)).toBe(`-0.5 -0.5 101.12 101`)
  })

  // precision follows the viewBox: 2 decimals would zero a mark drawn in tiny user units
  test.each([
    [`0 0 1 1`, [`0.5123`, `0.004`, `1`]],
    [`0 0 0.02 0.004`, [`0.5123457`, `0.004`, `0.004`]],
    [`0 0 1000 400`, [`0.51`, `0`, `400`]],
  ])(`rounds to the precision viewBox=%s resolves`, async (viewbox, expected) => {
    const exported = await export_svg(
      `<svg viewBox="${viewbox}"><circle cx="0.51234567" r="0.004"/></svg>`,
    )
    const circle = exported.querySelector(`circle`)
    expect([
      circle?.getAttribute(`cx`),
      circle?.getAttribute(`r`),
      exported.getAttribute(`height`),
    ]).toEqual(expected)
  })

  // compact path data: rounding must not merge numbers split by a second dot or a sign
  test.each([
    [`M0.99.9999`, `M0.99 1`],
    [`M0.9999.5`, `M1 .5`],
    [`M1-0.001`, `M1 0`],
    [`M0.123.456`, `M0.12 0.46`],
    [`M1.23456-2.5`, `M1.23-2.5`],
    // leading zeros are packed arc flags, not numbers to round
    [`a5 5 0 011.123456 2`, `a5 5 0 011.123456 2`],
  ])(`rounding keeps compact path numbers apart: %s -> %s`, async (d_in, d_out) => {
    const exported = await export_svg(
      `<svg viewBox="0 0 100 100"><path d="${d_in}"/></svg>`,
    )
    expect(exported.querySelector(`path`)?.getAttribute(`d`)).toBe(d_out)
  })

  test(`a 1000-point chart exports at under a third of its raw markup`, async () => {
    const style = document.createElement(`style`)
    style.textContent = `.series { fill: rgb(31, 119, 180); stroke: white; stroke-width: 0.5px }`
    document.head.append(style)
    onTestFinished(() => style.remove())
    const rng = (idx: number) => Math.abs(Math.sin(idx * 12.9898) * 43758.5453) % 400
    const points = Array.from(
      { length: 1000 },
      (_, idx) =>
        `<!----><circle class="pt" cx="${rng(idx)}" cy="${rng(idx + 1)}" r="3" data-point-idx="${idx}" role="button" tabindex="-1" aria-label="point ${idx}"></circle>`,
    ).join(``)
    const svg = mount_svg(
      `<svg viewBox="0 0 400 400"><g class="series">${points}</g></svg>`,
    )
    const result = await svg_markup(svg)
    expect(result.length).toBeLessThan(svg.outerHTML.length / 3)
    const exported = parse_svg(result)
    const circles = exported.querySelectorAll(`circle`)
    expect(circles).toHaveLength(1000)
    // colors inherited from the group are written once there, not on 1000 circles
    expect(exported.querySelector(`g`)?.getAttribute(`fill`)).toBe(`rgb(31, 119, 180)`)
    expect(circles[0].getAttributeNames().toSorted()).toEqual([`class`, `cx`, `cy`, `r`])
  })

  test(`embeds foreign canvases via their export painter at the export scale`, async () => {
    const svg = mount_svg(
      `<svg viewBox="0 0 100 50"><foreignObject x="0" y="0" width="100" height="50"><canvas width="100" height="50"></canvas></foreignObject></svg>`,
    )
    const canvas = svg.querySelector(`canvas`)
    if (!canvas) throw new Error(`canvas not mounted`)
    Object.assign(canvas, { width: 100, height: 50 })
    canvas.toDataURL = () => `data:image/png;base64,LIVE`
    const painter = (label: string) =>
      vi.fn((target: HTMLCanvasElement) => {
        target.toDataURL = () => `data:image/png;base64,${label}`
      })
    const exported_href = async (dpi?: number) =>
      parse_svg(await svg_markup(svg, { dpi })).querySelector(`image`)
    const first = painter(`FIRST`)
    const remove_first = set_export_painter(canvas, first)
    // stored under a registered symbol, so a duplicate copy of the package finds it too
    expect(Reflect.get(canvas, Symbol.for(`svelte-widgets.export-painter`))).toBe(first)
    const image = await exported_href(216)
    expect(first).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLCanvasElement), 3)
    expect(image?.getAttribute(`href`)).toBe(`data:image/png;base64,FIRST`)
    expect(image?.getAttribute(`width`)).toBe(`100`)
    // a stale cleanup keeps the painter that replaced it; the current one's removes it
    const second = painter(`SECOND`)
    const remove_second = set_export_painter(canvas, second)
    remove_first()
    expect((await exported_href())?.getAttribute(`href`)).toBe(
      `data:image/png;base64,SECOND`,
    )
    expect(second).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 2)
    remove_second()
    expect((await exported_href())?.getAttribute(`href`)).toBe(
      `data:image/png;base64,LIVE`,
    )
  })
})

test(`HTML figures redraw backgrounds and text in CSS stacking order, skipping excluded nodes`, async () => {
  // like a split periodic-table tile: value label (z 2) before its segment (z 1) in the DOM
  document.body.innerHTML = `<div class="tile">
    <span style="position: absolute; z-index: 2">18</span>
    <span>Fe</span>
    <div style="position: absolute; z-index: 1; background-color: rgb(0, 0, 255)"></div>
    <i style="position: absolute; z-index: -1; background-color: rgb(0, 255, 0)"></i>
    <figcaption data-export-exclude>hint</figcaption>
    <svg viewBox="0 0 1000 1000"><path style="vector-effect: non-scaling-stroke" d="M0 0h9"/></svg>
  </div>`
  const tile = document.querySelector<HTMLElement>(`.tile`)
  if (!tile) throw new Error(`tile not mounted`)
  vi.spyOn(Element.prototype, `getBoundingClientRect`).mockReturnValue(
    new DOMRect(0, 0, 40, 20),
  )
  vi.spyOn(Range.prototype, `getBoundingClientRect`).mockReturnValue(
    new DOMRect(0, 0, 10, 10),
  )
  const exported = parse_svg(await svg_markup(tile))
  expect(exported.getAttribute(`viewBox`)).toBe(`0 0 40 20`)
  const group = exported.querySelector(`g`)
  const painted = [...(group?.children ?? [])].map((node) =>
    node.localName === `text`
      ? node.textContent
      : (node.getAttribute(`fill`) ?? node.localName),
  )
  expect(painted).toEqual([`rgb(0, 255, 0)`, `Fe`, `svg`, `rgb(0, 0, 255)`, `18`])
  // stretched tile-plot viewBoxes need their strokes kept at screen width
  expect(group?.querySelector(`path`)?.getAttribute(`vector-effect`)).toBe(
    `non-scaling-stroke`,
  )
  // a chart's overlays must not inherit its root's centered text or stroke
  document.body.innerHTML = `<div><svg viewBox="0 0 40 20" text-anchor="middle" stroke="red"></svg><div data-export-overlay><span>legend</span></div></div>`
  const chart = document.querySelector(`svg`)
  if (!chart) throw new Error(`chart not mounted`)
  const overlay = parse_svg(await svg_markup(chart)).querySelector(`svg > g`)
  expect([`text-anchor`, `stroke`].map((attr) => overlay?.getAttribute(attr))).toEqual([
    `start`,
    `none`,
  ])
  expect(overlay?.querySelector(`text`)?.textContent).toBe(`legend`)
})

describe(`export_figure as PNG`, () => {
  let mock_canvas_element: HTMLCanvasElement
  let object_url: ReturnType<typeof mock_object_url>

  beforeEach(() => {
    mock_canvas_element = mock_offscreen_canvas()
    object_url = mock_object_url()
    mock_image(`load`)
  })

  // one row per svg_viewbox() rejection branch (length !== 4, non-finite, width/height <= 0)
  // and per invalid DPI
  test.each<[string | undefined, number, string]>([
    [undefined, 72, `Invalid SVG dimensions for PNG export`],
    [`0 0`, 72, `Invalid SVG dimensions for PNG export`],
    [`0 0 foo 100`, 72, `Invalid SVG dimensions for PNG export`],
    [`0 0 0 100`, 72, `Invalid SVG dimensions for PNG export`],
    [`0 0 100 -50`, 72, `Invalid SVG dimensions for PNG export`],
    [`0 0 100 100`, 0, `Invalid PNG DPI`],
    [`0 0 100 100`, NaN, `Invalid PNG DPI`],
  ])(`rejects viewBox %s at %s DPI`, async (viewbox, dpi, message) => {
    await expect(png_of(make_svg(viewbox), dpi)).rejects.toThrow(message)
  })

  // CSS sizes (100x50px) override the width/height attributes (80x40): export follows the
  // rendered viewport when there is no viewBox, and pads by half the widest stroke. 1 DPI
  // rounds 10 viewBox units to 0 without the >=1px clamp; 1440 DPI is capped at 10x.
  test.each<[string | undefined, number, number, [number, number], string]>([
    [`0,0,100,100`, 72, 0, [100, 100], `0 0 100 100`],
    [`0 0 100 100`, 1440, 0, [1000, 1000], `0 0 100 100`],
    [`0 0 10 10`, 1, 0, [1, 1], `0 0 10 10`],
    [undefined, 144, 0, [200, 100], `0 0 100 50`],
    [undefined, 144, 4, [208, 108], `-2 -2 104 54`],
    [`0 0 100 50`, 144, 0, [200, 100], `0 0 100 50`],
    [`0 0 100 50`, 144, 4, [208, 108], `-2 -2 104 54`],
  ])(
    `rasterizes viewBox %s at %s DPI with stroke %s to %j px`,
    async (source_viewbox, dpi, stroke, size, viewbox) => {
      const svg = make_svg(source_viewbox)
      svg.setAttribute(`width`, `80`)
      svg.setAttribute(`height`, `40`)
      svg.style.width = `100px`
      svg.style.height = `50px`
      if (stroke) {
        const rect = document.createElementNS(`http://www.w3.org/2000/svg`, `rect`)
        rect.setAttribute(`stroke`, `red`)
        rect.setAttribute(`stroke-width`, String(stroke))
        svg.append(rect)
      }
      document.body.append(svg)
      // the declared DPI is the one rendered, past dpi_to_scale's 720 DPI cap
      expect((await read_png(await png_of(svg, dpi))).dpi).toBeCloseTo(
        Math.min(dpi, 720),
        1,
      )
      expect([mock_canvas_element.width, mock_canvas_element.height]).toEqual(size)
      const svg_blob = object_url.create.mock.calls[0][0] as Blob
      expect(svg_blob.type).toBe(`image/svg+xml;charset=utf-8`)
      const exported = parse_svg(await svg_blob.text())
      expect(exported.getAttribute(`viewBox`)).toBe(viewbox)
      expect(exported.getAttribute(`width`)).toBe(String(size[0]))
      expect(exported.getAttribute(`height`)).toBe(String(size[1]))
      expect(exported.hasAttribute(`style`)).toBe(false) // CSS size became attributes
      expect(svg.style.width).toBe(`100px`)
      expect(svg.getAttribute(`width`)).toBe(`80`)
      expect(svg.getAttribute(`viewBox`)).toBe(source_viewbox ?? null)
    },
  )

  test(`rejects when canvas 2D context unavailable`, async () => {
    // createElementNS: createElement is mocked
    const canvas = document.createElementNS(`http://www.w3.org/1999/xhtml`, `canvas`)
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError(`expected a canvas`)
    Object.assign(canvas, { width: 3, height: 3 })
    vi.spyOn(document, `createElement`).mockReturnValue({
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLElement)
    await expect(png_of(make_svg(`0 0 100 100`))).rejects.toThrow(
      `Canvas 2D context not available`,
    )
    // a rejection, not a synchronous throw, so promise-chained callers see it too: a canvas
    // root drawn at a size other than its own needs a 2D context as well
    await expect(export_figure(canvas, { format: `png` })).rejects.toThrow(
      `Canvas 2D context not available`,
    )
  })

  test.each([
    [`success`, `load`, null],
    [`empty`, `load`, `Failed to generate PNG`],
    [`throw`, `load`, `encoding failed`],
    [`timeout`, `load`, `toBlob timed out`],
    [`image-throw`, `throw`, `image setup failed`],
    [`image-error`, `error`, `Failed to load SVG for PNG export`],
    [`image-timeout`, `never`, `SVG image load timed out`],
    [`image-slow`, `load`, null],
  ] as const)(`PNG export cleanup: %s`, async (outcome, image_event, message) => {
    vi.useFakeTimers()
    const images = mock_image(image_event, outcome === `image-slow` ? 40_000 : 0)
    if ([`empty`, `throw`, `timeout`].includes(outcome))
      vi.mocked(mock_canvas_element.toBlob).mockImplementation((callback) => {
        if (outcome === `throw`) throw new Error(`encoding failed`)
        if (outcome === `empty`) callback(null)
      })
    const size = outcome === `image-slow` ? 4000 : 100
    const result = png_of(make_svg(`0 0 ${size} ${size}`), 72).catch(
      (error: unknown) => error,
    )
    await vi.runAllTimersAsync()
    if (message)
      expect(await result).toMatchObject({ message: expect.stringContaining(message) })
    else expect(await result).toBeInstanceOf(Blob)
    expect(object_url.revoke).toHaveBeenCalledExactlyOnceWith(`blob:test-url`)
    expect(vi.getTimerCount()).toBe(0)
    if (image_event !== `load`) {
      images[0].dispatchEvent(new Event(`load`))
      await Promise.resolve()
      expect(mock_canvas_element.getContext(`2d`)?.drawImage).not.toHaveBeenCalled()
      expect(mock_canvas_element.toBlob).not.toHaveBeenCalled()
    }
  })
})

describe(`export_figure of a canvas`, () => {
  // a frame canvas with a canvas layer over its right half and an HTML legend, the frame
  // laid out at 40x20 CSS px
  const mount_scene = () => {
    document.body.innerHTML = `<div><canvas class="frame"></canvas><canvas class="layer"></canvas><div class="legend" style="background-color: rgb(255, 0, 0)"><span>Fe</span></div></div>`
    const [frame, layer] = document.querySelectorAll(`canvas`)
    const legend = document.querySelector<HTMLElement>(`.legend`)
    if (!frame || !layer || !legend) throw new Error(`scene not mounted`)
    layer.toDataURL = () => `data:image/png;base64,LAYER`
    vi.spyOn(Element.prototype, `getBoundingClientRect`).mockImplementation(function (
      this: Element,
    ) {
      return this === layer ? new DOMRect(30, 15, 20, 10) : new DOMRect(10, 10, 40, 20)
    })
    vi.spyOn(Range.prototype, `getBoundingClientRect`).mockReturnValue(
      new DOMRect(12, 12, 10, 10),
    )
    const render_frame = vi.fn(async () => png_blob())
    return { frame, layer, legend, render_frame }
  }

  test(`SVG embeds the frame, then canvas layers, then HTML overlays as vectors`, async () => {
    const { frame, layer, legend, render_frame } = mount_scene()
    const blob = await export_figure(frame, {
      format: `svg`,
      dpi: 216,
      background: `white`,
      overlays: [legend, layer],
      render_frame,
    })
    expect(render_frame).toHaveBeenCalledExactlyOnceWith(frame, 216)
    expect(blob.type).toBe(`image/svg+xml`)
    const exported = parse_svg(await blob.text())
    expect(
      [`viewBox`, `width`, `height`].map((attr) => exported.getAttribute(attr)),
    ).toEqual([`0 0 40 20`, `40`, `20`])
    const layers = [...exported.children].map(
      (node) =>
        `${node.localName} ${node.getAttribute(`fill`) ?? node.getAttribute(`href`)?.slice(0, 27) ?? ``}`,
    )
    expect(layers).toEqual([
      `rect white`, // the backdrop, under everything
      `image data:image/png;base64,iVBOR`,
      `image data:image/png;base64,LAYER`,
      `g `,
    ])
    const layer_image = exported.querySelectorAll(`image`)[1]
    expect(
      [`x`, `y`, `width`, `height`].map((attr) => layer_image.getAttribute(attr)),
    ).toEqual([`20`, `5`, `20`, `10`])
    expect(exported.querySelector(`g text`)?.textContent).toBe(`Fe`)
    expect(exported.querySelector(`g rect`)?.getAttribute(`fill`)).toBe(`rgb(255, 0, 0)`)
  })

  test(`PNG composites frame, layers and the rasterized HTML overlays at export resolution`, async () => {
    const { frame, layer, legend, render_frame } = mount_scene()
    // without overlays or a backdrop the frame is the file
    const frame_png = png_blob()
    render_frame.mockResolvedValueOnce(frame_png)
    expect(await export_figure(frame, { format: `png`, render_frame })).toBe(frame_png)
    const target = mock_offscreen_canvas()
    const object_url = mock_object_url()
    const images = mock_image(`load`)
    const bitmap = { close: vi.fn() }
    vi.stubGlobal(
      `createImageBitmap`,
      vi.fn(async () => bitmap),
    )
    const png = await export_figure(frame, {
      format: `png`,
      background: `white`,
      overlays: [legend, layer],
      render_frame,
    })
    expect((await read_png(png)).dpi).toBeCloseTo(144, 1)
    expect([target.width, target.height]).toEqual([80, 40])
    target.getContext(`2d`)
    const ctx = target.getContext.mock.results[0].value as Record<
      `scale` | `fillRect` | `drawImage`,
      ReturnType<typeof vi.fn>
    > & { fillStyle?: string }
    expect(ctx.scale).toHaveBeenCalledExactlyOnceWith(2, 2)
    expect(ctx.fillStyle).toBe(`white`)
    expect(ctx.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 40, 20)
    expect(ctx.drawImage.mock.calls).toEqual([
      [bitmap, 0, 0, 40, 20],
      [layer, 20, 5, 20, 10],
      [images[0], 0, 0, 40, 20],
    ])
    expect(bitmap.close).toHaveBeenCalledOnce()
    // the HTML overlays rasterize sized in export pixels, without the canvas layer
    const overlay_svg = parse_svg(
      await (object_url.create.mock.calls[0][0] as Blob).text(),
    )
    expect(
      [`width`, `height`, `viewBox`].map((attr) => overlay_svg.getAttribute(attr)),
    ).toEqual([`80`, `40`, `0 0 40 20`])
    expect(overlay_svg.querySelector(`text`)?.textContent).toBe(`Fe`)
    expect(overlay_svg.querySelector(`image`)).toBeNull()
    // a backdrop alone still composites: the frame is drawn over it
    ctx.drawImage.mockClear()
    await export_figure(frame, { format: `png`, background: `black`, render_frame })
    expect(ctx.fillStyle).toBe(`black`)
    expect(ctx.drawImage.mock.calls).toEqual([[bitmap, 0, 0, 40, 20]])
  })

  // a layer with a painter (an annotation canvas) is redrawn at export scale, not upscaled
  test(`canvas layers repaint through their export painter at the export scale`, async () => {
    const { frame, layer, render_frame } = mount_scene()
    const painter = vi.fn((target: HTMLCanvasElement) => {
      target.toDataURL = () => `data:image/png;base64,PAINTED`
    })
    set_export_painter(layer, painter)
    const svg_blob = await export_figure(frame, {
      format: `svg`,
      dpi: 216,
      overlays: [layer],
      render_frame,
    })
    expect(painter).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLCanvasElement), 3)
    const layer_image = parse_svg(await svg_blob.text()).querySelectorAll(`image`)[1]
    expect(
      [`href`, `x`, `y`, `width`, `height`].map((attr) => layer_image.getAttribute(attr)),
    ).toEqual([`data:image/png;base64,PAINTED`, `20`, `5`, `20`, `10`])

    painter.mockClear()
    const target = mock_offscreen_canvas()
    const bitmap = { close: vi.fn() }
    vi.stubGlobal(
      `createImageBitmap`,
      vi.fn(async () => bitmap),
    )
    await export_figure(frame, { format: `png`, overlays: [layer], render_frame })
    expect(painter).toHaveBeenCalledExactlyOnceWith(target, 2)
    const ctx = target.getContext.mock.results[0].value as {
      drawImage: ReturnType<typeof vi.fn>
    }
    expect(ctx.drawImage.mock.calls).toEqual([
      [bitmap, 0, 0, 40, 20],
      [target, 20, 5, 20, 10],
    ])
  })

  test(`the default frame repaints through the export painter at the export scale`, async () => {
    const { frame } = mount_scene()
    const target = mock_offscreen_canvas()
    const painter = vi.fn()
    set_export_painter(frame, painter)
    const png = await export_figure(frame, { format: `png`, dpi: 216 })
    expect(painter).toHaveBeenCalledExactlyOnceWith(target, 3)
    expect((await read_png(png)).dpi).toBeCloseTo(216, 1)
  })

  test.each([
    [`an unlaid canvas`, `canvas`, `Cannot export a canvas that has not been laid out`],
    [
      `overlays on an SVG root`,
      `svg`,
      `overlays and render_frame apply to canvas figures only`,
    ],
  ])(`rejects %s`, async (_label, root_kind, message) => {
    const { frame, legend, render_frame } = mount_scene()
    vi.spyOn(Element.prototype, `getBoundingClientRect`).mockReturnValue(new DOMRect())
    const root = root_kind === `canvas` ? frame : make_svg(`0 0 10 10`)
    await expect(
      // @ts-expect-error -- the overloads keep canvas-only options off non-canvas roots
      export_figure(root, { format: `svg`, overlays: [legend], render_frame }),
    ).rejects.toThrow(message)
    // checked before the (possibly GPU) frame render
    expect(render_frame).not.toHaveBeenCalled()
  })
})

test(`a background paints the whole padded viewBox behind an SVG figure`, async () => {
  const svg = mount_svg(
    `<svg viewBox="0 0 100 50" aria-label="Chart"><rect width="10" height="10" stroke="black" stroke-width="4"/></svg>`,
  )
  const exported = parse_svg(await svg_markup(svg, { background: `rgb(1, 2, 3)` }))
  const [title, backdrop] = exported.children
  expect(title.localName).toBe(`title`)
  expect(
    [`x`, `y`, `width`, `height`, `fill`].map((attr) => backdrop.getAttribute(attr)),
  ).toEqual([`-2`, `-2`, `100%`, `100%`, `rgb(1, 2, 3)`])
  expect(exported.getAttribute(`viewBox`)).toBe(`-2 -2 104 54`)
})

// Computed color-bar backgrounds, whose colors carry their own commas, become SVG gradients.
// Only the `to right` / `to top` form is recognized; any other background paints nothing.
// oxfmt-ignore
test.each([
  [`linear-gradient(to right, rgb(0, 0, 255) 0%, rgb(255, 0, 0) 100%)`, { vector: [`0`, `0.5`, `1`, `0.5`], stops: [[`rgb(0, 0, 255)`, `0%`], [`rgb(255, 0, 0)`, `100%`]] }],
  [`linear-gradient(to top, red 0%, rgba(0, 128, 0, 0.5) 50%, blue 100%)`, { vector: [`0.5`, `1`, `0.5`, `0`], stops: [[`red`, `0%`], [`rgba(0, 128, 0, 0.5)`, `50%`], [`blue`, `100%`]] }],
  // Chrome's computed value for evenly spaced stops omits their offsets
  [`linear-gradient(to right, rgb(68, 1, 84), rgb(33, 145, 140), rgb(253, 231, 37))`, { vector: [`0`, `0.5`, `1`, `0.5`], stops: [[`rgb(68, 1, 84)`, `0%`], [`rgb(33, 145, 140)`, `50%`], [`rgb(253, 231, 37)`, `100%`]] }],
  // no direction is `to bottom`; angles map onto the bounding box
  [`linear-gradient(red, blue)`, { vector: [`0.5`, `0`, `0.5`, `1`], stops: [[`red`, `0%`], [`blue`, `100%`]] }],
  [`linear-gradient(270deg, red 0%, blue 100%)`, { vector: [`1`, `0.5`, `0`, `0.5`], stops: [[`red`, `0%`], [`blue`, `100%`]] }],
  [`linear-gradient(to top right, red, blue)`, null],
  [`linear-gradient(0.5turn, red, blue)`, null],
  [`none`, null],
])(`HTML figures redraw background %s as an SVG gradient`, async (background, expected) => {
  const bar = document.createElement(`div`)
  bar.style.backgroundImage = background
  document.body.replaceChildren(bar)
  vi.spyOn(Element.prototype, `getBoundingClientRect`).mockReturnValue(new DOMRect(0, 0, 40, 20))
  const svg = parse_svg(await svg_markup(bar))
  const gradient = svg.querySelector(`linearGradient`)
  const rect = svg.querySelector(`rect`)
  if (!expected) {
    expect([gradient, rect]).toEqual([null, null])
    return
  }
  expect([`x1`, `y1`, `x2`, `y2`].map((attr) => gradient?.getAttribute(attr))).toEqual(expected.vector)
  const stops = [...(gradient?.children ?? [])].map((stop) => [stop.getAttribute(`stop-color`), stop.getAttribute(`offset`)])
  expect(stops).toEqual(expected.stops)
  expect(rect?.getAttribute(`fill`)).toBe(`url(#${gradient?.id})`)
})
