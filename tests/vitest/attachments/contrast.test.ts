import type { ContrastOptions } from '$lib/attachments'
import { contrast_color, get_bg_color, pick_contrast_color } from '$lib/attachments'
import { describe, expect, it, vi } from 'vite-plus/test'
import { create_element } from '../index'

describe(`contrast_color`, () => {
  // brackets a color's luminance from both sides: a threshold just below it has to read
  // as `over` and one just above as `under`, which pins the value without exposing it
  const luminance_brackets = (bg_color: string, expected: number, tolerance: number) => {
    const probe = (luminance_threshold: number) =>
      pick_contrast_color({ bg_color, luminance_threshold, choices: [`over`, `under`] })
    return [probe(expected - tolerance), probe(expected + tolerance)]
  }
  const bracketed = [`over`, `under`]

  it.each([
    [`light rgb background`, `rgb(255, 255, 255)`, `black`],
    [`dark rgb background`, `rgb(20, 20, 20)`, `white`],
    [`space-separated rgb`, `rgb(255 255 255)`, `black`],
    [`rgba with alpha`, `rgba(10, 10, 10, 0.9)`, `white`],
    [`six-digit hex`, `#ffffff`, `black`],
    [`three-digit hex`, `#111`, `white`],
    [`eight-digit hex`, `#ffffffcc`, `black`],
    // computed styles keep a color in the space it was authored in, so these arrive
    // at get_bg_color verbatim rather than pre-converted to rgb()
    [`white oklch`, `oklch(1 0 0)`, `black`],
    [`black oklab`, `oklab(0 0 0)`, `white`],
    [`red oklch`, `oklch(0.627955 0.257683 29.2338)`, `white`],
    [`white lab`, `lab(100 0 0)`, `black`],
    [`red lch`, `lch(54.291 106.837 40.853)`, `white`],
    [`white display-p3`, `color(display-p3 1 1 1)`, `black`],
    [`black srgb`, `color(srgb 0 0 0)`, `white`],
    [`white rec2020`, `color(rec2020 1 1 1)`, `black`],
    [`white xyz`, `color(xyz 0.9505 1 1.089)`, `black`],
    [`red hsl`, `hsl(0 100% 50%)`, `white`],
    [`white hwb`, `hwb(0 100% 0%)`, `black`],
  ])(`picks contrast text for a %s`, (_desc, bg_color, expected) => {
    expect(pick_contrast_color({ bg_color })).toBe(expected)
  })

  // the conversions are only worth anything if they land on the same luminance the
  // equivalent sRGB spelling does, so each pair has to agree either side of a threshold
  // set at the reference color's own luminance
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
    // same cyan a third way: 200grad is 180deg, and `grad` must not read as the `rad`
    // it ends with, which would leave a trailing `g` and parse to NaN
    [`hwb(200grad 0% 0%)`, 0.701],
    [`oklch(0.627955 0.257683 0.51022606rad)`, 0.299], // red, the 29.2338deg above in radians
    // percentages are as legal in rgb() as anywhere else, in channels and alpha alike
    [`rgb(100% 0% 0%)`, 0.299],
    [`rgb(0 0 0 / 50%)`, 0],
    [`rgba(255, 255, 255, 50%)`, 1],
    [`hwb(0 25% 25%)`, 0.3995], // white and black both mixed into the pure hue
    [`hsla(0, 100%, 50%, 0.5)`, 0.299],
  ])(`%s converts to a luminance of %f`, (bg_color, expected) => {
    expect(luminance_brackets(bg_color, expected, 1e-4)).toEqual(bracketed)
  })

  // The cases above are all primaries or pure white, which every space maps to the same
  // corner of sRGB — they pass whatever the conversion matrices hold. These are mid-gamut,
  // where the coefficients actually decide the answer, and the expected channels are what
  // Chrome 144 paints for the same string (canvas fillStyle, then getImageData).
  // Chrome quantizes to 8-bit, so its answer is only good to half a channel: 0.5/255 is
  // 1.96e-3 of luminance, and the tolerance is that bound. Every wrong-matrix result
  // checked (skipping the D50 adaptation above all) misses by far more than this.
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
    expect(luminance_brackets(bg_color, luminance, 2e-3)).toEqual(bracketed)
  })

  // Perceived brightness weights green ×0.587, red ×0.299 and blue ×0.114, so the
  // same channel value reads very differently. A plain channel average would land
  // all three of these on 0.333 and give one answer for the lot.
  it.each([
    [`green`, `rgb(0, 255, 0)`, `black`],
    [`red`, `rgb(255, 0, 0)`, `white`],
    [`blue`, `rgb(0, 0, 255)`, `white`],
  ])(`weighs channels perceptually: full %s`, (_desc, bg_color, expected) => {
    expect(pick_contrast_color({ bg_color, luminance_threshold: 0.5 })).toBe(expected)
  })

  it.each<[string, ContrastOptions, string]>([
    [`custom choices`, { bg_color: `#000`, choices: [`#222`, `#eee`] }, `#eee`],
    // white's luminance is 1, so a threshold above it flips even white to dark text
    [`custom threshold`, { bg_color: `#fff`, luminance_threshold: 1.5 }, `white`],
    [`empty bg treated as a white page`, { bg_color: `` }, `black`],
    [`no bg treated as a white page`, {}, `black`],
  ])(`honors %s`, (_desc, options, expected) => {
    expect(pick_contrast_color(options)).toBe(expected)
  })

  // named colors and color-mix() stay out: a computed value can carry neither, since
  // color-mix() resolves to a color in its interpolation space before it is read back
  it.each([
    `red`,
    `color-mix(in oklab, red, blue)`,
    `color(not-a-space 1 1 1)`,
    // Object.prototype keys are not color spaces: a bare lookup finds `constructor`
    `color(constructor 1 1 1)`,
    `color(srgb 1 1)`,
    `oklch(0.7 0.1)`,
    `#12345`,
    `rgb(1, 2)`,
    `rgb(a, b, c)`,
  ])(`throws on the unparsable color %s`, (bg_color) => {
    expect(() => pick_contrast_color({ bg_color })).toThrow(/cannot read color/u)
  })

  // a chain with nothing painted in it reports no background at all, and a page with
  // nothing behind the node is assumed white
  it.each([
    [`the first painted ancestor`, `rgb(10, 10, 10)`, `rgb(10, 10, 10)`, `white`],
    [`nothing when every ancestor is transparent`, `rgba(0, 0, 0, 0)`, ``, `black`],
  ])(`the ancestor walk finds %s`, (_desc, background, expected_bg, expected_color) => {
    const painted = create_element(`div`, { backgroundColor: background })
    const middle = document.createElement(`div`)
    const node = document.createElement(`span`)
    painted.append(middle)
    middle.append(node)

    expect(get_bg_color(node)).toBe(expected_bg)
    const cleanup = contrast_color()(node)
    expect(node.style.color).toBe(expected_color)
    cleanup?.()
  })

  // the ancestor walk stops at the first painted background, and a wide-gamut one is
  // painted: reading only rgb()/rgba() used to skip straight past it
  it.each([
    [`oklch(0.3 0.1 200)`, `white`, true],
    [`oklch(0.3 0.1 200 / 0)`, `black`, false],
    [`rgb(0 0 0 / 0%)`, `black`, false], // a percentage alpha reads as transparent too
    [`color(display-p3 1 1 1)`, `black`, true],
  ])(`sees %s as a painted ancestor: %s`, (background, expected_color, painted) => {
    const ancestor = document.createElement(`div`)
    const node = document.createElement(`span`)
    ancestor.append(node)
    document.body.append(ancestor)
    vi.spyOn(globalThis, `getComputedStyle`).mockImplementation(
      (element) =>
        ({
          backgroundColor: element === ancestor ? background : `rgba(0, 0, 0, 0)`,
        }) as CSSStyleDeclaration,
    )

    expect(get_bg_color(node)).toBe(painted ? background : ``)
    const cleanup = contrast_color()(node)
    expect(node.style.color).toBe(expected_color)
    cleanup?.()
  })

  it(`bg_color skips the ancestor walk and cleanup restores the inline color`, () => {
    const node = create_element(`div`, {
      backgroundColor: `rgb(255, 255, 255)`,
      color: `rebeccapurple`,
    })

    const cleanup = contrast_color({ bg_color: `rgb(0, 0, 0)` })(node)
    expect(node.style.color).toBe(`white`) // the ancestor white would have said black

    cleanup?.()
    expect(node.style.color).toBe(`rebeccapurple`)
  })
})
