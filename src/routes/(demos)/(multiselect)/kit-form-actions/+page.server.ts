import { fail } from '@sveltejs/kit'
import { colors as allowed_colors } from '$site/options'
import type { Actions } from './$types'

// Form actions need a server, so the underscore prefix disables this export during static
// build. Rename `_actions` to `actions` to test locally with `npm run dev`.
// eslint-disable-next-line no-underscore-dangle -- intentionally disabled for static builds
export const _actions = {
  'validate-form': async ({ request }) => {
    const data = await request.formData()
    let colors = data.get(`colors`)

    // failures return an empty array so the client can bind the result to MultiSelect's
    // `selected` prop without type checks
    if (!colors || typeof colors !== `string`) {
      return fail(400, { colors: [], error: `missing` })
    }

    try {
      colors = JSON.parse(colors)
    } catch (error) {
      return fail(400, {
        colors: [],
        error: `json: ${String(error)}`,
      })
    }

    if (!Array.isArray(colors)) {
      return fail(400, { colors: [], error: `array` })
    }
    // filtered so a hand-crafted POST cannot echo arbitrary strings back into the page,
    // deduped so a repeated `Red` cannot slip past the single-color check below
    const valid_colors = colors.filter(
      (color: unknown, color_idx): color is string =>
        typeof color === `string` &&
        allowed_colors.includes(color) &&
        colors.indexOf(color) === color_idx,
    )
    if (valid_colors.length === 0) {
      return fail(400, { colors: [], error: `missing` })
    }
    if (valid_colors.length === 1 && valid_colors[0] === `Red`) {
      return fail(400, { colors: valid_colors, error: `boring` })
    }

    return { colors: valid_colors, success: true }
  },
} satisfies Actions
