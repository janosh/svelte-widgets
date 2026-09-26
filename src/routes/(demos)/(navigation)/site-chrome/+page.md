## Site Chrome

Three small components for the edges of a documentation site: the `Footer` that closes every page, a `LiteYouTubeEmbed` that doesn't cost a player until someone presses play, and a `ContributorList` of avatars.

### `Footer`

The counterpart to [`Nav`](nav): a centered row of icon links followed by `children`, typically a logo and copyright line. `links` takes `FooterLink` objects: `{ href, label, icon?, title?, target?, rel? }`. `icon` accepts an `IconData` value from `svelte-widgets/icons`, such as `GitHub`; `target` and `rel` are native anchor attributes. The `--footer-*` custom properties control padding, background, gap and link color.

```svelte example id="footer-demo"
<script lang="ts">
  import { GitHub, Svelte } from 'svelte-widgets/icons'
  import Footer from 'svelte-widgets/Footer.svelte'
  import type { FooterLink } from 'svelte-widgets'

  const repo = `https://github.com/janosh/svelte-widgets`
  const external = { target: `_blank`, rel: `noopener noreferrer` }
  const links: FooterLink[] = [
    { href: `${repo}/issues`, label: `Issues`, icon: GitHub, ...external },
    { href: `https://svelte.dev`, label: `Svelte`, icon: Svelte, ...external },
    { href: `multiselect`, label: `Docs` },
  ]
</script>

<Footer
  {links}
  style="border-radius: 5pt"
  --footer-bg="rgba(128, 128, 128, 0.12)"
  --footer-padding="1em 2em"
  --footer-nav-margin="0 0 1em"
>
  <small>© Janosh Riebesell (<a href="{repo}/blob/-/license">MIT</a>)</small>
</Footer>
```

Use an `item({ link })` snippet for custom icons or markup. It replaces each default anchor while preserving the nav layout.

### `LiteYouTubeEmbed`

Renders YouTube's poster image (a `webp` source with a `jpg` fallback) behind the play button and only creates the `youtube-nocookie` iframe on the first click, so a page full of videos costs a page full of images. Setting a new `video_id` tears the player back down to its poster.

`player_params` becomes the player's query string verbatim — `start`, `list`, `autoplay` and anything else YouTube accepts. It defaults to `{ autoplay: 1 }` and replaces that default when set, so pass `autoplay: 1` along with the rest to keep playing on click. `nocookie={false}` opts into the tracking host, and `--lite-youtube-bg` themes the letterbox behind the poster. Nested chrome takes `play_btn_props` and `iframe_props`, including iframe attributes such as `loading`, `referrerpolicy` and `sandbox`; the component keeps ownership of button state plus iframe `src`, `srcdoc` and `title`.

```svelte example id="lite-youtube-demo"
<script lang="ts">
  import LiteYouTubeEmbed from 'svelte-widgets/LiteYouTubeEmbed.svelte'
</script>

<LiteYouTubeEmbed
  video_id="AdNJ3fydeao"
  play_label="Play: Rethinking Reactivity"
  player_params={{ autoplay: 1, start: 30 }}
  style="max-width: 480px; margin: auto"
/>
```

### `ContributorList`

An avatar row, grayscale until hovered, with the username in a [`tooltip`](attachments/tooltip). `contributors` is structural — `login`, `avatar_url` and `html_url` — so a GitHub API response drops straight in. `tooltip_options` forwards placement and delay, and `--contributor-avatar-size` and `--contributor-gap` size the row.

```svelte example id="contributor-list-demo"
<script lang="ts">
  import ContributorList from 'svelte-widgets/ContributorList.svelte'
  import type { Contributor } from 'svelte-widgets'

  // shaped like the GitHub /repos/{owner}/{repo}/contributors response
  const contributors: Contributor[] = [`janosh`, `sveltejs`, `vitejs`].map((login) => ({
    login,
    avatar_url: `https://github.com/${login}.png?size=120`,
    html_url: `https://github.com/${login}`,
  }))
</script>

<ContributorList {contributors} tooltip_options={{ placement: `bottom` }} />
```
