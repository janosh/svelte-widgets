import { InfoCard } from '#lib'
import type { InfoCardItem } from '#lib'
import { describe, expect, test } from 'vite-plus/test'
import { doc_query, render } from './index'

describe(`InfoCard`, () => {
  const value_text = () => doc_query(`strong`).textContent?.replaceAll(/\s+/g, ` `).trim()
  const fixed = (digits: number) => (num: number) => num.toFixed(digits)

  test.each<[InfoCardItem, string]>([
    [{ label: `Energy`, value: Math.PI, format: fixed(2) }, `3.14`], // row format wins
    [{ label: `Energy`, value: Math.PI }, `3.142`], // card-level format
    [{ label: `Magmom`, value: [1.2, -1.2, 0], unit: `μB` }, `1.200, -1.200, 0.000 μB`],
    [{ label: `Label`, value: `Fe<sub>2</sub>O<sub>3</sub>` }, `Fe2O3`],
    [{ label: `Band gap`, value: 1.5, unit: `eV` }, `1.500 eV`],
    [{ label: `Charge`, value: 0 }, `0.000`], // zero is a value, not a missing one
    [{ label: `F<sub>max</sub>`, value: 1.5, unit: `eV/Å` }, `1.500 eV/Å`],
  ])(`renders %j as %p`, (item, expected) => {
    render(InfoCard, { items: [item], format: fixed(3) })
    expect(value_text()).toBe(expected)
    // the native tooltip shows the label's text, not its markup (was `F<sub>max</sub>`)
    expect(doc_query(`.label`).title).toBe(item.label.replaceAll(/<[^>]+>/g, ``))
    if (item.unit) expect(doc_query(`strong small`).textContent).toBe(item.unit)
  })

  test(`defaults to format_num`, () => {
    render(InfoCard, { items: [{ label: `Big`, value: 1234567.891 }] })
    expect(value_text()).toBe(`1.23M`) // adaptive SI default
  })

  test(`hides null/undefined values, falls back when nothing remains`, () => {
    const unmount_card = render(InfoCard, {
      title: `E<sub>hull</sub>`,
      items: [
        { label: `Present`, value: `yes`, tooltip: `tip` },
        { label: `Null`, value: null },
        { label: `Undef`, value: undefined },
        { label: `Unset` },
      ],
      fallback: `No data`,
    })
    expect(doc_query(`h2 sub`).textContent).toBe(`hull`)
    expect(document.querySelectorAll(`.info-card div`)).toHaveLength(1)
    expect(value_text()).toBe(`yes`)
    expect(doc_query(`strong`).title).toBe(`tip`)
    expect(document.body.textContent).not.toContain(`No data`)
    void unmount_card()

    render(InfoCard, {
      items: [{ label: `Gone`, value: null }],
      fallback: `No data available`,
    })
    expect(document.querySelectorAll(`.info-card div`)).toHaveLength(0)
    expect(document.querySelector(`h2`)).toBeNull()
    expect(doc_query(`.info-card`).textContent?.trim()).toBe(`No data available`)
  })
})
