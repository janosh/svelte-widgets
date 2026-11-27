import {
  canvas_painters,
  dpi_to_scale,
  html_to_svg,
  observe_canvas_presence,
  paint_png_blob,
  set_png_dpi,
  svg_to_png_blob,
  svg_to_string,
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
    getContext: vi
      .fn()
      .mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn(), scale: vi.fn() }),
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

describe(`svg_to_string`, () => {
  test.each([
    [undefined, false],
    [`0 0 200 150`, false],
    [`0 0 100 100`, true],
  ])(
    `emits standalone SVG with viewBox=%s, xmlns=%s without mutation`,
    (viewbox, xmlns) => {
      const svg = make_svg(viewbox)
      if (xmlns) svg.setAttribute(`xmlns`, `http://www.w3.org/2000/svg`)
      const original_attrs = svg.attributes.length
      const result = svg_to_string(svg)
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
    ({ attribute_width, style_width, expected }) => {
      const svg = make_svg(`0 0 100 50`)
      const rect = document.createElementNS(`http://www.w3.org/2000/svg`, `rect`)
      rect.setAttribute(`stroke`, `black`)
      rect.setAttribute(`stroke-width`, attribute_width)
      if (style_width) rect.style.strokeWidth = style_width
      svg.append(rect)
      expect(svg_to_string(svg)).toContain(`viewBox="${expected}"`)
      expect(svg.getAttribute(`viewBox`)).toBe(`0 0 100 50`)
    },
  )

  test(`renames random ids stably per figure, with every same-document reference`, () => {
    // refs before their defs, spaced and double-quoted url(), xlink:href, a duplicate id,
    // an id on the root and a ref to an id outside the figure
    const figure = (uid: string, width = 9) =>
      `<svg id="root-${uid}" viewBox="0 0 10 10"><g clip-path="url( #clip-${uid} )"><rect fill="url('#grad-${uid}')" style='mask: url("#clip-${uid}")' width="${width}" height="9"/><use href="#grad-${uid}"/><use xlink:href="#grad-${uid}"/><use href="#gone-${uid}"/><a href="https://x.y/#keep"/></g><defs><clipPath id="clip-${uid}"><rect width="5" height="5"/></clipPath><linearGradient id="grad-${uid}"/><linearGradient id="grad-${uid}"/></defs></svg>`
    const [first, second, other] = [
      figure(`1e3126d8`),
      figure(`9b2c44f0`),
      figure(`1e3126d8`, 8),
    ].map((markup) => {
      document.body.innerHTML = markup
      const svg = document.querySelector(`svg`)
      if (!svg) throw new Error(`svg not mounted`)
      return svg_to_string(svg)
    })
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

  test(`inlines stylesheet colors and fonts minimally and drops redundant attributes`, () => {
    const style = document.createElement(`style`)
    style.textContent = `.tick-label { fill: rgb(200, 0, 0); font-size: 13px } .themed { stroke: rgb(0, 0, 200); stroke-width: 3px }`
    document.head.append(style)
    onTestFinished(() => style.remove())
    document.body.innerHTML = `<svg viewBox="0 0 100 100" style="cursor: crosshair" class="svelte-4hqm71"><g fill="blue"><text class="tick-label svelte-1stqk4m">1</text><rect class="themed" width="10" height="10"/><circle fill="blue" r="2"/></g></svg>`
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`svg not mounted`)
    const exported = parse_svg(svg_to_string(svg))
    const [text, rect, circle] = [`text`, `rect`, `circle`].map((tag) =>
      exported.querySelector(tag),
    )
    // class-based styles survive without the page stylesheet...
    expect(text?.getAttribute(`fill`)).toBe(`rgb(200, 0, 0)`)
    expect(text?.getAttribute(`font-size`)).toBe(`13`)
    expect(rect?.getAttribute(`stroke`)).toBe(`rgb(0, 0, 200)`)
    expect(rect?.getAttribute(`stroke-width`)).toBe(`3`)
    // ...inherited values are written once on the ancestor, not repeated per child
    expect(exported.querySelector(`g`)?.getAttribute(`fill`)).toBe(`blue`)
    expect(circle?.hasAttribute(`fill`)).toBe(false)
    // classes stay as layer names for vector editors, minus Svelte scoping hashes
    expect(text?.getAttribute(`class`)).toBe(`tick-label`)
    expect(exported.getAttributeNames()).not.toContain(`class`)
    expect(exported.getAttributeNames()).not.toContain(`style`) // interaction-only cursor
  })

  test(`strips hidden, transparent and interaction-only markup but keeps export-only`, () => {
    document.body.innerHTML = `<svg viewBox="0 0 100 100" role="application" tabindex="0">
      <!-- svelte anchor -->
      <rect class="visible" width="5" height="5" fill="red" data-series-id="a" aria-label="bar"/>
      <rect width="5" height="5" fill="red" display="none"/>
      <rect width="5" height="5" fill="red" opacity="0"/>
      <circle class="marker-hit-target" r="8" fill="transparent"/>
      <line x1="0" x2="5" stroke="transparent" stroke-width="8"/>
      <g data-export-exclude><text>tooltip</text></g>
      <g><rect width="1" height="1" display="none"/></g>
      <text data-export-only display="none">static label</text>
      <defs><clipPath id="clip"><rect width="5" height="5" fill="none"/></clipPath></defs>
    </svg>`
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`svg not mounted`)
    const result = svg_to_string(svg)
    const exported = parse_svg(result)
    expect(exported.querySelectorAll(`rect`)).toHaveLength(2) // the visible one + clip shape
    expect(exported.querySelector(`circle, line`)).toBeNull()
    expect([...exported.querySelectorAll(`text`)].map((el) => el.textContent)).toEqual([
      `static label`,
    ])
    expect(exported.querySelector(`text`)?.hasAttribute(`display`)).toBe(false)
    expect(exported.querySelectorAll(`g`)).toHaveLength(0) // emptied groups are dropped
    expect(exported.querySelector(`clipPath rect`)).not.toBeNull()
    expect(result).not.toMatch(/<!--|data-|aria-|role=|tabindex=/)
  })

  test(`rounds a 100-unit figure to 2 decimals, leaving text, classes, hrefs and url() refs`, () => {
    const attrs = `clip-path="url(#plot-clip-1a2b3c4d-4f3e-4234-9e12-3e4f5a6b7c8d)" class="x-3e-4" stroke="black"`
    const path = `<path id="p0.123456" d="M1.23456,2.5L-3.00499,4.1234e-7" ${attrs}/>`
    document.body.innerHTML = `<svg viewBox="0 0 100.123456 100">${path}<text x="10.98765">0.123456</text></svg>`
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`svg not mounted`)
    const exported = parse_svg(svg_to_string(svg))
    const attr = (name: string) => exported.querySelector(`path`)?.getAttribute(name)
    // ids are renamed (not rounded), and so is a ref to an id outside the figure
    const prefix = attr(`id`)?.replace(/-0$/, ``)
    expect([attr(`d`), attr(`id`)]).toEqual([`M1.23,2.5L-3,0`, `${prefix}-0`])
    expect([attr(`clip-path`), attr(`class`)]).toEqual([`url(#${prefix}-1)`, `x-3e-4`])
    expect(exported.querySelector(`text`)?.getAttribute(`x`)).toBe(`10.99`)
    expect(exported.querySelector(`text`)?.textContent).toBe(`0.123456`)
    expect(exported.getAttribute(`viewBox`)).toBe(`-0.5 -0.5 101.12 101`)
  })

  // precision follows the viewBox: 2 decimals would zero a mark drawn in tiny user units
  test.each([
    [`0 0 1 1`, [`0.5123`, `0.004`, `1`]],
    [`0 0 0.02 0.004`, [`0.5123457`, `0.004`, `0.004`]],
    [`0 0 1000 400`, [`0.51`, `0`, `400`]],
  ])(`rounds to the precision viewBox=%s resolves`, (viewbox, expected) => {
    document.body.innerHTML = `<svg viewBox="${viewbox}"><circle cx="0.51234567" r="0.004"/></svg>`
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`svg not mounted`)
    const exported = parse_svg(svg_to_string(svg))
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
  ])(`rounding keeps compact path numbers apart: %s -> %s`, (d_in, d_out) => {
    document.body.innerHTML = `<svg viewBox="0 0 100 100"><path d="${d_in}"/></svg>`
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`svg not mounted`)
    expect(parse_svg(svg_to_string(svg)).querySelector(`path`)?.getAttribute(`d`)).toBe(
      d_out,
    )
  })

  test(`a 1000-point chart exports at under a third of its raw markup`, () => {
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
    document.body.innerHTML = `<svg viewBox="0 0 400 400"><g class="series">${points}</g></svg>`
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`svg not mounted`)
    const result = svg_to_string(svg)
    expect(result.length).toBeLessThan(svg.outerHTML.length / 3)
    const circles = parse_svg(result).querySelectorAll(`circle`)
    expect(circles).toHaveLength(1000)
    // colors inherited from the group are written once there, not on 1000 circles
    expect(parse_svg(result).querySelector(`g`)?.getAttribute(`fill`)).toBe(
      `rgb(31, 119, 180)`,
    )
    expect(circles[0].getAttributeNames().toSorted()).toEqual([`class`, `cx`, `cy`, `r`])
  })

  test(`embeds foreign canvases via their registered painter at the export scale`, () => {
    document.body.innerHTML = `<svg viewBox="0 0 100 50"><foreignObject x="0" y="0" width="100" height="50"><canvas width="100" height="50"></canvas></foreignObject></svg>`
    const canvas = document.querySelector(`canvas`)
    const svg = document.querySelector(`svg`)
    if (!canvas || !svg) throw new Error(`canvas not mounted`)
    Object.assign(canvas, { width: 100, height: 50 })
    const painter = vi.fn((target: HTMLCanvasElement) => {
      target.toDataURL = () => `data:image/png;base64,PAINTED`
    })
    canvas_painters.set(canvas, painter)
    const image = parse_svg(svg_to_string(svg)).querySelector(`image`)
    expect(painter).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLCanvasElement), 2)
    expect(image?.getAttribute(`href`)).toBe(`data:image/png;base64,PAINTED`)
    expect(image?.getAttribute(`width`)).toBe(`100`)
  })
})

