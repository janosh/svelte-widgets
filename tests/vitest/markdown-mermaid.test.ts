import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  configure_mermaid,
  mermaid_diagrams,
  render_mermaid,
} from '#lib/markdown/mermaid.ts'

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn<(config: Record<string, unknown>) => void>(),
  render:
    vi.fn<
      (id: string, source: string) => Promise<{ svg: string; bindFunctions?: () => void }>
    >(),
}))
vi.mock(`mermaid`, () => ({ default: mermaid }))

let theme = `default`
const diagram = (source: string) => {
  const block = document.createElement(`pre`)
  block.className = `mermaid`
  block.textContent = source
  return block
}
// Let observer callbacks queue their renders, then wait for the queue: rendering an empty
// element resolves after all earlier renders without rendering anything itself
const settle = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
  await render_mermaid(document.createElement(`div`))
}

beforeEach(() => {
  mermaid.initialize.mockImplementation((config) => {
    theme = String(config.theme)
  })
  mermaid.render.mockImplementation(async (_id, source) => ({
    svg: `<svg data-source="${source}" data-theme="${theme}"></svg>`,
  }))
  configure_mermaid({})
})
afterEach(() => {
  document.body.replaceChildren()
  delete document.documentElement.dataset.theme
  vi.clearAllMocks()
})

describe(`render_mermaid`, () => {
  test.each([
    [`light`, `default`],
    [`dark`, `dark`],
  ])(`data-theme=%s renders with the %s Mermaid theme`, async (scheme, expected) => {
    document.documentElement.dataset.theme = scheme
    const block = diagram(`graph TD\n  A --> B`)
    document.body.append(block)
    await render_mermaid(block)
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: expected, startOnLoad: false }),
    )
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^widgets-mermaid-\d+$/u),
      `graph TD\n  A --> B`,
    )
    expect(block.querySelector(`svg`)?.dataset).toMatchObject({
      source: `graph TD\n  A --> B`,
      theme: expected,
    })
    expect(block.dataset.mermaidTheme).toBe(expected)
  })

  test(`an explicit configured theme overrides the page scheme`, async () => {
    configure_mermaid({ theme: `forest`, flowchart: { curve: `basis` } })
    document.documentElement.dataset.theme = `dark`
    const block = diagram(`graph LR`)
    document.body.append(block)
    await render_mermaid(document.body)
    expect(mermaid.initialize).toHaveBeenCalledWith({
      theme: `forest`,
      flowchart: { curve: `basis` },
      startOnLoad: false,
    })
  })

  test(`skips blocks already rendered with the current theme and detached blocks`, async () => {
    const block = diagram(`graph TD`)
    document.body.append(block)
    await render_mermaid(document.body)
    await render_mermaid(document.body)
    await render_mermaid(diagram(`graph LR`))
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })

  test(`a failing diagram keeps its source, records the error and logs it`, async () => {
    const error = vi.spyOn(console, `error`).mockImplementation(() => undefined)
    mermaid.render.mockRejectedValueOnce(new Error(`Parse error on line 1`))
    const [broken, valid] = [diagram(`graph <<`), diagram(`graph TD`)]
    document.body.append(broken, valid)
    await render_mermaid(document.body)
    expect(broken.textContent).toBe(`graph <<`)
    expect(broken.dataset.mermaidError).toBe(`Parse error on line 1`)
    expect(error).toHaveBeenCalledWith(
      `Mermaid diagram failed to render: Parse error on line 1`,
      expect.objectContaining({ source: `graph <<` }),
    )
    // one broken diagram does not stop the rest
    expect(valid.querySelector(`svg`)).not.toBeNull()
    error.mockRestore()
  })
})

describe(`mermaid_diagrams attachment`, () => {
  test(`re-renders from the authored source when data-theme changes`, async () => {
    const container = document.createElement(`article`)
    container.append(diagram(`graph TD\n  A --> B`))
    document.body.append(container)
    const detach = mermaid_diagrams(container)
    await settle()
    expect(container.querySelector(`svg`)?.dataset.theme).toBe(`default`)
    document.documentElement.dataset.theme = `dark`
    await settle()
    expect(container.querySelector(`svg`)?.dataset).toMatchObject({
      theme: `dark`,
      source: `graph TD\n  A --> B`,
    })
    expect(mermaid.render).toHaveBeenCalledTimes(2)
    if (typeof detach === `function`) detach()
    document.documentElement.dataset.theme = `light`
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(mermaid.render).toHaveBeenCalledTimes(2)
  })

  test(`renders diagrams added to the container later`, async () => {
    const container = document.createElement(`div`)
    document.body.append(container)
    const detach = mermaid_diagrams(container)
    await settle()
    expect(mermaid.render).not.toHaveBeenCalled()
    container.innerHTML = `<p>Intro</p><pre class="mermaid">graph LR</pre>`
    await settle()
    expect(container.querySelector(`pre.mermaid svg`)).not.toBeNull()
    expect(mermaid.render).toHaveBeenCalledTimes(1)
    if (typeof detach === `function`) detach()
  })
})
