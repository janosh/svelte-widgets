import { get_html_sort_value } from '$lib/attachments'
import { describe, expect, it } from 'vitest'
import { create_element } from '../index'

describe(`get_html_sort_value`, () => {
  it.each([
    [`data-sort-value wins over text`, `custom-value`, `Different text`, `custom-value`],
    [`an empty data-sort-value stays empty`, ``, `Some text`, ``],
    [`textContent when no data-sort-value`, null, `Element text`, `Element text`],
    [`an empty element`, null, null, ``],
    [`whitespace textContent verbatim`, null, `   \n\t   `, `   \n\t   `],
  ])(`%s`, (_desc, data_sort_value, text_content, expected) => {
    const element = create_element()
    if (data_sort_value !== null) element.dataset.sortValue = data_sort_value
    if (text_content !== null) element.textContent = text_content
    expect(get_html_sort_value(element)).toBe(expected)
  })

  it.each([
    [`complete cell text`, `Item <strong>20</strong> kg`, `Item 20 kg`],
    [
      `key after text`,
      `<span>Visible label</span><span data-sort-value="2">Two</span>`,
      `2`,
    ],
    [`empty key`, `<span data-sort-value=""></span><span>Visible label</span>`, ``],
    [
      `first nested key`,
      `Parent text<span>Child text<em data-sort-value="grandchild-value">Grandchild text</em></span><span data-sort-value="sibling-value">Sibling text</span>`,
      `grandchild-value`,
    ],
  ])(`reads %s`, (_desc, markup, expected) => {
    const element = create_element()
    element.innerHTML = markup
    expect(get_html_sort_value(element)).toBe(expected)
  })
})