test(`html_to_svg redraws an HTML grid's cell backgrounds and text as SVG`, () => {
  document.body.innerHTML = `<div class="grid"><span style="background-color: rgb(255, 0, 0)">Fe</span></div>`
  const grid = document.querySelector<HTMLElement>(`.grid`)
  if (!grid) throw new Error(`grid not mounted`)
  vi.spyOn(Element.prototype, `getBoundingClientRect`).mockReturnValue(
    new DOMRect(0, 0, 40, 20),
  )
  const exported = parse_svg(svg_to_string(html_to_svg(grid)))
  expect(exported.getAttribute(`viewBox`)).toBe(`0 0 40 20`)
  expect(exported.querySelector(`rect`)?.getAttribute(`fill`)).toBe(`rgb(255, 0, 0)`)
})

test(`html_to_svg paints children in CSS stacking order and skips export-excluded nodes`, () => {
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
  const group = parse_svg(svg_to_string(html_to_svg(tile))).querySelector(`g`)
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
})

describe(`svg_to_png_blob`, () => {
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
    await expect(svg_to_png_blob(make_svg(viewbox), dpi)).rejects.toThrow(message)
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
      expect((await read_png(await svg_to_png_blob(svg, dpi))).dpi).toBeCloseTo(
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
      expect(svg.style.width).toBe(`100px`)
      expect(svg.getAttribute(`width`)).toBe(`80`)
      expect(svg.getAttribute(`viewBox`)).toBe(source_viewbox ?? null)
    },
  )

  test(`rejects when canvas 2D context unavailable`, async () => {
    vi.spyOn(document, `createElement`).mockReturnValue({
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLElement)
    await expect(svg_to_png_blob(make_svg(`0 0 100 100`))).rejects.toThrow(
      `Canvas 2D context not available`,
    )
    // a rejection, not a synchronous throw, so promise-chained callers see it too
    await expect(paint_png_blob(1, 1, 1, () => {})).rejects.toThrow(
      `Canvas 2D context not available`,
    )
  })

  test.each([
    [`success`, `load`, null],
    [`empty`, `load`, `Failed to generate high-resolution PNG`],
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
    const result = svg_to_png_blob(make_svg(`0 0 ${size} ${size}`), 72).catch(
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

// Computed color-bar backgrounds, whose colors carry their own commas, become SVG gradients.
// Only the `to right` / `to top` form is recognized; any other background paints nothing.
// oxfmt-ignore
test.each([
  [`linear-gradient(to right, rgb(0, 0, 255) 0%, rgb(255, 0, 0) 100%)`, { vector: [`0`, `0`, `1`, `0`], stops: [[`rgb(0, 0, 255)`, `0%`], [`rgb(255, 0, 0)`, `100%`]] }],
  [`linear-gradient(to top, red 0%, rgba(0, 128, 0, 0.5) 50%, blue 100%)`, { vector: [`0`, `1`, `0`, `0`], stops: [[`red`, `0%`], [`rgba(0, 128, 0, 0.5)`, `50%`], [`blue`, `100%`]] }],
  // Chrome's computed value for evenly spaced stops omits their offsets
  [`linear-gradient(to right, rgb(68, 1, 84), rgb(33, 145, 140), rgb(253, 231, 37))`, { vector: [`0`, `0`, `1`, `0`], stops: [[`rgb(68, 1, 84)`, `0%`], [`rgb(33, 145, 140)`, `50%`], [`rgb(253, 231, 37)`, `100%`]] }],
  [`linear-gradient(red, blue)`, null],
  [`none`, null],
])(`html_to_svg redraws background %s as an SVG gradient`, (background, expected) => {
  const bar = document.createElement(`div`)
  bar.style.backgroundImage = background
  document.body.replaceChildren(bar)
  vi.spyOn(Element.prototype, `getBoundingClientRect`).mockReturnValue(new DOMRect(0, 0, 40, 20))
  const svg = html_to_svg(bar)
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
