// A multi-column TableSort[] <-> one query param such as `?sort=`: column ids in priority order, comma-separated, a leading `-` marking
// descending (`?sort=-energy,force`). `?sort=` (empty) is an explicitly unsorted table; a
// missing param means the default sort.
import type { QueryParams, UrlParamEntry } from '../browser/url-params'
import type { TableSort } from './data-table'

const encodable_column = (column: string): boolean =>
  column !== `` && !column.startsWith(`-`) && !column.includes(`,`)

// copies the entries too, so callers editing the result can't change the default
const copy = (sort: readonly TableSort[]): TableSort[] =>
  sort.map((entry) => ({ ...entry }))

const sort_to_param = (sort: readonly TableSort[]): string =>
  sort
    .map(({ column, dir }) => {
      if (!encodable_column(column)) {
        throw new Error(
          `Sort column ${JSON.stringify(column)} can't be a URL param: ids must be non-empty, comma-free and not start with -`,
        )
      }
      return `${dir === `desc` ? `-` : ``}${column}`
    })
    .join(`,`)

// Malformed, duplicate or (given valid_columns) unknown columns fall back to default_sort
// as a whole rather than keeping a partial sort the link's author never saw.
export function sort_from_param(
  params: QueryParams,
  key: string,
  default_sort: readonly TableSort[],
  valid_columns?: ReadonlySet<string>,
): TableSort[] {
  const value = params.get(key)
  if (value === null) return copy(default_sort)
  if (value === ``) return []
  const sort = value
    .split(`,`)
    .map((token): TableSort =>
      token.startsWith(`-`)
        ? { column: token.slice(1), dir: `desc` }
        : { column: token, dir: `asc` },
    )
  const columns = sort.map(({ column }) => column)
  const valid =
    new Set(columns).size === columns.length &&
    columns.every(
      (column) => encodable_column(column) && (valid_columns?.has(column) ?? true),
    )
  return valid ? sort : copy(default_sort)
}

// Throws for column ids the encoding can't represent (empty, containing `,`, leading `-`).
export const sort_url_entry = (
  key: string,
  sort: readonly TableSort[],
  default_sort: readonly TableSort[],
): UrlParamEntry => [key, sort_to_param(sort), sort_to_param(default_sort)]
