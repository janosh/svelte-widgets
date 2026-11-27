// Docs prop_docs_plugin extracts and PropsTable renders. Vite-free, so component consumers
// never type-depend on vite or typescript.
export type PropDoc = {
  name: string
  type?: string // as written in the declaring type, on one line
  default?: string // destructuring initializer, $bindable(...) and type assertions unwrapped
  // the literal a constant or setting default stands for (`DEFAULT_FPS` -> `24`)
  default_value?: string
  description?: string
  bindable?: true
  required?: true
}

export type ComponentDoc = {
  props: PropDoc[]
  // what a `...rest` binding passes on, e.g. `<div>`: the element whose HTML attributes the
  // component also accepts (`HTML` when the element can't be told from the type)
  rest_attributes?: string
}

// `virtual:prop-docs`'s default export, PropsTable's `loaders` prop
export type ComponentDocLoaders = Record<string, () => Promise<{ default: ComponentDoc }>>
