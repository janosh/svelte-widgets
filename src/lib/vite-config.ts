// Shared vite-plus config for janosh's Svelte/Vite projects, as `make_config(overrides)`:
//
//   export default { ...make_config({ fmt: { printWidth: 95 } }), plugins: [sveltekit()] }
//
// Sections merge over the defaults — lint's object-valued members a second level down,
// so retuning one rule or staged glob restates nothing else, while its arrays replace.
//
// The shapes below are spelled out instead of reused from vite-plus's UserConfig and
// OxlintConfig (a test keeps that import out). Those come from the `oxlint` package, so a
// consumer on a different vite-plus has a second, unrelated copy, and comparing the two
// exhausts TS's stack depth where this config is spread into their `defineConfig`. For the
// same reason the members are literal unions and carry no index signature: oxlint's own
// names are unions a widened `string` cannot satisfy, and an unlisted option typed
// `unknown` satisfies nothing. Extra options belong in the consumer's own literal.
type Severity = `error` | `warn` | `off`
// a rule is a severity, or a severity plus its options
type Rules = Record<string, Severity | [Severity, ...unknown[]]>

export type SharedConfig = {
  lint: {
    plugins: (`oxc` | `typescript` | `unicorn` | `import` | `vitest`)[]
    options: Record<string, boolean>
    categories: Record<string, Severity>
    ignorePatterns: string[]
    rules: Rules
    overrides: { files: string[]; rules: Rules }[]
  }
  fmt: { semi: boolean; singleQuote: boolean; printWidth: number; svelte: boolean }
  build: { cssTarget: string }
  // lint-staged lets a whole staged config be one function; ours is always a glob map, and
  // vite-plus JSON.stringifies it to reach its Rust side, where a function is dropped
  staged: Record<string, string>
}

