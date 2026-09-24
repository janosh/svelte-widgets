import LiteYouTubeEmbed from '$lib/LiteYouTubeEmbed.svelte'
import { type ComponentProps, mount, tick } from 'svelte'
import { afterAll, expect, test, vi } from 'vitest'
import { doc_query } from './index'

// happy-dom navigates an iframe's src for real, so intercept every request locally
// instead of hitting youtube.com, recording what was asked for
const { settings } = (
  globalThis as unknown as {
    happyDOM: { settings: { fetch: Record<string, unknown> } }
  }
).happyDOM
const fetched: string[] = []
const original_interceptor = settings.fetch.interceptor
settings.fetch.interceptor = {
  beforeAsyncRequest: ({ request }: { request: { url: string } }) => {
    fetched.push(request.url)
    return new Response(``)
  },
}
afterAll(() => {
  settings.fetch.interceptor = original_interceptor
})

const mount_embed = async (
  props: Partial<ComponentProps<typeof LiteYouTubeEmbed>> = {},
) => {
  const state_props = $state({ video_id: `abc123`, ...props })
  mount(LiteYouTubeEmbed, { target: document.body, props: state_props })
  await tick()
  return state_props
}
const iframes = () => document.querySelectorAll(`iframe`)
const click = async (selector = `button.play-btn`) => {
  doc_query(selector).click()
  await tick()
}
const poster_urls = () => [
  doc_query(`picture source`).getAttribute(`srcset`),
  doc_query(`img.poster`).getAttribute(`src`),
]

// the entire point of the component: an unwatched embed costs one image, not a player
test.each([`button.play-btn`, `img.poster`])(
  `has no iframe until %s is clicked, then exactly one`,
  async (selector) => {
    // rest is spread ahead of the component's own onclick, so unchained this is dropped
    const consumer_click = vi.fn()
    await mount_embed({ onclick: consumer_click })
    expect(iframes()).toHaveLength(0)

    await click(selector)
    expect(iframes()).toHaveLength(1)
    expect(consumer_click).toHaveBeenCalledOnce()

    await click(selector) // a second click must not stack a second player
    expect(iframes()).toHaveLength(1)
  },
)

test(`builds both poster sources and the labels from video_id`, async () => {
  const props = await mount_embed({
    video_id: `xyz789`,
    play_label: `Watch the talk`,
    iframe_title: `Talk player`,
  })
  expect(poster_urls()).toEqual([
    `https://i.ytimg.com/vi_webp/xyz789/hqdefault.webp`,
    `https://i.ytimg.com/vi/xyz789/hqdefault.jpg`,
  ])
  expect(doc_query(`picture source`).getAttribute(`type`)).toBe(`image/webp`)
  // the poster is decorative, so the play button is the only thing carrying the label
  expect(doc_query<HTMLImageElement>(`img.poster`).alt).toBe(``)
  expect(doc_query(`button.play-btn`).getAttribute(`aria-label`)).toBe(`Watch the talk`)

  await click()
  expect(doc_query(`iframe`).getAttribute(`title`)).toBe(`Talk player`)

  props.video_id = `a b/c`
  await tick()
  expect(poster_urls()).toEqual([
    `https://i.ytimg.com/vi_webp/a%20b%2Fc/hqdefault.webp`,
    `https://i.ytimg.com/vi/a%20b%2Fc/hqdefault.jpg`,
  ])
})

const nocookie_embed = `https://www.youtube-nocookie.com/embed`
test.each([
  [`defaults to youtube-nocookie`, {}, `${nocookie_embed}/abc123?autoplay=1`],
  [
    `nocookie=false opts into the tracking host`,
    { nocookie: false },
    `https://www.youtube.com/embed/abc123?autoplay=1`,
  ],
  [
    `empty player_params drops the default autoplay`,
    { player_params: {} },
    `${nocookie_embed}/abc123`,
  ],
  [
    `player_params replace the default rather than merging`,
    { player_params: { start: 90, list: `PLabc` } },
    `${nocookie_embed}/abc123?start=90&list=PLabc`,
  ],
  [
    `video_id is url-encoded`,
    { video_id: `a b/c` },
    `${nocookie_embed}/a%20b%2Fc?autoplay=1`,
  ],
])(`iframe src: %s`, async (_desc, props, expected_src) => {
  await mount_embed(props)
  await click()
  expect(doc_query(`iframe`).getAttribute(`src`)).toBe(expected_src)
})

test(`a new video_id tears the player back down to the poster`, async () => {
  const props = await mount_embed({ video_id: `first` })
  await click()
  expect(iframes()).toHaveLength(1)

  fetched.length = 0
  props.video_id = `second`
  await tick()

  expect(iframes()).toHaveLength(0)
  // teardown must be synchronous: one render with the old iframe up already starts
  // loading the new video, the exact cost this component exists to avoid
  expect(fetched).toEqual([])
})

test(`forwards host and nested props and makes the active play button inert`, async () => {
  const nested_props = {
    class: `my-embed`,
    style: `--lite-youtube-bg: navy`,
    play_btn_props: { class: `big-play`, style: `opacity: 0.9`, title: `Go` },
    iframe_props: { loading: `lazy`, referrerpolicy: `no-referrer` },
  } satisfies Partial<ComponentProps<typeof LiteYouTubeEmbed>>
  // Untyped consumers must not override attributes owned by the component.
  Reflect.set(nested_props.play_btn_props, `type`, `submit`)
  Reflect.set(nested_props.play_btn_props, `aria-label`, `Wrong label`)
  Reflect.set(nested_props.iframe_props, `src`, `https://example.com/wrong`)
  Reflect.set(nested_props.iframe_props, `srcdoc`, `<h1>Wrong document</h1>`)
  Reflect.set(nested_props.iframe_props, `title`, `Wrong title`)
  await mount_embed(nested_props)

  const wrapper = doc_query(`div.lite-youtube`)
  const play = doc_query<HTMLButtonElement>(`button.play-btn`)
  expect(wrapper.classList.contains(`my-embed`)).toBe(true)
  expect(wrapper.classList.contains(`activated`)).toBe(false)
  expect(wrapper.getAttribute(`style`)).toBe(`--lite-youtube-bg: navy;`)
  expect(play.classList.contains(`big-play`)).toBe(true)
  expect([
    play.type,
    play.getAttribute(`style`),
    play.getAttribute(`title`),
    play.getAttribute(`aria-label`),
    play.hasAttribute(`inert`),
  ]).toEqual([`button`, `opacity: 0.9;`, `Go`, `Play`, false])

  await click()
  expect(wrapper.classList.contains(`activated`)).toBe(true)
  expect(play.hasAttribute(`inert`)).toBe(true)
  const iframe = doc_query(`iframe`)
  expect([
    iframe.getAttribute(`loading`),
    iframe.getAttribute(`referrerpolicy`),
    iframe.getAttribute(`title`),
    iframe.hasAttribute(`srcdoc`),
    iframe.getAttribute(`src`),
  ]).toEqual([
    `lazy`,
    `no-referrer`,
    `YouTube video player`,
    false,
    `${nocookie_embed}/abc123?autoplay=1`,
  ])
})
