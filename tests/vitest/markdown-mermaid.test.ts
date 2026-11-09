import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vite-plus/test'
import { mermaid_diagrams, render_mermaid } from '#lib/markdown/mermaid.ts'
import { next_task } from './index'

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
  await next_task()
  await render_mermaid(document.createElement(`div`))
}

beforeEach(() => {
  mermaid.initialize.mockImplementation((config) => {
    theme = String(config.theme)
  })
  mermaid.render.mockImplementation(async (_id, source) => ({
    svg: `<svg data-source="${source}" data-theme="${theme}"></svg>`,
  }))
})
afterEach(() => {
  document.body.replaceChildren()
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ``
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe(`render_mermaid`, () => {
  // the resolved color-scheme decides, so a custom `black` theme still gets dark diagrams;
  // a scheme allowing both (or none) follows the OS
  test.each([
    [`light`, `light`, false, `default`],
    [`dark`, `dark`, false, `dark`],
    [`black`, `dark`, false, `dark`],
    [undefined, `light`, true, `default`], // an explicit light scheme beats a dark OS
    [undefined, `light dark`, true, `dark`],
    [undefined, ``, false, `default`],
  ])(
    `data-theme=%s, color-scheme=%s, OS dark=%s renders with the %s Mermaid theme`,
    async (data_theme, scheme, os_dark, expected) => {
      if (data_theme) document.documentElement.dataset.theme = data_theme
      document.documentElement.style.colorScheme = scheme
      vi.stubGlobal(`matchMedia`, () => ({ matches: os_dark }))
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
    },
  )

  test(`an explicit config theme overrides the page scheme and config stays per call`, async () => {
    document.documentElement.dataset.theme = `dark`
    document.documentElement.style.colorScheme = `dark`
    const [themed, plain] = [diagram(`graph LR`), diagram(`graph TD`)]
    document.body.append(themed, plain)
    await render_mermaid(themed, { theme: `forest`, flowchart: { curve: `basis` } })
    expect(mermaid.initialize).toHaveBeenLastCalledWith({
      theme: `forest`,
      flowchart: { curve: `basis` },
      startOnLoad: false,
    })
    await render_mermaid(plain)
    expect(mermaid.initialize).toHaveBeenLastCalledWith({
      theme: `dark`,
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
    onTestFinished(() => error.mockRestore())
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
  })
})

describe(`mermaid_diagrams attachment`, () => {
  test(`re-renders from the authored source when the page scheme changes`, async () => {
    const container = document.createElement(`article`)
    container.append(diagram(`graph TD\n  A --> B`))
    document.body.append(container)
    const detach = mermaid_diagrams({ flowchart: { curve: `basis` } })(container)
    await settle()
    expect(container.querySelector(`svg`)?.dataset.theme).toBe(`default`)
    document.documentElement.style.colorScheme = `dark` // as apply_theme_mode sets it
    await settle()
    expect(container.querySelector(`svg`)?.dataset).toMatchObject({
      theme: `dark`,
      source: `graph TD\n  A --> B`,
    })
    expect(mermaid.render).toHaveBeenCalledTimes(2)
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: `dark`, flowchart: { curve: `basis` } }),
    )
    if (typeof detach === `function`) detach()
    document.documentElement.style.colorScheme = `light`
    await next_task()
    expect(mermaid.render).toHaveBeenCalledTimes(2) // detached, so no re-render
  })

  test(`renders diagrams added to the container later`, async () => {
    const container = document.createElement(`div`)
    document.body.append(container)
    const detach = mermaid_diagrams()(container)
    if (typeof detach === `function`) onTestFinished(detach)
    await settle()
    expect(mermaid.render).not.toHaveBeenCalled()
    container.innerHTML = `<p>Intro</p><pre class="mermaid">graph LR</pre>`
    await settle()
    expect(container.querySelector(`pre.mermaid svg`)).not.toBeNull()
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })
})
