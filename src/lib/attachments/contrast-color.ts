import { clamp } from '../utils'

// Color channels are 0..1 fractions.
const clamp_unit = (value: number): number => clamp(value, 0, 1)

export interface ContrastOptions {
  // Skips the ancestor walk where the background behind the node is already known
  bg_color?: string
  luminance_threshold?: number
  choices?: [string, string] // [on light background, on dark background]
}

// === CSS color parsing ===
// A color authored in a wide-gamut or perceptual space keeps that space in its computed
// value — `getComputedStyle` hands back `oklch(…)`, `lab(…)` or `color(display-p3 …)`
// verbatim rather than an sRGB approximation — so reading only `rgb()`/`rgba()` would
// take a painted ancestor for a transparent one. Everything below converts to sRGB.
// Not covered: named colors and `color-mix()`, neither of which a computed value can
// carry (`color-mix()` resolves to a color in its interpolation space at computed-value
// time). Both are rejected, and callers passing a color by hand get the error.
const RGB_COLOR = /^rgba?\((?<channels>[^)]+)\)$/iu
const HEX_COLOR = /^#(?<digits>[\da-f]+)$/iu
const COLOR_FN = /^(?<name>oklch|oklab|lch|lab|hsla?|hwb|color)\((?<args>[^)]*)\)$/iu

type Triple = [number, number, number]
type Rgba = [...Triple, number]

const dot3 = (matrix: readonly number[], [x_val, y_val, z_val]: Triple): Triple => [
  matrix[0] * x_val + matrix[1] * y_val + matrix[2] * z_val,
  matrix[3] * x_val + matrix[4] * y_val + matrix[5] * z_val,
  matrix[6] * x_val + matrix[7] * y_val + matrix[8] * z_val,
]

// `none` is a real component value meaning "missing", and behaves as zero here
const parse_component = (token: string, percent_ref: number): number => {
  if (token.toLowerCase() === `none`) return 0
  if (token.endsWith(`%`)) return (Number(token.slice(0, -1)) / 100) * percent_ref
  return Number(token)
}
// hsl/hwb take `50` and `50%` to mean the same thing
const parse_percentage = (token: string): number =>
  parse_component(token, 1) / (token.endsWith(`%`) ? 1 : 100)
// alpha is a 0..1 number or a percentage, and absent means opaque
const parse_alpha = (token: string | undefined): number =>
  token === undefined ? 1 : clamp_unit(parse_component(token, 1))
// Junk anywhere in a component reaches here as NaN, so one check at the end rejects
// the whole color rather than every parse site having to guard
const finite_rgba = (rgb: Triple, alpha: number): Rgba | null => {
  const parsed: Rgba = [...rgb, alpha]
  return parsed.every(Number.isFinite) ? parsed : null
}

const HUE_PER_UNIT: Record<string, number> = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
}
// Longest suffix first, so `grad` is never read as the `rad` it ends with. Matching in
// declaration order would work too, but only until someone alphabetizes the object.
const HUE_UNITS = Object.keys(HUE_PER_UNIT).toSorted(
  (one, two) => two.length - one.length,
)
const parse_hue = (token: string): number => {
  const lower = token.toLowerCase()
  const unit = HUE_UNITS.find((suffix) => lower.endsWith(suffix))
  const value = parse_component(unit ? lower.slice(0, -unit.length) : lower, 360)
  return value * (unit ? HUE_PER_UNIT[unit] : 1)
}

// Sign-preserving, so an out-of-gamut channel keeps its order instead of folding
const transfer = (channel: number, encode: (magnitude: number) => number): number =>
  Math.sign(channel) * encode(Math.abs(channel))

const srgb_encode = (channel: number) =>
  transfer(channel, (mag) =>
    mag <= 0.0031308 ? 12.92 * mag : 1.055 * mag ** (1 / 2.4) - 0.055,
  )
const srgb_decode = (channel: number) =>
  transfer(channel, (mag) =>
    mag <= 0.04045 ? mag / 12.92 : ((mag + 0.055) / 1.055) ** 2.4,
  )

const XYZ_D65_TO_LINEAR_SRGB = [
  3.2409699419045226, -1.537383177570094, -0.4986107602930034, -0.9692436362808796,
  1.8759675015077202, 0.04155505740717559, 0.05563007969699366, -0.20397695888897652,
  1.0569715142428786,
]
// Bradford-adapted, for the two spaces defined against the D50 white point
const XYZ_D50_TO_D65 = [
  0.9554734527042182, -0.023098536874261423, 0.0632593086610217, -0.028369706963208136,
  1.0099954580058226, 0.021041398966943008, 0.012314001688319899, -0.020507696433477912,
  1.3303659366080753,
]

