// Grammar loading is deferred until the first highlighting request.
export {
  create_highlighter,
  type Grammar,
  type Highlighter,
  type HighlighterOptions,
  type StarryNight,
} from './create-highlighter.ts'
export {
  configure_default_highlighter,
  default_highlighter,
} from './default-highlighter.ts'
export { hast_to_html } from './hast.ts'
