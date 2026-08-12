<script lang="ts">
  // adapted from https://npmjs.com/package/svelte-lite-youtube-embed
  import type {
    HTMLAttributes,
    HTMLButtonAttributes,
    HTMLIframeAttributes,
  } from 'svelte/elements'
  import { chain_handlers } from './utils'

  // Shows the poster image behind a play button and only creates the iframe on the
  // first click, so an unwatched embed costs one image instead of a YouTube player.
  let {
    video_id,
    play_label = `Play`,
    iframe_title = `YouTube video player`,
    nocookie = true, // youtube-nocookie.com doesn't set tracking cookies until playback
    player_params = { autoplay: 1 },
    play_btn_props,
    iframe_props,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `children`> & {
    video_id: string
    play_label?: string
    // names the player itself, so it is not the play button's label a second time
    iframe_title?: string
    nocookie?: boolean
    // YouTube player params verbatim, e.g. start, list, autoplay. replaces the default,
    // so pass autoplay: 1 along with anything else to keep playing on click
    player_params?: Record<string, string | number>
    play_btn_props?: Omit<HTMLButtonAttributes, `aria-label` | `inert` | `type`>
    iframe_props?: Omit<HTMLIframeAttributes, `src` | `srcdoc` | `title`>
  } = $props()

  // $derived is writable: the click below sets it true, a new video_id snaps it back
  let activated: boolean = $derived.by(() => {
    void video_id
    return false
  })

  // shared so an id carrying `?`, `#` or `/` escapes its path segment in no URL below
  const safe_id = $derived(encodeURIComponent(video_id))

  const iframe_src = $derived.by(() => {
    const params = new URLSearchParams(
      Object.entries(player_params).map(([key, val]) => [key, String(val)]),
    )
    const host = nocookie ? `www.youtube-nocookie.com` : `www.youtube.com`
    const query = params.size > 0 ? `?${params}` : ``
    return `https://${host}/embed/${safe_id}${query}`
  })
</script>

<!-- the nested play button is the keyboard affordance; its click bubbles up to here -->
<div
  {...rest}
  class={[`lite-youtube`, rest.class, { activated }]}
  onclick={chain_handlers(() => (activated = true), rest.onclick)}
  role="presentation"
>
  {#key video_id}
    <picture>
      <source
        srcset="https://i.ytimg.com/vi_webp/{safe_id}/hqdefault.webp"
        type="image/webp"
      />
      <!-- decorative: the play button below already carries the accessible name, and a
      thumbnail described twice reads as two separate things -->
      <img class="poster" src="https://i.ytimg.com/vi/{safe_id}/hqdefault.jpg" alt="" />
    </picture>
  {/key}
  <!-- opacity alone would leave the active play button in the tab order and a11y tree -->
  <button
    {...play_btn_props}
    type="button"
    class={[`play-btn`, play_btn_props?.class]}
    aria-label={play_label}
    inert={activated}
  ></button>
  {#if activated}
    <!-- iframe_props can tune loading and policy but cannot replace the player document. -->
    <iframe
      width="560"
      height="315"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      {...iframe_props}
      srcdoc={undefined}
      title={iframe_title}
      src={iframe_src}
    ></iframe>
  {/if}
</div>

<style>
  .lite-youtube {
    background-color: var(--lite-youtube-bg, #000);
    position: relative;
    display: block;
    contain: content;
    cursor: pointer;
    max-width: 720px;
    aspect-ratio: 16 / 9;
  }
  .lite-youtube > iframe,
  .poster {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }
  .lite-youtube > iframe {
    border: 0;
  }
  .poster {
    object-fit: cover;
  }
  .lite-youtube > .play-btn {
    width: 68px;
    height: 48px;
    position: absolute;
    cursor: pointer;
    transform: translate3d(-50%, -50%, 0);
    top: 50%;
    left: 50%;
    z-index: 1;
    background-color: transparent;
    /* YouTube's actual play button svg */
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 68 48"><path fill="%23f00" fill-opacity="0.8" d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"></path><path d="M 45,24 27,14 27,34" fill="%23fff"></path></svg>');
    filter: grayscale(100%);
    transition: filter 0.1s cubic-bezier(0, 0, 0.2, 1);
    border: none;
    outline: 0;
  }
  .lite-youtube:is(:hover, :focus-within) > .play-btn {
    filter: none;
  }
  .lite-youtube.activated {
    cursor: unset;
  }
  .lite-youtube.activated > .play-btn {
    opacity: 0;
    pointer-events: none;
  }
</style>