const linear_srgb_to_rgb255 = (linear: Triple): Triple =>
  linear.map((channel) => clamp_unit(srgb_encode(channel)) * 255) as Triple

const xyz_d65_to_rgb255 = (xyz: Triple): Triple =>
  linear_srgb_to_rgb255(dot3(XYZ_D65_TO_LINEAR_SRGB, xyz))

// Björn Ottosson's Oklab, https://bottosson.github.io/posts/oklab
const oklab_to_rgb255 = ([lightness, a_axis, b_axis]: Triple): Triple => {
  const long = (lightness + 0.3963377774 * a_axis + 0.2158037573 * b_axis) ** 3
  const medium = (lightness - 0.1055613458 * a_axis - 0.0638541728 * b_axis) ** 3
  const short = (lightness - 0.0894841775 * a_axis - 1.291485548 * b_axis) ** 3
  return linear_srgb_to_rgb255([
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.7076147022 * short,
  ])
}

const [KAPPA, EPSILON] = [24389 / 27, 216 / 24389]
const D50_WHITE: Triple = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585]

const lab_to_rgb255 = ([lightness, a_axis, b_axis]: Triple): Triple => {
  const f_y = (lightness + 16) / 116
  const f_x = a_axis / 500 + f_y
  const f_z = f_y - b_axis / 200
  const xyz_d50: Triple = [
    (f_x ** 3 > EPSILON ? f_x ** 3 : (116 * f_x - 16) / KAPPA) * D50_WHITE[0],
    (lightness > KAPPA * EPSILON ? f_y ** 3 : lightness / KAPPA) * D50_WHITE[1],
    (f_z ** 3 > EPSILON ? f_z ** 3 : (116 * f_z - 16) / KAPPA) * D50_WHITE[2],
  ]
  return xyz_d65_to_rgb255(dot3(XYZ_D50_TO_D65, xyz_d50))
}

const hsl_to_rgb255 = (hue: number, saturation: number, lightness: number): Triple => {
  const wrapped = (((hue % 360) + 360) % 360) / 30
  const amplitude = saturation * Math.min(lightness, 1 - lightness)
  const channel = (offset: number) => {
    const key = (offset + wrapped) % 12
    return (lightness - amplitude * Math.max(-1, Math.min(key - 3, 9 - key, 1))) * 255
  }
  return [channel(0), channel(8), channel(4)]
}

const hwb_to_rgb255 = (hue: number, white: number, black: number): Triple => {
  if (white + black >= 1) {
    const gray = (white / (white + black)) * 255
    return [gray, gray, gray]
  }
  const span = 1 - white - black
  return hsl_to_rgb255(hue, 1, 0.5).map(
    (channel) => channel * span + white * 255,
  ) as Triple
}

const LINEAR_SRGB_TO_XYZ_D65 = [
  0.4123907992659595, 0.35758433938387796, 0.1804807884018343, 0.21263900587151036,
  0.7151686787677559, 0.07219231536073371, 0.01933081871559185, 0.11919477979462599,
  0.9505321522496606,
]

const IDENTITY_MATRIX = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const identity = (channel: number) => channel

// The predefined spaces `color()` accepts, each as its decoding transfer function and
// the matrix taking its linear form to XYZ. `d50` marks the ones needing adaptation,
// and the xyz spaces are the degenerate case: their components already are XYZ.
const COLOR_SPACES: Record<
  string,
  { decode: (channel: number) => number; matrix: readonly number[]; d50?: boolean }