// Keep simple enabled rules compact so configured rules and exceptions remain visible.
const error_rules = [
  // extra rules not in the enabled categories
  `no-template-curly-in-string no-constructor-return default-param-last guard-for-in
  eslint-plugin-unicorn/prefer-array-find eslint-plugin-unicorn/no-typeof-undefined
  eslint-plugin-unicorn/prefer-optional-catch-binding
  eslint-plugin-unicorn/no-length-as-slice-end eslint-plugin-unicorn/prefer-node-protocol
  eslint-plugin-unicorn/throw-new-error eslint-plugin-unicorn/prefer-type-error
  eslint-plugin-unicorn/prefer-date-now
  eslint-plugin-unicorn/require-number-to-fixed-digits-argument
  eslint-plugin-unicorn/no-useless-promise-resolve-reject
  eslint-plugin-unicorn/custom-error-definition eslint-plugin-import/no-duplicates
  @typescript-eslint/no-non-null-assertion
  @typescript-eslint/prefer-string-starts-ends-with @typescript-eslint/prefer-readonly
  @typescript-eslint/prefer-regexp-exec @typescript-eslint/prefer-find
  @typescript-eslint/no-deprecated @typescript-eslint/no-misused-promises
  @typescript-eslint/restrict-plus-operands @typescript-eslint/no-dynamic-delete
  @typescript-eslint/no-empty-object-type @typescript-eslint/no-explicit-any
  @typescript-eslint/no-import-type-side-effects @typescript-eslint/no-invalid-void-type
  @typescript-eslint/no-mixed-enums @typescript-eslint/no-require-imports
  @typescript-eslint/only-throw-error @typescript-eslint/ban-ts-comment
  @typescript-eslint/consistent-type-imports @typescript-eslint/prefer-function-type
  @typescript-eslint/prefer-includes @typescript-eslint/prefer-optional-chain
  @typescript-eslint/prefer-reduce-type-parameter
  @typescript-eslint/prefer-ts-expect-error @typescript-eslint/return-await
  @typescript-eslint/switch-exhaustiveness-check @typescript-eslint/unified-signatures
  array-callback-return prefer-object-has-own eslint-plugin-promise/no-multiple-resolved
  eslint-plugin-promise/no-return-in-finally eslint-plugin-promise/param-names
  eslint-plugin-promise/valid-params @typescript-eslint/consistent-type-exports
  eslint-plugin-unicorn/require-array-join-separator no-useless-computed-key
  eslint-plugin-vitest/prefer-strict-boolean-matchers eslint-plugin-vitest/prefer-each
  eslint-plugin-vitest/prefer-called-exactly-once-with
  eslint-plugin-vitest/require-awaited-expect-poll`,
  // tier 1: zero-violation guard rails
  `no-var no-self-compare prefer-arrow-callback no-array-constructor no-new-wrappers
  prefer-numeric-literals default-case-last no-object-constructor no-unreachable-loop
  @typescript-eslint/prefer-enum-initializers
  @typescript-eslint/prefer-literal-enum-member
  @typescript-eslint/consistent-type-assertions eslint-plugin-unicorn/prefer-array-some
  eslint-plugin-unicorn/prefer-array-flat eslint-plugin-unicorn/prefer-math-min-max
  eslint-plugin-unicorn/prefer-negative-index eslint-plugin-unicorn/prefer-includes
  eslint-plugin-unicorn/prefer-default-parameters
  eslint-plugin-unicorn/prefer-logical-operator-over-ternary
  eslint-plugin-unicorn/no-instanceof-array
  eslint-plugin-unicorn/prefer-keyboard-event-key eslint-plugin-unicorn/error-message
  eslint-plugin-unicorn/escape-case eslint-plugin-unicorn/prefer-prototype-methods
  eslint-plugin-unicorn/no-console-spaces eslint-plugin-unicorn/prefer-dom-node-dataset
  eslint-plugin-unicorn/prefer-query-selector eslint-plugin-unicorn/prefer-modern-dom-apis
  eslint-plugin-unicorn/prefer-dom-node-text-content
  eslint-plugin-unicorn/text-encoding-identifier-case
  eslint-plugin-unicorn/no-unreadable-iife
  eslint-plugin-unicorn/consistent-empty-array-spread
  eslint-plugin-unicorn/no-unnecessary-slice-end oxc/bad-bitwise-operator
  eslint-plugin-unicorn/no-confusing-array-with
  eslint-plugin-unicorn/no-array-fill-with-reference-type
  eslint-plugin-unicorn/explicit-timer-delay @typescript-eslint/no-floating-promises
  @typescript-eslint/await-thenable @typescript-eslint/no-misused-spread
  @typescript-eslint/no-for-in-array @typescript-eslint/no-array-delete
  @typescript-eslint/no-base-to-string @typescript-eslint/require-array-sort-compare
  eslint-plugin-vitest/no-identical-title eslint-plugin-vitest/prefer-comparison-matcher
  eslint-plugin-vitest/prefer-equality-matcher eslint-plugin-vitest/prefer-to-contain
  eslint-plugin-vitest/prefer-hooks-on-top eslint-plugin-vitest/prefer-hooks-in-order
  eslint-plugin-vitest/no-test-return-statement`,
  // tier 2: small cleanups (mostly autofixable)
  `no-else-return object-shorthand prefer-template operator-assignment no-multi-assign
  no-lonely-if symbol-description no-useless-return @typescript-eslint/array-type
  @typescript-eslint/consistent-generic-constructors
  @typescript-eslint/consistent-indexed-object-style
  @typescript-eslint/prefer-promise-reject-errors
  eslint-plugin-unicorn/prefer-dom-node-append
  eslint-plugin-unicorn/consistent-existence-index-check
  eslint-plugin-unicorn/prefer-string-slice eslint-plugin-unicorn/no-hex-escape
  eslint-plugin-unicorn/prefer-import-meta-properties
  eslint-plugin-unicorn/prefer-native-coercion-functions
  eslint-plugin-unicorn/prefer-number-coercion eslint-plugin-unicorn/prefer-math-trunc
  eslint-plugin-unicorn/no-useless-collection-argument
  eslint-plugin-unicorn/prefer-structured-clone
  eslint-plugin-unicorn/consistent-date-clone eslint-plugin-unicorn/relative-url-style
  eslint-plugin-unicorn/prefer-single-call
  eslint-plugin-import/first eslint-plugin-import/newline-after-import
  oxc/branches-sharing-code eslint-plugin-vitest/prefer-to-be prefer-object-spread
  @typescript-eslint/prefer-for-of eslint-plugin-unicorn/prefer-string-raw
  eslint-plugin-unicorn/prefer-modern-math-apis eslint-plugin-unicorn/prefer-regexp-test
  @typescript-eslint/no-unnecessary-type-arguments @typescript-eslint/no-unnecessary-type-parameters
  @typescript-eslint/no-useless-default-assignment
  @typescript-eslint/use-unknown-in-catch-callback-variable`,
  // tier 3: larger but worthwhile
  `@typescript-eslint/prefer-nullish-coalescing
  eslint-plugin-unicorn/prefer-string-replace-all @typescript-eslint/dot-notation radix
  prefer-exponentiation-operator no-implicit-coercion
  eslint-plugin-vitest/prefer-to-have-length`,
  // named capture groups self-document a regex match; positional ones must be
  // renamed. And `export ... from` beats importing purely to re-export
  `prefer-named-capture-group eslint-plugin-unicorn/prefer-export-from`,
]
  .join(` `)
  .split(/\s+/u)

