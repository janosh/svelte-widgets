import { yaml_plugin, type YamlOptions } from '$lib/yaml'
import { expect, test } from 'vitest'

const import_yaml = async (
  source: string,
  filename = `/data.yml`,
  options: YamlOptions = {},
) => {
  const result = await yaml_plugin(options).transform(source, filename)
  if (!result) throw new Error(`Expected YAML module`)
  return (
    await import(
      /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(result.code)}`
    )
  ).default as unknown
}

test(`exports core-schema data with dates as strings and literal prototype keys`, async () => {
  const data = await import_yaml(`date: 2026-09-07
enabled: true
count: 12
negative_zero: -0
missing: null
quoted: "yes"
__proto__: { safe: true }
base: &base { label: item }
copies: [*base, *base]
`)
  expect(data).toEqual(
    JSON.parse(
      `{"date":"2026-09-07","enabled":true,"count":12,"negative_zero":-0,"missing":null,"quoted":"yes","__proto__":{"safe":true},"base":{"label":"item"},"copies":[{"label":"item"},{"label":"item"}]}`,
    ),
  )
  expect(Object.getPrototypeOf(data)).toBe(Object.prototype)
})

test.each([
  [`42`, 42],
  [`false`, false],
  [`null`, null],
  [`hello`, `hello`],
  [`[one, two]`, [`one`, `two`]],
])(`supports a scalar or sequence document: %s`, async (source, expected) => {
  expect(await import_yaml(source)).toEqual(expected)
})

test.each([
  `data.yaml?raw`,
  `data.yml?url`,
  `CITATION.cff?raw`,
  `data.yaml.js`,
  `file.json`,
])(`leaves non-module YAML requests untouched: %s`, async (filename) =>
  expect(await yaml_plugin().transform(`invalid: [`, filename)).toBeNull(),
)

test.each([`/docs/guide.yaml`, `/CITATION.cff`])(
  `enriches YAML at build time: %s`,
  async (filename) => {
    const result = await import_yaml(`title: Guide`, filename, {
      async transform(data, source_file) {
        await Promise.resolve()
        return { data, filename: source_file }
      },
    })
    expect(result).toEqual({ data: { title: `Guide` }, filename })
  },
)

test.each([
  `bad: [`,
  `key: first\nkey: second`,
  `value: .inf`,
  `value: .nan`,
  `&self [*self]`,
  ``,
])(`rejects malformed or non-JSON data with filename context: %s`, async (source) => {
  await expect(yaml_plugin().transform(source, `/content/broken.yaml`)).rejects.toThrow(
    `/content/broken.yaml`,
  )
})

test.each([
  undefined,
  new Date(`2026-09-07`),
  { value: undefined },
  { value: 1n },
  Array(1),
])(`rejects unsupported transform results: %s`, async (data) => {
  await expect(
    yaml_plugin({ transform: () => data }).transform(`ok: true`, `/data.yaml`),
  ).rejects.toThrow(`/data.yaml`)
})