> = {
  srgb: { decode: srgb_decode, matrix: LINEAR_SRGB_TO_XYZ_D65 },
  'srgb-linear': { decode: identity, matrix: LINEAR_SRGB_TO_XYZ_D65 },
  xyz: { decode: identity, matrix: IDENTITY_MATRIX },
  'xyz-d65': { decode: identity, matrix: IDENTITY_MATRIX },
  'xyz-d50': { decode: identity, matrix: IDENTITY_MATRIX, d50: true },
  'display-p3': {
    decode: srgb_decode,
    matrix: [
      0.4865709486482162, 0.26566769316909306, 0.1982172852343625, 0.2289745640697488,
      0.6917385218365064, 0.079286914093745, 0, 0.04511338185890264, 1.043944368900976,
    ],
  },
  'a98-rgb': {
    decode: (channel) => transfer(channel, (mag) => mag ** (563 / 256)),
    matrix: [
      0.5766690429101305, 0.1855582379065463, 0.1882286462349947, 0.29734497525053605,
      0.6273635662554661, 0.07529145849399788, 0.02703136138641234, 0.07068885253582723,
      0.9913375368376388,
    ],
  },
  'prophoto-rgb': {
    decode: (channel) =>
      transfer(channel, (mag) => (mag >= 1 / 512 ? mag ** 1.8 : mag / 16)),
    d50: true,
    matrix: [
      0.7977604896723027, 0.13518583717574031, 0.0313493495815248, 0.2880711282292934,
      0.7118432178101014, 0.00008565396060525902, 0, 0, 0.8251046025104601,
    ],
  },
  rec2020: {
    decode: (channel) =>
      transfer(channel, (mag) =>
        mag < 4.5 * 0.018053968510807
          ? mag / 4.5
          : ((mag + 1.09929682680944 - 1) / 1.09929682680944) ** (1 / 0.45),
      ),
    matrix: [
      0.6369580483012914, 0.14461690358620832, 0.1688809751641721, 0.2627002120112671,
      0.6779980715188708, 0.05930171646986196, 0, 0.028072693049087428, 1.060985057710791,
    ],
  },
}
// Component tokens to a rectangular triple, `refs` giving each one's 100% reference
const components = (tokens: string[], refs: Triple): Triple => [
  parse_component(tokens[0], refs[0]),
  parse_component(tokens[1], refs[1]),
  parse_component(tokens[2], refs[2]),
]
// lch and oklch are lab and oklab in polar coordinates, so they convert and reuse the
// rectangular transform rather than carrying one of their own
const polar_components = (tokens: string[], refs: [number, number]): Triple => {
  const chroma = parse_component(tokens[1], refs[1])
  const hue = (parse_hue(tokens[2]) * Math.PI) / 180
  return [
    parse_component(tokens[0], refs[0]),
    chroma * Math.cos(hue),
    chroma * Math.sin(hue),
  ]
}

// Component tokens to sRGB on 0..255; null when they do not fit the function's shape
const function_to_rgb255 = (name: string, tokens: string[]): Triple | null => {
  if (name === `color`) {
    // own properties only: a bare lookup would find Object.prototype keys, so
    // `color(constructor 1 1 1)` came back truthy and then blew up on space.decode
    const space_name = tokens[0]?.toLowerCase() ?? ``
    const space = Object.hasOwn(COLOR_SPACES, space_name)
      ? COLOR_SPACES[space_name]
      : undefined
    if (!space || tokens.length < 4) return null
    const linear = tokens
      .slice(1, 4)
      .map((token) => space.decode(parse_component(token, 1))) as Triple
    const xyz = dot3(space.matrix, linear)
    return xyz_d65_to_rgb255(space.d50 ? dot3(XYZ_D50_TO_D65, xyz) : xyz)
  }
  if (tokens.length !== 3) return null
  if (name === `oklab`) return oklab_to_rgb255(components(tokens, [1, 0.4, 0.4]))
  if (name === `oklch`) return oklab_to_rgb255(polar_components(tokens, [1, 0.4]))
  if (name === `lab`) return lab_to_rgb255(components(tokens, [100, 125, 125]))
  if (name === `lch`) return lab_to_rgb255(polar_components(tokens, [100, 150]))
  // hsl and hwb share a shape: a hue and two percentages
  const to_rgb255 = name === `hwb` ? hwb_to_rgb255 : hsl_to_rgb255
  return to_rgb255(
    parse_hue(tokens[0]),
    clamp_unit(parse_percentage(tokens[1])),
    clamp_unit(parse_percentage(tokens[2])),
  )
}

const parse_color_function = (name: string, args: string): Rgba | null => {
  const [main = ``, alpha_arg] = args.split(`/`)
  const tokens = main
    .trim()
    .split(/[\s,]+/u)
    .filter(Boolean)
  // legacy `hsla(h, s, l, a)` carries alpha in the argument list instead of after a slash
  const legacy_alpha =
    alpha_arg === undefined && name !== `color` && tokens.length === 4
      ? tokens.pop()
      : undefined
  const rgb = function_to_rgb255(name, tokens)
  if (!rgb) return null
  return finite_rgba(rgb, parse_alpha(alpha_arg?.trim() ?? legacy_alpha))
}

