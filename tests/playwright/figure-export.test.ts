// Real-browser coverage for figure export: computed stylesheet values and laid-out overlays
import { expect, test, type Page } from '@playwright/test'
import process from 'node:process'
import { build } from 'vite'
import type * as FigureExport from '../../src/lib/figure-export'

// The module bundled for the page (see attachments.test.ts for why NODE_ENV is restored)
let bundle: string | undefined
const load_figure_export = async (page: Page, html: string): Promise<void> => {
  if (!bundle) {
    const node_env = process.env.NODE_ENV
    const result = await build({
      configFile: false,
      logLevel: `silent`,
      build: {
        write: false,
        minify: false,
        lib: {
          entry: `${process.cwd()}/src/lib/figure-export.ts`,
          formats: [`iife`],
          name: `figure_export`,
        },
      },
    }).finally(() => {
      if (node_env === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = node_env
    })
    const [output] = Array.isArray(result) ? result : [result]
    if (!output || !(`output` in output)) throw new Error(`expected one bundle`)
    bundle = output.output[0].code
  }
  // a real http document, so computed url() values resolve as they would on a site
  await page.route(`https://figure.test/`, (route) =>
    route.fulfill({ contentType: `text/html`, body: `<!doctype html>${html}` }),
  )
  await page.goto(`https://figure.test/`)
  await page.addScriptTag({ content: bundle })
}

type Module = { figure_export: typeof FigureExport }

test(`exports a stylesheet clip-path with its reference renamed alongside the clipPath`, async ({
  page,
}) => {
  await load_figure_export(
    page,
    `<style>.plot { clip-path: url(#plot-clip) }</style>
    <svg viewBox="0 0 100 100" width="100" height="100">
      <defs><clipPath id="plot-clip"><rect width="50" height="50"/></clipPath>
      <clipPath id="authored-clip"><rect width="20" height="20"/></clipPath></defs>
      <g class="plot"><rect width="100" height="100" fill="red"/></g>
      <g clip-path="url(#authored-clip)"><rect width="100" height="100" fill="blue"/></g>
    </svg>`,
  )
  const clips = await page.evaluate(async () => {
    const { export_figure } = (globalThis as unknown as Module).figure_export
    const svg = document.querySelector(`svg`)
    if (!svg) throw new Error(`missing svg`)
    const exported = new DOMParser().parseFromString(
      await (await export_figure(svg, { format: `svg` })).text(),
      `image/svg+xml`,
    ).documentElement
    // each group's clip-path must name a clipPath in the file, with the expected rect
    return [...exported.querySelectorAll(`g`)].map((group) => {
      const ref = /url\(["']?#(?<id>[^"')]+)["']?\)/.exec(
        group.getAttribute(`clip-path`) ?? ``,
      )?.groups?.id
      return (
        ref && exported.querySelector(`clipPath[id="${ref}"] rect`)?.getAttribute(`width`)
      )
    })
  })
  expect(clips).toEqual([`50`, `20`])
})

// overlay boxes are measured in CSS px, so a viewBox scaling or offsetting user units must
// map them back: the file re-rendered at the original size must reproduce their screen boxes
for (const [viewbox, size] of [
  [`0 0 1000 500`, `width: 500px; height: 250px`],
  [`-100 -50 1000 500`, `width: 500px; height: 500px`], // meet letterboxes vertically
  [`0 0 2 1`, `width: 1200px; height: 600px`], // a 1/600 scale rounding would skew
  [`0 0 400 300`, `width: 400px; height: 300px`], // user units = px
]) {
  test(`overlays keep their screen boxes in viewBox=${viewbox} at ${size}`, async ({
    page,
  }) => {
    await load_figure_export(
      page,
      `<body style="margin: 0"><div style="position: relative; ${size}">
        <svg viewBox="${viewbox}" style="display: block; ${size}"></svg>
        <div data-export-overlay style="position: absolute; left: 100px; top: 50px; width: 50px; height: 20px; background: red; font-size: 10px">
          <span style="background: blue">label</span>
        </div>
      </div></body>`,
    )
    const boxes = await page.evaluate(async (style) => {
      const { export_figure } = (globalThis as unknown as Module).figure_export
      const svg = document.querySelector(`svg`)
      if (!svg) throw new Error(`missing svg`)
      const live = [...document.querySelectorAll(`[data-export-overlay], span`)]
      const exported = new DOMParser().parseFromString(
        await (await export_figure(svg, { format: `svg` })).text(),
        `image/svg+xml`,
      ).documentElement
      exported.setAttribute(`style`, `display: block; ${style}`)
      const host = document.createElement(`div`)
      host.style.cssText = `position: absolute; left: 0; top: 0`
      host.append(exported)
      document.body.append(host)
      const relative = (rect: DOMRect, origin: DOMRect) =>
        [rect.x - origin.x, rect.y - origin.y, rect.width, rect.height].map(Math.round)
      return {
        transform: exported.querySelector(`g`)?.getAttribute(`transform`) ?? null,
        live: live.map((el) =>
          relative(el.getBoundingClientRect(), svg.getBoundingClientRect()),
        ),
        exported: [...exported.querySelectorAll(`rect`)].map((rect) =>
          relative(rect.getBoundingClientRect(), exported.getBoundingClientRect()),
        ),
      }
    }, size)
    expect(boxes.exported).toEqual(boxes.live)
    // user units already in px leave the overlay untransformed
    if (viewbox === `0 0 400 300`) expect(boxes.transform).toBeNull()
  })
}

// canvas roots composite in the browser: the frame (here the canvas's own pixels), a canvas
// layer at its box and HTML redrawn over both, all at the export resolution
test(`canvas figures composite frame, canvas layers and HTML overlays into the PNG`, async ({
  page,
}) => {
  await load_figure_export(
    page,
    `<body style="margin: 0"><div style="position: relative; width: 40px; height: 20px">
      <canvas class="frame" width="40" height="20" style="position: absolute; width: 40px; height: 20px"></canvas>
      <canvas class="layer" width="10" height="10" style="position: absolute; left: 30px; top: 10px; width: 10px; height: 10px"></canvas>
      <div style="position: absolute; left: 0; top: 0; width: 10px; height: 10px; background: rgb(0, 0, 255)"></div>
    </div></body>`,
  )
  const pixels = await page.evaluate(async () => {
    const { export_figure } = (globalThis as unknown as Module).figure_export
    const [frame, layer] = document.querySelectorAll(`canvas`)
    const fill = (canvas: HTMLCanvasElement, color: string) => {
      const ctx = canvas.getContext(`2d`)
      if (!ctx) throw new Error(`no 2d context`)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, canvas.width / 2, canvas.height) // left half only
    }
    fill(frame, `rgb(255, 0, 0)`)
    fill(layer, `rgb(0, 255, 0)`)
    const overlay = document.querySelector<HTMLElement>(`div > div`)
    if (!overlay) throw new Error(`missing overlay`)
    const png = await export_figure(frame, {
      format: `png`,
      dpi: 144,
      background: `rgb(255, 255, 255)`,
      overlays: [layer, overlay],
    })
    const bitmap = await createImageBitmap(png)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext(`2d`)
    if (!ctx) throw new Error(`no 2d context`)
    ctx.drawImage(bitmap, 0, 0)
    // export px (2x CSS) at: the HTML overlay, the bare frame, the backdrop, the layer
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].join(`,`)
    return {
      size: [bitmap.width, bitmap.height],
      overlay: at(5, 5),
      frame: at(30, 30),
      backdrop: at(50, 10),
      layer: at(65, 30),
    }
  })
  expect(pixels).toEqual({
    size: [80, 40],
    overlay: `0,0,255,255`,
    frame: `255,0,0,255`,
    backdrop: `255,255,255,255`,
    layer: `0,255,0,255`,
  })
})
