// Grammar loading is deferred until the first highlighting request.
export {
  create_highlighter,
  type Grammar,
  type Highlighter,
  type StarryNight,
} from './create-highlighter.ts'
export { default_highlighter } from './default-highlighter.ts'
export { hast_to_html } from './hast.ts'
