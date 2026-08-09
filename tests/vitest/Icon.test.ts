import { Icon } from '$lib'
import * as icons from '$lib/icons'
import type { IconData } from '$lib/icons'
import { escape_template_literal } from '$root/scripts/generate-icons'
import { readFileSync } from 'node:fs'
import { mount } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'
import { doc_query } from './index'

test.each([
  [`plain`, `plain`],
  [String.raw`back\slash`, String.raw`back\\slash`],
  [`tick\``, `tick\\\``],
  [`\${value}`, `\\\${value}`],
])(`escapes template-literal input %j as %j`, (input, expected) => {
  expect(escape_template_literal(input)).toBe(expected)
})

// The manifest is edited by hand and merged across branches, so both invariants drift easily.
// The generator rejects duplicate ids and custom.ts clashes; ordering has no other guard.
describe(`icons-manifest`, () => {
  const source = readFileSync(
    `${import.meta.dirname}/../../scripts/icons-manifest.ts`,
    `utf8`,
  )
  // A section header is a bare lowercase tag. Explanatory notes sit at the same indent, so
  // anything wordier continues the current section instead of opening a new one — treating
  // one as a header would silently restart the ordering run and hide entries after it.
  const sections: string[][] = []
  for (const line of source.split(`\n`)) {
    if (/^ {2}\/\/ [a-z][a-z\d &:]*$/u.test(line)) sections.push([])
    const name = /^ {2}(?<name>\w+): `/u.exec(line)?.groups?.name
    if (!name) continue
    const section = sections.at(-1)
    // Dropping it instead would exempt the entry from both checks below
    if (!section) throw new Error(`icon \`${name}\` precedes the first section header`)
    section.push(name)
  }
  const names = sections.flat()

  test(`finds icon names in the manifest`, () => {
    // Both checks below are satisfied by an empty parse, so a manifest reformat that broke
    // either regex would quietly retire them rather than fail.
    expect(names.length).toBeGreaterThan(0)
  })

  test(`lists every section alphabetically`, () => {
    const out_of_order = sections.flatMap((section) =>
      section.filter(
        (name, idx) => idx > 0 && section[idx - 1].toLowerCase() > name.toLowerCase(),
      ),
    )
    expect(out_of_order).toEqual([])
  })

  test(`spells acronyms consistently`, () => {
    // `API`/`DOI`/`SQLite`/`GraphQL` set the convention: acronyms stay upper-case
    const lower_cased =
      /(?<![A-Z])(?:Api|Css|Html|Json|Pdf|Csv|Xml|Sql|Cpu|Gpu|Ssh|Usb|Vpn|Dna|Qr)(?![a-z])/u
    expect(names.filter((name) => lower_cased.test(name))).toEqual([])
  })
})

describe(`Icon`, () => {
  // Every entry, not a sample: the set is merged from another repo, and markup holding
  // several shapes rather than one `d` renders as nothing unless Icon spots the markup.
  // Offenders are collected so a bad merge names every icon it broke, not just the first.
  test(`every icon renders its viewBox, fill, stroke and shape`, () => {
    const offenders: string[] = []
    // annotated because the inferred literal types drop the optional keys entirely
    for (const [name, entry] of Object.entries<IconData>(icons)) {
      document.body.innerHTML = ``
      mount(Icon, { target: document.body, props: { icon: entry } })
      const svg = doc_query<SVGSVGElement>(`svg`)
      const { viewBox, stroke, fill = stroke ? `none` : `currentColor` } = entry

      if (svg.getAttribute(`viewBox`) !== viewBox) offenders.push(`${name}: viewBox`)
      if (svg.getAttribute(`fill`) !== fill) offenders.push(`${name}: fill`)
      if ((svg.getAttribute(`stroke`) ?? undefined) !== stroke)
        offenders.push(`${name}: stroke`)
      if (`markup` in entry) {
        if (svg.childElementCount === 0) offenders.push(`${name}: markup`)
        if (svg.innerHTML.includes(`d="<`)) offenders.push(`${name}: markup in d`)
      } else if (svg.querySelector(`path`)?.getAttribute(`d`) !== entry.d) {
        offenders.push(`${name}: d`)
      }
    }
    expect(offenders).toEqual([])
  })

  // Only hand-drawn glyphs are stroked; every generated one paints with `fill`
  test.each([
    `Histogram`,
    `Issues`,
    `Materials`,
    `Magnetic`,
    `NeuralNetwork`,
    `RepoFork`,
  ] as const)(`defines %s as a currentColor stroke`, (name) => {
    expect(icons[name].stroke).toBe(`currentColor`)
  })

  test(`Histogram contains one baseline subpath`, () => {
    expect(icons.Histogram.d.match(/M4 42h40/g)).toHaveLength(1)
  })

  test(`applies attributes via rest props`, () => {
    const rest_props = {
      style: `width: 2em;`,
      'aria-label': `Checkmark icon`,
      role: `presentation`, // beats the component's own role="img"
      'data-name': `disabled-icon`,
    } as const
    mount(Icon, {
      target: document.body,
      props: { icon: icons.Check, class: `custom-class`, ...rest_props },
    })

    const svg = doc_query<SVGSVGElement>(`svg`)
    for (const [attr, value] of Object.entries(rest_props)) {
      expect(svg.getAttribute(attr)).toBe(value)
    }
    // class merges with Svelte's scoped class, so it has no verbatim value to compare
    expect(svg.classList.contains(`custom-class`)).toBe(true)
  })

  // happy-dom does no layout, so the sizing contract is read off the source. `auto`
  // height is what keeps the non-square viewBoxes from being squashed.
  test(`sizes off --icon-size, defaulting height to auto`, async () => {
    const { default: source } = await import(`$lib/Icon.svelte?raw`)
    expect(source).toContain(`width: var(--icon-size, 1em)`)
    expect(source).toContain(`height: var(--icon-size, auto)`)
  })

  // For an app's own chrome glyphs, which do not belong in the shared set
  test(`renders a caller-supplied path, and never injects markup through it`, () => {
    mount(Icon, { target: document.body, props: { path: `M5 5`, viewBox: `0 0 10 10` } })
    const plain = doc_query<SVGSVGElement>(`svg`)
    expect(plain.querySelector(`path`)?.getAttribute(`d`)).toBe(`M5 5`)
    expect(plain.getAttribute(`viewBox`)).toBe(`0 0 10 10`)

    // {@html} is reserved for icons, so a caller's path lands escaped in `d`
    document.body.innerHTML = ``
    const injection = `<circle cx="12" r="10" />`
    mount(Icon, { target: document.body, props: { path: injection, stroke: `red` } })
    const svg = doc_query<SVGSVGElement>(`svg`)
    expect(svg.querySelector(`circle`)).toBeNull()
    expect(svg.querySelector(`path`)?.getAttribute(`d`)).toBe(injection)
    expect(svg.getAttribute(`stroke`)).toBe(`red`)
    expect(svg.getAttribute(`fill`)).toBe(`none`)
  })
})
