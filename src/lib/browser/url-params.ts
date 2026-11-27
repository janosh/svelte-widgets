// To preserve an intentional `key=` value, pass a non-empty default as the third item.
export type UrlParamEntry = readonly [key: string, value: string, default_value?: string]
export type ValidQueryValues<Value extends string> =
  | ReadonlySet<Value>
  | Record<string, unknown>
type UrlLocation = Pick<URL, `pathname` | `search` | `hash`>
// Only reads params, so read-only views like SvelteKit's page.url.searchParams work too.
export type QueryParams = Pick<URLSearchParams, `get`>
// Boolean flags encode as 0 or 1 and are omitted at their default.
export const bool_from_param = (
  params: QueryParams,
  key: string,
  fallback = false,
): boolean => (fallback ? params.get(key) !== `0` : params.get(key) === `1`)

export const bool_url_entry = (
  key: string,
  value: boolean,
  fallback = false,
): UrlParamEntry => [key, value ? `1` : `0`, fallback ? `1` : `0`]

const is_valid_query_value = (
  value: string,
  valid_values: ValidQueryValues<string>,
): boolean =>
  valid_values instanceof Set
    ? valid_values.has(value)
    : Object.hasOwn(valid_values, value)

export function string_from_param<
  Fallback extends string,
  Values extends ValidQueryValues<string>,
>(
  params: QueryParams,
  key: string,
  fallback: Fallback,
  valid_values: Values,
):
  | Fallback
  | (Values extends ReadonlySet<infer Value>
      ? Value
      : `${Extract<keyof Values, string | number>}`)
export function string_from_param(
  params: QueryParams,
  key: string,
  fallback: string,
): string
export function string_from_param(
  params: QueryParams,
  key: string,
  fallback: string,
  valid_values?: ValidQueryValues<string>,
): string {
  const value = params.get(key)
  return value === null ||
    (valid_values ? !is_valid_query_value(value, valid_values) : value === ``)
    ? fallback
    : value
}

// Return a relative URL with entries merged into its existing query parameters.
export function url_with_params(
  entries: readonly UrlParamEntry[],
  current_url: UrlLocation,
): string {
  const params = new URLSearchParams(current_url.search)
  for (const [key, value, default_value = ``] of entries) {
    if (value === default_value) params.delete(key)
    else params.set(key, value)
  }
  // Commas are legal RFC 3986 sub-delimiters and aid readability in list values.
  const query = params.toString().replaceAll(`%2C`, `,`)
  return `${current_url.pathname}${query ? `?${query}` : ``}${current_url.hash}`
}

// Write only when entries produce a different relative URL.
export function sync_url_params(
  entries: readonly UrlParamEntry[],
  current_url: UrlLocation,
  write_url: (url: string) => void,
): void {
  const next_url = url_with_params(entries, current_url)
  if (next_url !== url_with_params([], current_url)) write_url(next_url)
}

// A fixed-length list of numbers (e.g. score weights) as one `key=a,b,c` param, at full
// precision so shared links reproduce exactly. Equal to defaults, the param is omitted.
// Negative values encode fine but read back as defaults under `normalize`.
export function numbers_url_entry(
  key: string,
  values: readonly number[],
  defaults: readonly number[],
): UrlParamEntry {
  if (values.length !== defaults.length || !values.every(Number.isFinite))
    throw new Error(
      `${key}: need ${defaults.length} finite numbers, got ${values.join(`, `)}`,
    )
  return [key, values.join(`,`), defaults.join(`,`)]
}

// A missing, malformed (anything but plain decimals) or wrong-length param gives a copy of
// defaults, never a partial list. `normalize` scales the values to sum to 1, treating negative
// values or a zero total as malformed.
export function numbers_from_param(
  params: QueryParams,
  key: string,
  defaults: readonly number[],
  { normalize = false } = {},
): number[] {
  const values =
    params
      .get(key)
      ?.split(`,`)
      .map((token) =>
        /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token) ? Number(token) : NaN,
      ) ?? []
  // a sum of huge values overflows to Infinity, which only matters when dividing by it
  const total = values.reduce((sum, value) => sum + value, 0)
  const valid =
    values.length === defaults.length &&
    values.every(Number.isFinite) &&
    (!normalize ||
      (Number.isFinite(total) && total > 0 && values.every((value) => value >= 0)))
  if (!valid) return [...defaults]
  if (!normalize) return values
  // values already summing to 1 up to round-off stay exact instead of shifting an ulp
  const divisor = Math.abs(total - 1) <= values.length * Number.EPSILON ? 1 : total
  return values.map((value) => value / divisor)
}
