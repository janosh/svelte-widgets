import { clamp } from '../utils'
import { composed_parent } from './shared'

// Color channels are 0..1 fractions.
const clamp_unit = (value: number): number => clamp(value, 0, 1)

export interface ContrastOptions {
  // Fill behind the text; the attachment defaults it to the node's own background
  bg_color?: string
  // Opaque color a translucent bg_color is painted over. Defaults to the white a page
  // starts as; the attachment defaults it to the background resolved behind the node.
  backdrop?: string
  // Contrast ratio the lighter choice needs to win (default 4.5, WCAG AA body text)
  min_ratio?: number
  choices?: readonly [string, string] // in either order; translucent ones blend over the bg
}

// === CSS color parsing ===
// `getComputedStyle` returns wide-gamut and perceptual colors verbatim (`oklch(…)`,
// `color(display-p3 …)`), not as sRGB, so reading only `rgb()`/`rgba()` would mistake a
// painted ancestor for a transparent one. Everything below converts to sRGB. `color-mix()`
// and `currentcolor` are rejected: a computed background never carries either.
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
// junk in any component arrives as NaN, so one check here rejects the whole color and no
// parse site needs its own guard
const finite_rgba = (rgb: Triple, alpha: number): Rgba | null => {
  const parsed: Rgba = [...rgb, alpha]
  return parsed.every(Number.isFinite) ? parsed : null
}

