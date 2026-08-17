import { render_block, type StarryNight } from './create-highlighter.ts'
import { default_highlighter } from './default-highlighter.ts'

export const starry_night: StarryNight = await default_highlighter.ready()

export const starry_night_highlighter = (code: string, lang?: string | null): string =>
  render_block(starry_night, code, lang)