const lint: SharedConfig[`lint`] = {
  plugins: [`oxc`, `typescript`, `unicorn`, `import`, `vitest`],
  options: { typeAware: true, typeCheck: true },
  categories: { correctness: `error`, suspicious: `error`, perf: `error` },
  // Generic build-output dirs; projects append their own (e.g. `extensions/**`, `static/**`)
  ignorePatterns: [`build/**`, `.svelte-kit/**`, `package/**`, `dist/**`],
  rules: {
    ...Object.fromEntries(error_rules.map((rule) => [rule, `error`] as const)),
    // the rest carry an option, or a reason for being off
    'no-promise-executor-return': [`error`, { allowVoid: true }],
    // `void` explicitly marks intentionally ignored Promise-executor return values.
    'typescript/no-meaningless-void-operator': `off`,
    'no-console': [`error`, { allow: [`info`, `warn`, `error`] }],
    'eslint-plugin-unicorn/max-nested-calls': [`error`, { max: 3 }],
    'eslint-plugin-unicorn/numeric-separators-style': [
      `error`,
      { onlyIfContainsSeparator: true },
    ],
    // `null: ignore` keeps the idiomatic `== null` nullish check (null OR undefined)
    eqeqeq: [`error`, `always`, { null: `ignore` }],
    // hoisting these out of Svelte reactive closures needs manual type annotations
    'eslint-plugin-unicorn/consistent-function-scoping': `off`,
    // pervasive intentional patterns
    '@typescript-eslint/no-unsafe-type-assertion': `off`,
    '@typescript-eslint/restrict-template-expressions': `off`,
    'no-await-in-loop': `off`,
    // Permit sorting fresh/local arrays as a standalone statement.
    'eslint-plugin-unicorn/no-array-sort': [`error`, { allowExpressionStatement: true }],
    'oxc/no-map-spread': `off`,
    'eslint-plugin-vitest/no-conditional-expect': `off`,
    // Vitest default rules — too noisy
    'eslint-plugin-vitest/require-mock-type-parameters': `off`,
    // Tests mock non-existent globals/DOM APIs via assignment (`globalThis.fetch = vi.fn()`,
    // `el.requestFullscreen = vi.fn()`); vi.spyOn throws on absent props and tightens mock types
    'eslint-plugin-vitest/prefer-spy-on': `off`,
    // autofix rewrites `toHaveBeenCalled()` → `toHaveBeenCalledWith()` (asserts zero args, wrong);
    // can't infer expected args, and `toHaveBeenCalled()` is the intended check in most spots
    'eslint-plugin-vitest/prefer-called-with': `off`,
    // benign barrel-file cycles (components import from their package `index.ts` that re-exports
    // them); resolving them conflicts with the `$lib/foo` barrel-import convention
    'eslint-plugin-import/no-cycle': `off`,
    // maxArgs 2 because vitest supports expect(actual, message)
    'eslint-plugin-vitest/valid-expect': [`error`, { maxArgs: 2 }],
    // count any *assert*/*expect* helper as an assertion so expect-expect doesn't flag tests
    // that delegate to helpers (oxlint glob `*` matches one [a-z\d] run, so name them camelCase)
    'eslint-plugin-vitest/expect-expect': [
      `error`,
      { assertFunctionNames: [`*assert*`, `*expect*`] },
    ],
  },
  overrides: [
    {
      // vitest mock assertions like `expect(obj.method).toHaveBeenCalled()` trip
      // unbound-method (false positive on spies) and no-underscore-dangle (mock
      // internals). Relaxing them in tests is the typescript-eslint-recommended approach.
      files: [`tests/**`, `**/*.test.ts`, `**/*.test.svelte.ts`],
      rules: {
        '@typescript-eslint/unbound-method': `off`,
        'no-underscore-dangle': `off`,
      },
    },
  ],
}

const fmt: SharedConfig[`fmt`] = {
  semi: false,
  singleQuote: true,
  printWidth: 90,
  svelte: true,
}

// the default chrome111 lacks light-dark(), which LightningCSS then polyfills into
// broken space toggles
const build: SharedConfig[`build`] = { cssTarget: `esnext` }

const staged: SharedConfig[`staged`] = {
  '*.{js,ts,svelte,html,css,scss,less,md,json,yaml,graphql,gql}': `vp check --fix`,
  '*.{ts,svelte}': `sh -c 'npx svelte-kit sync && npx svelte-check --threshold error'`,
}

// `staged` is not wrapped in Partial: it is an index-signature record, so a subset of
// globs already type-checks, and Partial would widen every value to `| undefined`.
export type ConfigOverrides = {
  lint?: Partial<SharedConfig[`lint`]>
  fmt?: Partial<SharedConfig[`fmt`]>
  build?: Partial<SharedConfig[`build`]>
  staged?: SharedConfig[`staged`]
}

// A factory rather than an object the caller spreads and patches: spreading a function
// trips no-misused-spread, and vite-plus JSON.stringifies these members to reach its Rust
// side, where a function value is dropped without a word.
export const make_config = (overrides: ConfigOverrides = {}): SharedConfig => {
  // deep copy, so a caller mutating `cfg.lint.rules` or pushing onto
  // `cfg.lint.ignorePatterns` cannot rewrite the defaults behind the next call
  const base = structuredClone({ lint, fmt, build, staged })
  return {
    lint: {
      ...base.lint,
      ...overrides.lint,
      options: { ...base.lint.options, ...overrides.lint?.options },
      categories: { ...base.lint.categories, ...overrides.lint?.categories },
      rules: { ...base.lint.rules, ...overrides.lint?.rules },
    },
    fmt: { ...base.fmt, ...overrides.fmt },
    build: { ...base.build, ...overrides.build },
    staged: { ...base.staged, ...overrides.staged },
  }
}
