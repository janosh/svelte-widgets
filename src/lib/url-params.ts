// To preserve an intentional `key=` value, pass a non-empty default as the third item.
export type UrlParamEntry = readonly [key: string, value: string, default_value?: string]
export type ValidQueryValues<Value extends string> =
  | ReadonlySet<Value>
  | Record<string, unknown>
type UrlLocation = Pick<URL, `pathname` | `search` | `hash`>
// Boolean flags omit their default and encode the non-default as 0 or 1.
export const bool_from_param = (
  params: URLSearchParams,
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
  params: URLSearchParams,
  key: string,
  fallback: Fallback,
  valid_values: Values,
):
  | Fallback
  | (Values extends ReadonlySet<infer Value>
      ? Value
      : `${Extract<keyof Values, string | number>}`)
export function valid_query_param(
  params: URLSearchParams,
  key: string,
  fallback: string,
): string
export function valid_query_param(
  params: URLSearchParams,
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
