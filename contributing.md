# Contributing

## 🙋 How can I help?

Pull requests to improve docs, test coverage, or examples are welcome. Before implementing a new feature, submit an issue to discuss project fit. The [issues labeled `help wanted`](https://github.com/janosh/svelte-widgets/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) are also available for contributions. Incomplete work can be submitted as a draft PR for others to continue.

## 🚀 Submit a PR

To submit a pull request, clone the repo, install dependencies and start the dev server to see changes as you make them.

Use Node.js 24.11 or newer, matching CI's Node 24 line and the tooling's minimum version.

```sh
git clone https://github.com/janosh/svelte-widgets
cd svelte-widgets
npm install --legacy-peer-deps
npx vp dev
```

`--legacy-peer-deps` is needed because vite-plus and standalone Vitest require different versions of optional browser adapters.

Before you start committing, create and check out a descriptively named branch:

```sh
git checkout -b my-cool-new-feature
# or
git checkout -b docs-on-something
# or
git checkout -b test-some-feature
```

Run the tests covering your changes, for example:

```sh
npx vitest run tests/vitest/toc.svelte.test.ts
npx playwright test tests/playwright/Toc.test.ts
```

Install Chromium once with `npx playwright install chromium` before running browser tests. `npm test` runs both complete suites; CI also checks coverage, package imports, types, formatting, and the docs build.

New features should include corresponding tests. Bug fixes should include a test that fails under the old code and passes with the change. PRs without tests are accepted when assistance is needed, but may take longer to merge.

Demo pages live in `src/routes/(demos)` under the same categories as the navigation: `(inputs)`, `(navigation)`, `(overlays)`, `(display)`, `(authoring)`, and `(attachments)`. Put new pages directly in the appropriate category, for example `(inputs)/range-slider/+page.md`. The category folders do not appear in URLs. Navigation, search, and previous/next links discover pages automatically; only custom display labels and category order live in `(demos)/index.ts`. Pages in `(hide)` stay outside those menus.

## ✅ CI checks

The [CI workflow](https://github.com/janosh/svelte-widgets/actions/workflows/ci.yml) ([workflow code](https://github.com/janosh/svelte-widgets/blob/main/.github/workflows/ci.yml)) runs these jobs:

- tests: `unit` (vitest with coverage plus the package smoke test) and `e2e` (Playwright)
- linting and type checks: `check` runs `vp check` plus `svelte-check`
- links: `link-check` runs lychee over every markdown, Svelte and TS file
- docs: `build` prerenders pages, validates local links and builds the Pagefind index; `deploy` publishes to GitHub Pages only on `main`

## 🆕 New release

To make a release, increase the `"version"` field in `package.json`. This package follows semantic versioning, meaning

- `v[x.y.z] -> v[x+1.0.0]`: major release with breaking changes
- `v[x.y.z] -> v[x.y+1.0]`: minor release with new features
- `v[x.y.z] -> v[x.y.z+1]`: patch release with bug fixes

The 1.8.0 release is an explicit exception: it includes the breaking API cleanups documented in the changelog and migration guide.

Update `changelog.md` with concise release notes, including migration instructions for breaking changes. Link the release heading to a comparison with the previous `svelte-widgets` release; for 1.8.0, compare `v1.7.1...v1.8.0`. This repository also contains historical `svelte-multiselect` tags, so sorting all tags does not identify the previous `svelte-widgets` release.

Keep one H1 title, H2 release headings, and H3 subsections. Use sentence case for entries, plain characters inside code spans, and the existing `> D Month YYYY` date format. Preserve historical API names and release links.

On `main`, commit the release changes using the new version number prefixed by `v` as the commit message and tag:

```sh
git add package.json changelog.md
git commit -m vx.y.z
git tag vx.y.z
```

Push the release commit and tag to `origin/main`:

```sh
git push origin main
git push origin vx.y.z
```

Finally, [publish a new release on GitHub](https://github.com/janosh/svelte-widgets/releases/new). Publishing the release triggers [`publish.yml`](https://github.com/janosh/svelte-widgets/blob/main/.github/workflows/publish.yml), which pushes the package to npm through trusted publishing (OIDC), so no manual `npm publish` is needed.
