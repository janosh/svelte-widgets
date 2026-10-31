import type { ContrastOptions } from '#lib/attachments/index.ts'
import {
  contrast_color,
  contrast_ratio,
  get_bg_color,
  parse_color,
  pick_contrast_color,
} from '#lib/attachments/index.ts'
import { describe, expect, it, vi } from 'vite-plus/test'
import { create_element } from '../index'

describe(`contrast_color`, () => {
  // perceived brightness of the parsed color over a white page, to pin each color space's
  // conversion with one number per case
  const brightness = (color: string): number => {
    const parsed = parse_color(color)
    if (!parsed) throw new Error(`unparsable test color ${color}`)
    const [red, green, blue, alpha] = parsed
    const [over_red, over_green, over_blue] = [red, green, blue].map(
      (channel) => channel * alpha + 255 * (1 - alpha),
    )
    return (0.299 * over_red + 0.587 * over_green + 0.114 * over_blue) / 255
  }

  it.each([
    [`light rgb background`, `rgb(255, 255, 255)`, `black`],
    [`dark rgb background`, `rgb(20, 20, 20)`, `white`],
    [`space-separated rgb`, `rgb(255 255 255)`, `black`],
    [`rgba with alpha`, `rgba(10, 10, 10, 0.9)`, `white`],
    [`six-digit hex`, `#ffffff`, `black`],
    [`three-digit hex`, `#111`, `white`],
    [`eight-digit hex`, `#ffffffcc`, `black`],
    // computed styles keep the authored color space, so these reach get_bg_color verbatim;
    // the luminance tables below pin each space precisely
    [`white xyz`, `color(xyz 0.9505 1 1.089)`, `black`],
    [`white hwb`, `hwb(0 100% 0%)`, `black`], // white + black >= 1 short-circuits to gray
  ])(`picks contrast text for a %s`, (_desc, bg_color, expected) => {
    expect(pick_contrast_color({ bg_color })).toBe(expected)
  })

  // each must land on the same luminance as its equivalent sRGB spelling
  it.each([
    [`oklab(0.627955 0.224863 0.125846)`, 0.299],
    [`oklch(62.7955% 0.257683 29.2338deg)`, 0.299],
    [`lab(54.291 80.805 69.891)`, 0.299],
    [`color(srgb 1 0 0)`, 0.299],
    [`color(display-p3 1 0 0)`, 0.299], // p3 red is out of sRGB gamut and clips to red
    [`color(prophoto-rgb 1 1 1)`, 1],
    [`color(a98-rgb 1 1 1)`, 1],
    [`color(srgb-linear 1 1 1)`, 1],
    [`color(xyz-d50 0.9643 1 0.8251)`, 1],
    [`hwb(0.5turn 0% 0%)`, 0.701], // cyan
    // same cyan: 200grad is 180deg; `grad` must not parse as the `rad` it ends with (NaN)
    [`hwb(200grad 0% 0%)`, 0.701],
    [`oklch(0.627955 0.257683 0.51022606rad)`, 0.299], // red, the 29.2338deg above in radians
    // perceived brightness weights green 0.587, red 0.299, blue 0.114; a plain channel
    // average would land all three on 0.333
    [`rgb(0, 255, 0)`, 0.587],
    [`rgb(0, 0, 255)`, 0.114],
    // percentages are as legal in rgb() as anywhere else, in channels and alpha alike
    [`rgb(100% 0% 0%)`, 0.299],
    // translucent colors are judged over the white page they show through to
    [`rgb(0 0 0 / 50%)`, 0.5],
    [`rgba(255, 255, 255, 50%)`, 1],
    [`rgba(0, 0, 0, 0.1)`, 0.9],
    [`transparent`, 1],
    [`hwb(0 25% 25%)`, 0.3995], // white and black both mixed into the pure hue
    [`hsla(0, 100%, 50%, 0.5)`, 0.6495], // red at half strength over white
  ])(`%s converts to a brightness of %f`, (bg_color, expected) => {
    expect(Math.abs(brightness(bg_color) - expected)).toBeLessThan(1e-4)
  })

  // the cases above are primaries or white, which every space maps to the same sRGB
  // corner, so any matrix passes them. These are mid-gamut, where the matrices decide.
  // Expected channels are what Chrome 144 paints (canvas fillStyle + getImageData), good
  // to half a channel (0.5/255 = 1.96e-3 luminance) - hence the tolerance. Wrong-matrix
  // results (skipping the D50 adaptation above all) miss by far more.
  it.each([
    [`oklch(0.7 0.15 30)`, [237, 118, 101]],
    [`oklab(0.35 0.08 -0.12)`, [75, 28, 118]],
    [`lab(50 40 -30)`, [165, 91, 171]],
    [`lch(60 50 300)`, [157, 131, 222]],
    [`hsl(200 60% 40%)`, [41, 122, 163]],
    [`hwb(45 60% 10%)`, [230, 210, 153]],
    [`color(srgb-linear 0.5 0.5 0.5)`, [188, 188, 188]],
    [`color(display-p3 0.8 0.2 0.4)`, [222, 24, 101]],
    [`color(a98-rgb 0.5 0.5 0.2)`, [128, 128, 40]],
    [`color(prophoto-rgb 0.4 0.7 0.3)`, [0, 204, 64]],
    [`color(rec2020 0.6 0.3 0.8)`, [187, 74, 218]],
    [`color(xyz-d50 0.3 0.4 0.2)`, [122, 184, 127]],
    [`color(xyz-d65 0.3 0.4 0.2)`, [139, 182, 107]],
  ])(`%s lands where Chrome paints it`, (bg_color, [red, green, blue]) => {
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
    expect(Math.abs(brightness(bg_color) - luminance)).toBeLessThan(2e-3)
  })

  it.each([
    [`#f008`, [255, 0, 0, 0x88 / 255]],
    [`#1A2b3C`, [26, 43, 60, 1]],
    [`#1a2b3c80`, [26, 43, 60, 0x80 / 255]],
  ])(`parse_color reads the hex %s`, (color, expected) => {
    expect(parse_color(color)).toEqual(expected)
  })

  it.each<[string, ContrastOptions, string]>([
    [`custom choices`, { bg_color: `#000`, choices: [`#222`, `#eee`] }, `#eee`],
    // the lighter choice reaches AA here, so a stricter bar flips it to the darker one
    [`custom min_ratio`, { bg_color: `#4e79a7`, min_ratio: 5 }, `black`],
    [`empty bg treated as a white page`, { bg_color: `` }, `black`],
    [`no bg treated as a white page`, {}, `black`],
    [`no bg shows the backdrop`, { backdrop: `#111` }, `white`],
    [
      `empty backdrop treated as a white page`,
      { bg_color: `rgb(255 255 255 / 0.1)`, backdrop: `` },
      `black`,
    ],
    [`named colors`, { bg_color: `navy`, choices: [`gold`, `black`] }, `gold`],
    // neither red (4.0:1 on white) reaches AA, so the higher-ratio blue wins
    [`choices in either order`, { bg_color: `#fff`, choices: [`red`, `blue`] }, `blue`],
    [
      `translucent fill over a dark backdrop`,
      { bg_color: `rgba(255 255 255 / 0.1)`, backdrop: `black` },
      `white`,
    ],
    [
      `translucent fill over the default white page`,
      { bg_color: `rgba(0 0 0 / 0.1)` },
      `black`,
    ],
    // a translucent choice is judged blended over the background it sits on
    [
      `translucent choice`,
      { bg_color: `#000`, choices: [`rgb(255 255 255 / 0.2)`, `#777`] },
      `#777`,
    ],
  ])(`honors %s`, (_desc, options, expected) => {
    expect(pick_contrast_color(options)).toBe(expected)
  })

  // the lighter choice wins whenever it reaches AA (near-ties like steelblue read better in
  // white), else the higher ratio; black or white always reaches 4.58:1
  it.each([
    [`#000000`, `white`],
    [`#4fc3f7`, `black`], // light cyan
    [`#1f77b4`, `white`], // white 4.8:1 vs black 4.4:1
    [`#4e79a7`, `white`], // near-tie: black 4.60 vs white 4.57, white still reaches AA
    [`#00a1ff`, `black`], // white 2.8:1
    [`#59a14f`, `black`], // white 3.2:1
    [`#808080`, `black`], // white 3.9:1
  ])(`prefers white at WCAG AA on %s, else the higher ratio`, (bg_color, expected) => {
    expect(pick_contrast_color({ bg_color })).toBe(expected)
    // independent of the picker: the rule restated on contrast_ratio
    const [black, white] = [
      contrast_ratio(`black`, bg_color),
      contrast_ratio(`white`, bg_color),
    ]
    expect(white >= 4.5 ? `white` : black > white ? `black` : `white`).toBe(expected)
  })

  it.each([
    [`black`, `white`, 21],
    [`white`, `white`, 1],
    [`#777`, `#fff`, 4.4781],
    // a translucent top color blends over the bottom one first (to sRGB 127.5)
    [`rgb(0 0 0 / 0.5)`, `white`, 3.9767],
  ])(`contrast_ratio(%s, %s) = %f`, (color_a, color_b, expected) => {
    expect(contrast_ratio(color_a, color_b)).toBeCloseTo(expected, 3)
  })

  it(`rejects a translucent backdrop`, () => {
    expect(() =>
      pick_contrast_color({ bg_color: `#000`, backdrop: `rgb(0 0 0 / 0.5)` }),
    ).toThrow(/backdrop must be opaque/u)
  })

  // color-mix() never reaches a computed value (it resolves first)
  it.each([
    `notacolor`,
    `ffffff`, // a hex without `#` is no name, though the name table holds its digits
    `currentcolor`,
    `color-mix(in oklab, red, blue)`,
    `color(not-a-space 1 1 1)`,
    // Object.prototype keys are not color spaces: a bare lookup finds `constructor`
    `color(constructor 1 1 1)`,
    `color(srgb 1 1)`,
    `color(srgb 1 0 0 0.5)`, // alpha only after a slash
    `oklch(0.7 0.1)`,
    `#12345`,
    `rgb(1, 2)`,
    `rgb(1 2 3 4 5)`,
    `rgb(a, b, c)`,
  ])(`throws on the unparsable color %s`, (bg_color) => {
    expect(() => pick_contrast_color({ bg_color })).toThrow(/cannot read color/u)
  })

  // an all-transparent chain reports no background; a node with nothing behind it is white
  const tint = `rgba(0, 0, 0, 0.05)`
  it.each([
    [`the first painted ancestor`, `rgb(10, 10, 10)`, ``, `rgb(10, 10, 10)`, `white`],
    [`nothing when all are transparent`, `rgba(0, 0, 0, 0)`, ``, ``, `black`],
    [`translucent over white`, `rgb(255, 255, 255)`, tint, `rgb(242 242 242)`, `black`],
    [`translucent over the page`, `rgba(0, 0, 0, 0)`, tint, `rgb(242 242 242)`, `black`],
  ])(`resolves %s`, (_desc, background, overlay, expected_bg, expected_color) => {
    const painted = create_element(`div`, { backgroundColor: background })
    const [middle, node] = [document.createElement(`div`), document.createElement(`span`)]
    middle.style.backgroundColor = overlay
    painted.append(middle)
    middle.append(node)

    expect(get_bg_color(node)).toBe(expected_bg)
    contrast_color()(node)
    expect(node.style.color).toBe(expected_color)
  })

  // the walk stops at the first painted bg - rgb()-only reading skipped wide-gamut ones
  it.each([
    [`oklch(0.3 0.1 200)`, `white`, true],
    [`oklch(0.3 0.1 200 / 0)`, `black`, false],
    [`rgb(0 0 0 / 0%)`, `black`, false], // a percentage alpha reads as transparent too
    [`color(display-p3 1 1 1)`, `black`, true],
  ])(`sees %s as a painted ancestor: %s`, (background, expected_color, painted) => {
    const [ancestor, node] = [create_element(), document.createElement(`span`)]
    ancestor.append(node)
    vi.spyOn(globalThis, `getComputedStyle`).mockImplementation(
      (element) =>
        ({
          backgroundColor: element === ancestor ? background : `rgba(0, 0, 0, 0)`,
        }) as CSSStyleDeclaration,
    )

    expect(get_bg_color(node)).toBe(painted ? background : ``)
    contrast_color()(node)
    expect(node.style.color).toBe(expected_color)
  })

  it(`walks out of a shadow root to the painted host`, () => {
    const host = create_element(`div`, { backgroundColor: `rgb(10, 10, 10)` })
    const node = document.createElement(`span`)
    host.attachShadow({ mode: `open` }).append(node)

    expect(get_bg_color(node)).toBe(`rgb(10, 10, 10)`)
  })

  // the node's own fill is what bg_color replaces, so only its parent's backdrop shows;
  // cleanup restores the inline color it overwrote
  it.each([
    [`rgb(0, 0, 0)`, `rgb(255, 255, 255)`, `white`], // opaque: the parent's white is moot
    [`rgba(255, 0, 0, 0.3)`, `rgb(20, 20, 20)`, `white`], // blending over white said black
    [`rgba(255, 0, 0, 0.3)`, `rgb(255, 255, 255)`, `black`],
    [`rgba(255, 0, 0, 0.3)`, `rgba(0, 0, 0, 0)`, `black`], // nothing painted: white page
    [`rgba(0, 0, 0, 0)`, `rgb(20, 20, 20)`, `white`],
  ])(
    `bg_color %s over the parent's %s picks %s`,
    (bg_color, parent_bg, expected_color) => {
      const parent = create_element(`div`, { backgroundColor: parent_bg })
      const node = document.createElement(`span`)
      Object.assign(node.style, {
        backgroundColor: `rgb(255, 255, 255)`,
        color: `rebeccapurple`,
      })
      parent.append(node)

      const cleanup = contrast_color({ bg_color })(node)
      expect(node.style.color).toBe(expected_color)
      cleanup?.()
      expect(node.style.color).toBe(`rebeccapurple`)
    },
  )
})
