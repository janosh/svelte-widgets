import { KeyValueList } from '#lib'
import { flushSync, type ComponentProps } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query, render } from './index'

const row_texts = (list: Element) =>
  [...list.querySelectorAll(`div`)].map((row) => [
    row.querySelector(`dt`)?.textContent,
    row.querySelector(`dd`)?.textContent,
    row.querySelector(`dd`)?.getAttribute(`title`),
  ])

test(`renders term/value rows with the full value in the title and follows updates`, () => {
  const props = $state<ComponentProps<typeof KeyValueList>>({
    rows: [
      [`Atoms`, 42],
      [`Spacings`, `1.2, 3.4, 5.6`],
    ],
    class: `caller-class`,
    style: `grid-template-columns: 1fr 1fr`,
  })
  render(KeyValueList, props)
  const list = doc_query(`dl.key-value-list.caller-class`)
  expect(list.style.gridTemplateColumns).toBe(`1fr 1fr`)
  expect(row_texts(list)).toEqual([
    [`Atoms`, `42`, `42`],
    [`Spacings`, `1.2, 3.4, 5.6`, `1.2, 3.4, 5.6`],
  ])
  props.rows = [[`Atoms`, 7]]
  flushSync()
  expect(row_texts(list)).toEqual([[`Atoms`, `7`, `7`]])
})