// degrees per hue unit; `grad` comes first so it is never read as the `rad` it ends with
const HUE_UNITS = [
  [`grad`, 0.9],
  [`turn`, 360],
  [`deg`, 1],
  [`rad`, 180 / Math.PI],
] as const
const parse_hue = (token: string): number => {
  const lower = token.toLowerCase()
  const [unit = ``, degrees = 1] =
    HUE_UNITS.find(([suffix]) => lower.endsWith(suffix)) ?? []
  return parse_component(lower.slice(0, lower.length - unit.length), 360) * degrees
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

// Spaces `color()` accepts, each as a decoding transfer function plus the matrix from its
// linear form to XYZ. `d50` marks those needing adaptation; xyz spaces already are XYZ.
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
const components = (tokens: string[], refs: Triple): Triple =>
  refs.map((ref, idx) => parse_component(tokens[idx], ref)) as Triple
// lch/oklch are lab/oklab in polar coordinates, so they convert and reuse the rectangular
// transform instead of carrying their own
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
    // own properties only: a bare lookup finds Object.prototype keys, so
    // `color(constructor 1 1 1)` came back truthy and then blew up on space.decode
    const space_name = tokens[0]?.toLowerCase() ?? ``
    const space = Object.hasOwn(COLOR_SPACES, space_name)
      ? COLOR_SPACES[space_name]
      : undefined
    if (!space || tokens.length !== 4) return null
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

// The 148 CSS named colors plus `transparent`, looked up as a `name #hex` pair. Computed
// styles never carry names, but hand-passed colors (`choices`, `backdrop`) often do.
const NAMED_COLORS = `aliceblue #f0f8ff antiquewhite #faebd7 aqua #00ffff aquamarine #7fffd4 azure #f0ffff beige #f5f5dc bisque #ffe4c4 black #000000 blanchedalmond #ffebcd blue #0000ff blueviolet #8a2be2 brown #a52a2a burlywood #deb887 cadetblue #5f9ea0 chartreuse #7fff00 chocolate #d2691e coral #ff7f50 cornflowerblue #6495ed cornsilk #fff8dc crimson #dc143c cyan #00ffff darkblue #00008b darkcyan #008b8b darkgoldenrod #b8860b darkgray #a9a9a9 darkgreen #006400 darkgrey #a9a9a9 darkkhaki #bdb76b darkmagenta #8b008b darkolivegreen #556b2f darkorange #ff8c00 darkorchid #9932cc darkred #8b0000 darksalmon #e9967a darkseagreen #8fbc8f darkslateblue #483d8b darkslategray #2f4f4f darkslategrey #2f4f4f darkturquoise #00ced1 darkviolet #9400d3 deeppink #ff1493 deepskyblue #00bfff dimgray #696969 dimgrey #696969 dodgerblue #1e90ff firebrick #b22222 floralwhite #fffaf0 forestgreen #228b22 fuchsia #ff00ff gainsboro #dcdcdc ghostwhite #f8f8ff gold #ffd700 goldenrod #daa520 gray #808080 green #008000 greenyellow #adff2f grey #808080 honeydew #f0fff0 hotpink #ff69b4 indianred #cd5c5c indigo #4b0082 ivory #fffff0 khaki #f0e68c lavender #e6e6fa lavenderblush #fff0f5 lawngreen #7cfc00 lemonchiffon #fffacd lightblue #add8e6 lightcoral #f08080 lightcyan #e0ffff lightgoldenrodyellow #fafad2 lightgray #d3d3d3 lightgreen #90ee90 lightgrey #d3d3d3 lightpink #ffb6c1 lightsalmon #ffa07a lightseagreen #20b2aa lightskyblue #87cefa lightslategray #778899 lightslategrey #778899 lightsteelblue #b0c4de lightyellow #ffffe0 lime #00ff00 limegreen #32cd32 linen #faf0e6 magenta #ff00ff maroon #800000 mediumaquamarine #66cdaa mediumblue #0000cd mediumorchid #ba55d3 mediumpurple #9370db mediumseagreen #3cb371 mediumslateblue #7b68ee mediumspringgreen #00fa9a mediumturquoise #48d1cc mediumvioletred #c71585 midnightblue #191970 mintcream #f5fffa mistyrose #ffe4e1 moccasin #ffe4b5 navajowhite #ffdead navy #000080 oldlace #fdf5e6 olive #808000 olivedrab #6b8e23 orange #ffa500 orangered #ff4500 orchid #da70d6 palegoldenrod #eee8aa palegreen #98fb98 paleturquoise #afeeee palevioletred #db7093 papayawhip #ffefd5 peachpuff #ffdab9 peru #cd853f pink #ffc0cb plum #dda0dd powderblue #b0e0e6 purple #800080 rebeccapurple #663399 red #ff0000 rosybrown #bc8f8f royalblue #4169e1 saddlebrown #8b4513 salmon #fa8072 sandybrown #f4a460 seagreen #2e8b57 seashell #fff5ee sienna #a0522d silver #c0c0c0 skyblue #87ceeb slateblue #6a5acd slategray #708090 slategrey #708090 snow #fffafa springgreen #00ff7f steelblue #4682b4 tan #d2b48c teal #008080 thistle #d8bfd8 tomato #ff6347 transparent #0000 turquoise #40e0d0 violet #ee82ee wheat #f5deb3 white #ffffff whitesmoke #f5f5f5 yellow #ffff00 yellowgreen #9acd32`

// Any CSS color except `color-mix()` and `currentcolor` as sRGB `[red, green, blue, alpha]`
// (channels 0..255, alpha 0..1), or null when unreadable
export const parse_color = (color: string): Rgba | null => {
  const trimmed = color.trim()
  const lower = trimmed.toLowerCase()
  if (/^[a-z]+$/u.test(lower)) {
    const hex = new RegExp(`(?:^| )${lower} (#\\w+)`, `u`).exec(NAMED_COLORS)?.[1]
    return hex ? parse_color(hex) : null
  }
  const channels = RGB_COLOR.exec(trimmed)?.groups?.channels
  if (channels) {
    // percentages are legal in channels and alpha (`rgb(50% 0% 0% / 50%)`), even though a
    // computed value never uses them
    const parts = channels.split(/[\s,/]+/u).filter(Boolean)
    if (parts.length !== 3 && parts.length !== 4) return null
    const rgb = parts.slice(0, 3).map((token) => parse_component(token, 255)) as Triple
    return finite_rgba(rgb, parse_alpha(parts[3]))
  }
  const color_fn = COLOR_FN.exec(trimmed)?.groups
  if (color_fn) {
    return parse_color_function(color_fn.name.toLowerCase(), color_fn.args)
  }
  const digits = HEX_COLOR.exec(trimmed)?.groups?.digits
  if (!digits || ![3, 4, 6, 8].includes(digits.length)) return null
  // #rgb(a) spells each channel once
  const pairs = (digits.length < 6 ? digits.replaceAll(/./gu, `$&$&`) : digits).match(
    /../gu,
  )
  const [red, green, blue, alpha = 255] = (pairs ?? []).map((pair) =>
    Number.parseInt(pair, 16),
  )
  return [red, green, blue, alpha / 255]
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

const PAGE_WHITE: Rgba = [255, 255, 255, 1]

const read_color = (color: string): Rgba => {
  const parsed = parse_color(color)
  if (parsed) return parsed
  throw new Error(
    `pick_contrast_color: cannot read color \`${color}\`, expected hex, a named color, ` +
      `rgb()/rgba(), hsl()/hwb(), lab()/lch()/oklab()/oklch(), color() or transparent; ` +
      `color-mix() and currentcolor are not parsed`,
  )
}

// WCAG 2 relative luminance of an opaque color, from linearized sRGB channels
const relative_luminance = ([red, green, blue]: Rgba): number => {
  const linear = (channel: number) => srgb_decode(clamp(channel, 0, 255) / 255)
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}
const luminance_ratio = (lum_a: number, lum_b: number): number =>
  (Math.max(lum_a, lum_b) + 0.05) / (Math.min(lum_a, lum_b) + 0.05)

// WCAG 2 contrast ratio from 1 (identical) to 21 (black on white). `color_a` is painted over
// `color_b`, which is in turn judged over a white page when translucent.
export const contrast_ratio = (color_a: string, color_b: string): number => {
  const bottom = composite_color(read_color(color_b), PAGE_WHITE)
  const top = composite_color(read_color(color_a), bottom)
  return luminance_ratio(relative_luminance(top), relative_luminance(bottom))
}

// The browser reports 8-bit channels; match that rather than emit blend fractions
const rgb_string = ([red, green, blue]: Rgba): string =>
  `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`

// Effective background behind a node: a translucent ancestor only tints what it sits on,
// so keep walking and blend. A chain with nothing opaque shows the browser's white canvas.
// Shadow roots paint nothing, so the walk continues at their host.
export const get_bg_color = (element: Element | null): string => {
  let composite: Rgba | undefined
  for (let node = element; node; node = composed_parent(node)) {
    const bg_color = getComputedStyle(node).backgroundColor
    const layer = parse_color(bg_color)
    if (!layer || layer[3] === 0) continue
    // Nothing translucent above it: hand back the color as authored, unconverted
    if (!composite && layer[3] >= OPAQUE) return bg_color
    composite = composite ? composite_color(composite, layer) : layer
    if (composite[3] >= OPAQUE) return rgb_string(composite)
  }
  return composite ? rgb_string(composite_color(composite, PAGE_WHITE)) : ``
}

// The lighter choice whenever it reaches min_ratio, else the higher-contrast one (black or
// white always reaches 4.58:1). Pure max-ratio flips near-ties like #4e79a7 (black 4.62:1,
// white 4.55:1) to black, which reads worse; APCA puts white on mid-tones at 2.7-3.3:1.
export const pick_contrast_color = (options: ContrastOptions = {}): string => {
  const { bg_color, backdrop, min_ratio = 4.5, choices = [`black`, `white`] } = options
  const base = backdrop ? read_color(backdrop) : PAGE_WHITE
  if (base[3] < OPAQUE) {
    throw new Error(`pick_contrast_color: backdrop must be opaque, got \`${backdrop}\``)
  }
  // No fill of its own: the node shows the backdrop
  const background = bg_color ? composite_color(read_color(bg_color), base) : base
  const bg_luminance = relative_luminance(background)
  const luminances = choices.map((choice) =>
    relative_luminance(composite_color(read_color(choice), background)),
  )
  const ratios = luminances.map((lum) => luminance_ratio(lum, bg_luminance))
  const lighter_idx = luminances[1] >= luminances[0] ? 1 : 0
  if (ratios[lighter_idx] >= min_ratio) return choices[lighter_idx]
  return ratios[0] >= ratios[1] ? choices[0] : choices[1]
}

// Sets text color once at setup to whichever of `choices` reads better on the background
// behind the node. For dynamic fills, re-run with an explicit bg_color.
export const contrast_color =
  (options: ContrastOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    if (!(node instanceof HTMLElement)) return undefined
    const previous_color = node.style.color
    // An explicit bg_color replaces the node's own fill, so either way only its parent's
    // background shows through a translucent one
    const {
      bg_color = getComputedStyle(node).backgroundColor,
      backdrop = get_bg_color(composed_parent(node)),
    } = options
    node.style.color = pick_contrast_color({ ...options, bg_color, backdrop })
    return () => {
      node.style.color = previous_color
    }
  }