const parse_color = (color: string): Rgba | null => {
  const trimmed = color.trim()
  const channels = RGB_COLOR.exec(trimmed)?.groups?.channels
  if (channels) {
    // percentages are legal here too, in the channels (`rgb(50% 0% 0%)`) as much as in
    // the alpha (`rgb(0 0 0 / 50%)`), even though a computed value never uses them
    const parts = channels.split(/[\s,/]+/u).filter(Boolean)
    if (parts.length < 3) return null
    const rgb = parts.slice(0, 3).map((token) => parse_component(token, 255)) as Triple
    return finite_rgba(rgb, parse_alpha(parts[3]))
  }
  const color_fn = COLOR_FN.exec(trimmed)?.groups
  if (color_fn) {
    return parse_color_function(color_fn.name.toLowerCase(), color_fn.args)
  }
  const digits = HEX_COLOR.exec(trimmed)?.groups?.digits
  if (!digits) return null
  const stride = digits.length < 6 ? 1 : 2 // #rgb(a) spells each channel once
  if (digits.length !== stride * 3 && digits.length !== stride * 4) return null
  const channel = (idx: number) => {
    const slice = digits.slice(idx * stride, idx * stride + stride)
    return Number.parseInt(stride === 1 ? slice + slice : slice, 16)
  }
  return [
    channel(0),
    channel(1),
    channel(2),
    digits.length === stride * 4 ? channel(3) / 255 : 1,
  ]
}

// Human-perceived brightness on 0..1, from https://stackoverflow.com/a/596243
const luminance = (color: string): number => {
  const parsed = parse_color(color)
  if (!parsed) {
    throw new Error(
      `pick_contrast_color: cannot read color \`${color}\`, expected hex, rgb()/rgba(), ` +
        `hsl()/hwb(), lab()/lch()/oklab()/oklch() or color(); named colors and ` +
        `color-mix() are not parsed`,
    )
  }
  const [red, green, blue] = parsed
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255
}

// Computed alphas round-trip through 8 bits, so a nominally opaque one can land just shy of 1
const OPAQUE = 0.999

// Paint `top` over `bottom` (source-over), keeping alpha until a layer is opaque.
const composite_color = (top: Rgba, bottom: Rgba): Rgba => {
  const share = bottom[3] * (1 - top[3])
  const alpha = top[3] + share
  const channel = (idx: 0 | 1 | 2) => (top[idx] * top[3] + bottom[idx] * share) / alpha
  return [channel(0), channel(1), channel(2), alpha]
}

// The browser reports 8-bit channels; match that rather than emit blend fractions
const rgb_string = ([red, green, blue]: Rgba): string =>
  `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`

// The effective background behind a node: a translucent ancestor tints whatever it sits
// on rather than deciding readability alone, so keep walking and blend the layers. A
// chain with nothing opaque in it shows through to the browser's white canvas.
export const get_bg_color = (element: Element | null): string => {
  let composite: Rgba | undefined
  for (let node = element; node; node = node.parentElement) {
    const bg_color = getComputedStyle(node).backgroundColor
    const layer = parse_color(bg_color)
    if (!layer || layer[3] === 0) continue
    // Nothing translucent above it: hand back the color as authored, unconverted
    if (!composite && layer[3] >= OPAQUE) return bg_color
    composite = composite ? composite_color(composite, layer) : layer
    if (composite[3] >= OPAQUE) return rgb_string(composite)
  }
  return composite ? rgb_string(composite_color(composite, [255, 255, 255, 1])) : ``
}

export const pick_contrast_color = (options: ContrastOptions = {}): string => {
  const { bg_color, luminance_threshold = 0.7, choices = [`black`, `white`] } = options
  // Nothing opaque behind the node: it shows through to the white a page starts as
  const background = bg_color?.trim() ? bg_color : `#fff`
  return luminance(background) > luminance_threshold ? choices[0] : choices[1]
}

// Set text color once at attachment setup to whichever of `choices` reads better on the
// background behind the node. For dynamic fills, re-run with an explicit bg_color.
export const contrast_color =
  (options: ContrastOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    if (!(node instanceof HTMLElement)) return undefined
    const previous_color = node.style.color
    const bg_color = options.bg_color ?? get_bg_color(node)
    node.style.color = pick_contrast_color({ ...options, bg_color })
    return () => {
      node.style.color = previous_color
    }
  }
