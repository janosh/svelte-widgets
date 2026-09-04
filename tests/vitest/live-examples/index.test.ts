import * as hast from '$lib/live-examples/hast'
import * as highlighter from '$lib/live-examples/highlighter'
import * as live_examples from '$lib/live-examples/index'
import mdsvex_transform, * as mdsvex from '$lib/live-examples/mdsvex-transform'
import vite_plugin from '$lib/live-examples/vite-plugin'
import { describe, expect, test } from 'vitest'

describe(`module exports`, () => {
  test(`re-exports live-example helpers from their owner modules`, () => {
    expect(live_examples.EXAMPLE_COMPONENT_PREFIX).toBe(mdsvex.EXAMPLE_COMPONENT_PREFIX)
    expect(live_examples.EXAMPLE_MODULE_PREFIX).toBe(mdsvex.EXAMPLE_MODULE_PREFIX)
    expect(live_examples.hast_to_html).toBe(hast.hast_to_html)
    expect(live_examples.mdsvex_transform).toBe(mdsvex_transform)
    expect(live_examples.starry_night).toBe(highlighter.starry_night)
    expect(live_examples.starry_night_highlighter).toBe(
      highlighter.starry_night_highlighter,
    )
    expect(live_examples.vite_plugin).toBe(vite_plugin)
  })
})
