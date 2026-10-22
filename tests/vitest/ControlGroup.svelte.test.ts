import { ControlGroup } from '#lib'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

test(`renders a fieldset named by its legend around the controls, forwarding attributes`, () => {
  render(ControlGroup, {
    legend: `Stacking`,
    children: raw_snippet(`<label>Gap <input type="number" /></label>`),
    class: `sliders`,
    disabled: true,
  })
  const fieldset = doc_query<HTMLFieldSetElement>(`fieldset.control-group.sliders`)
  const legend = fieldset.firstElementChild
  expect([legend?.tagName, legend?.textContent]).toEqual([`LEGEND`, `Stacking`])
  expect(fieldset.querySelector(`input`)).not.toBeNull()
  expect(fieldset.disabled).toBe(true)
})
