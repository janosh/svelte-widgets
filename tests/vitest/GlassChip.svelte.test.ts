import { GlassChip } from '#lib'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

test(`renders children in a start-aligned chip inside a centered parent, forwarding attributes`, () => {
  const section = document.createElement(`section`)
  section.style.textAlign = `center`
  document.body.append(section)
  render(
    GlassChip,
    {
      children: raw_snippet(`<span>E = 0.1 eV</span>`),
      class: `stats`,
      style: `--glass-chip-top: 4px`,
    },
    section,
  )
  const chip = doc_query(`.glass-chip.stats`)
  expect(chip.textContent).toBe(`E = 0.1 eV`)
  expect(chip.style.getPropertyValue(`--glass-chip-top`)).toBe(`4px`)
  expect(getComputedStyle(chip).textAlign).toBe(`start`)
})
