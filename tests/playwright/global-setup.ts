// reuseExistingServer accepts whatever already answers on the port, so a sibling repo's
// dev server would otherwise be tested silently. The analytics domain is unique per site.
// takes the subset of FullConfig it reads, so tests can call it with a plain object
export default async ({ webServer }: { webServer: { port?: number } | null }) => {
  const url = `http://localhost:${webServer?.port}/`
  const html = await fetch(url).then((res) => res.text())
  if (!html.includes(`data-domain="svelte-widgets.janosh.dev"`))
    throw new Error(
      `${url} serves another app, not svelte-widgets. Stop that server or pick a free port with PLAYWRIGHT_PORT`,
    )
}
