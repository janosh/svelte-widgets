import { get_html_sort_value } from '$lib/attachments'
import { describe, expect, it } from 'vite-plus/test'
import { create_element } from '../index'

describe(`get_html_sort_value`, () => {
  const add_data_sort = (element: HTMLElement, value: string) =>
    element.setAttribute(`data-sort-value`, value)
  const add_text = (element: HTMLElement, text: string) => (element.textContent = text)

  it.each([
    [`data-sort-value wins over text`, `custom-value`, `Different text`, `custom-value`],
    [`an empty data-sort-value stays empty`, ``, `Some text`, ``],
    [`textContent when no data-sort-value`, null, `Element text`, `Element text`],
    [`an empty element`, null, null, ``],
    [`whitespace textContent verbatim`, null, `   \n\t   `, `   \n\t   `],
  ])(`%s`, (_desc, data_sort_value, text_content, expected) => {
    const element = create_element()
    if (data_sort_value !== null) add_data_sort(element, data_sort_value)
    if (text_content !== null) add_text(element, text_content)
    expect(get_html_sort_value(element)).toBe(expected)
  })

  it(`returns the first descendant data-sort-value recursively`, () => {
    const [parent, child, grandchild, sibling] = [
      create_element(),
      create_element(`span`),
      create_element(`em`),
      create_element(`span`),
    ]
    add_text(parent, `Parent text`)
    add_text(child, `Child text`)
    add_data_sort(grandchild, `grandchild-value`)
    add_data_sort(sibling, `sibling-value`)
    add_text(grandchild, `Grandchild text`)
    child.append(grandchild)
    parent.append(child, sibling)
    expect(get_html_sort_value(parent)).toBe(`grandchild-value`)
  })
})
