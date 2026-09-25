import { Spinner } from '$lib'
import { expect, test, vi } from 'vitest'
import { doc_query, render } from './index'

test.each([
  [undefined, null],
  [`Processing...`, `Processing...`],
])(
  `text=%j renders a live status region with text %j and forwarded props`,
  (text, expected) => {
    // happy-dom drops border-width values containing var(), so inspect the DOM assignment.
    const styles = vi.spyOn(CSSStyleDeclaration.prototype, `cssText`, `set`)
    render(Spinner, {
      text,
      id: `custom-id`,
      class: `caller-class`,
      style: `--spinner-size: 60px; --spinner-color: red`,
    })
    const container = doc_query(
      `.spinner.caller-class[role="status"][aria-live="polite"]`,
    )
    expect(container.hasAttribute(`aria-busy`)).toBe(false)
    expect(container.getAttribute(`aria-label`)).toBe(text ? null : `Loading`)
    expect(container.id).toBe(`custom-id`)
    expect(container.style.getPropertyValue(`--spinner-size`)).toBe(`60px`)
    expect(container.style.getPropertyValue(`--spinner-color`)).toBe(`red`)
    // The decorative spinner is separate from the accessible status text.
    expect(container.children).toHaveLength(expected === null ? 1 : 2)
    expect(styles).toHaveBeenCalledWith(
      expect.stringContaining(`border-width: var(--spinner-border-width, 2px)`),
    )
    expect(container.querySelector(`span`)?.textContent ?? null).toBe(expected)
  },
)
