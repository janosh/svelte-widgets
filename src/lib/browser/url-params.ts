// To preserve an intentional `key=` value, pass a non-empty default as the third item.
export type UrlParamEntry = readonly [key: string, value: string, default_value?: string]
export type ValidQueryValues<Value extends string> =
  | ReadonlySet<Value>
  | Record<string, unknown>
type UrlLocation = Pick<URL, `pathname` | `search` | `hash`>
// Only reads params, so read-only views like SvelteKit's page.url.searchParams work too.
export type QueryParams = Pick<URLSearchParams, `get`>
// Boolean flags omit their default and encode the non-default as 0 or 1.
export const bool_from_param = (
  params: QueryParams,
  key: string,
  fallback = false,
): boolean => (fallback ? params.get(key) !== `0` : params.get(key) === `1`)

export const bool_url_entry = (
  key: string,
  value: boolean,
  fallback = false,
): UrlParamEntry => [key, value === fallback ? `` : value ? `1` : `0`]

const is_valid_query_value = (
  value: string,
  valid_values: ValidQueryValues<string>,
): boolean =>
  valid_values instanceof Set
    ? valid_values.has(value)
    : Object.hasOwn(valid_values, value)

export function valid_query_param<
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
export function valid_query_param(
  params: QueryParams,
  key: string,
  fallback: string,
): string
export function valid_query_param(
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

export type WeightsConfig = Record<string, { weight: number }>

const canonical_weight_keys = (
  config: WeightsConfig,
  default_config: WeightsConfig,
): string[] => {
  const keys = Object.keys(default_config)
  if (
    Object.keys(config).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(config, key))
  )
    throw new Error(`Weight config keys must exactly match defaults: ${keys.join(`, `)}`)
  return keys
}

// Serialize weights as `a,b,c` in default_config's key order (both configs must share keys)
// at full precision, so shared links reproduce exactly. Empty string denotes the default
// configuration so URL sync omits the parameter.
export function weights_to_param(
  config: WeightsConfig,
  default_config: WeightsConfig,
): string {
  const keys = canonical_weight_keys(config, default_config)
  const bad = keys.filter(
    (key) => !(config[key].weight >= 0 && config[key].weight < Infinity),
  )
  if (bad.length)
    throw new Error(`Weights must be finite and non-negative: ${bad.join(`, `)}`)
  return keys.every((key) => config[key].weight === default_config[key].weight)
    ? ``
    : keys.map((key) => config[key].weight).join(`,`)
}

// Mutate config with weights normalized to sum to 1. Missing or malformed input resets shared
// configuration state to defaults instead of retaining stale values from an earlier URL.
export function apply_weights_param(
  param: string | null,
  config: WeightsConfig,
  default_config: WeightsConfig,
): void {
  const keys = canonical_weight_keys(config, default_config)
  // a shallow copy of the defaults would make every write below overwrite them
  if (keys.some((key) => config[key] === default_config[key]))
    throw new Error(`Weight config must not share entries with default_config`)
  // only plain decimals, so blank, padded, hex or binary tokens count as malformed
  const values =
    param
      ?.split(`,`)
      .map((token) =>
        /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token) ? Number(token) : NaN,
      ) ?? []
  const total = values.reduce((sum, value) => sum + value, 0)
  // NaN fails `>= 0`, and the total overflows to Infinity for huge weights
  if (
    values.length === keys.length &&
    values.every((value) => value >= 0) &&
    Number.isFinite(total) &&
    total > 0
  ) {
    // weights already summing to 1 up to round-off stay exact instead of shifting an ulp
    const divisor = Math.abs(total - 1) <= values.length * Number.EPSILON ? 1 : total
    for (const [idx, key] of keys.entries()) config[key].weight = values[idx] / divisor
    return
  }
  for (const key of keys) config[key].weight = default_config[key].weight
}
