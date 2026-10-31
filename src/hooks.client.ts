import { configure_default_highlighter } from '#lib/highlight/index.ts'
import onig_url from 'vscode-oniguruma/release/onig.wasm?url'

// Serve oniguruma's WASM with the site instead of fetching it from esm.sh at runtime. An
// init hook, not top-level code: package.json `sideEffects` would let the bundler drop that.
export const init = () => configure_default_highlighter({ onig_url })
