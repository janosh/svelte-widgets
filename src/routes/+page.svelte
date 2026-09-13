<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  import { ContributorList, CopyButton, Icon, type Contributor } from '$lib'
  import { BookOpen, NPM, PlayCircle, Widgets } from '$lib/icons'
  import { repository, version } from '$root/package.json'
  import { Examples } from '$site'
  import { resolve_demo_path as resolve_path } from '$site/paths'
  import { onMount } from 'svelte'
  import { demo_descriptions, demo_nav_routes, demo_title } from './(demos)'

  const install_command = `npm install svelte-widgets`
  let contributors = $state<Contributor[]>([])

  onMount(() => {
    const url = `https://api.github.com/repos/janosh/svelte-widgets/contributors?per_page=100`
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(
        (data: Contributor[]) =>
          (contributors = data.filter((usr) => !usr.login.includes(`[bot]`))),
      )
      .catch((error) => console.error(`Failed to fetch contributors:`, error))
  })
</script>

<svelte:head>
  <meta
    name="description"
    content="Explore Svelte Widgets: accessible components, element attachments, and authoring tools for Svelte 5. Browse live demos, APIs, and examples."
  />
</svelte:head>

<main>
  <section class="intro" aria-labelledby="overview">
    <p class="eyebrow">Svelte 5 · TypeScript · MIT <span>v{version}</span></p>
    <Heading level={1} id="overview">Components, attachments, and tools</Heading>
    <p class="summary">
      Accessible, keyboard-friendly components, element attachments, and documentation
      tools for Svelte 5.
    </p>
    <div class="getting-started">
      <pre class="language-sh"><Icon
          icon={NPM}
          aria-hidden="true"
          style="width: 1.5em; flex-shrink: 0; color: #cb3837"
        /><code>{install_command}</code><CopyButton
          content={install_command}
          style="flex-shrink: 0"
        /></pre>
      <a href="#try-it">View example <span aria-hidden="true">↓</span></a>
    </div>
  </section>

  <Heading level={2} id="explore" icon={Widgets}>Demo categories</Heading>
  <p class="section-intro">
    Component and attachment guides with working examples and API details.
  </p>
  <div class="catalog">
    {#each demo_nav_routes as { name, title, description, detail, icon, href, children } (name)}
      <section aria-labelledby={`category-${name}`}>
        <Heading level={3} link={false} id={`category-${name}`}>
          <a href={resolve_path(href)}>
            <span><Icon {icon} class="heading-icon" aria-hidden="true" />{title}</span>
            <span aria-hidden="true">↗</span>
          </a>
        </Heading>
        <p>{description}</p>
        <ul>
          {#each children.filter((route) => route !== href) as route (route)}
            <li>
              <a href={resolve_path(route)} title={demo_descriptions[route]}>
                {demo_title(route)}
              </a>
            </li>
          {/each}
        </ul>
        {#if detail}
          <p class="detail">{detail}</p>
        {/if}
        {#if name === `authoring`}
          <a href={resolve_path(`/markdown`)}
            >Markdown API <span aria-hidden="true">→</span></a
          >
        {/if}
      </section>
    {/each}
  </div>

  <Heading level={2} id="try-it" icon={PlayCircle}>MultiSelect example</Heading>
  <p class="section-intro">
    Select options in <code>MultiSelect</code> with the mouse or keyboard. Expand the code to
    view the source.
  </p>
  <Examples />

  <Heading level={2} id="beyond-components" icon={BookOpen}>Guides and APIs</Heading>
  <div class="resources">
    <a href={resolve_path(`/markdown`)}>
      <strong>Markdown documentation <span aria-hidden="true">→</span></strong>
      <span
        >Markdown with Svelte, syntax highlighting, math, live examples, and validated
        links.</span
      >
    </a>
    <a href={`${repository}#readme`}>
      <strong>Package API reference <span aria-hidden="true">↗</span></strong>
      <span
        >Headless helpers for storage, themes, clipboard, search, canvas, CSV, and URL
        state. Full export reference in the README.</span
      >
    </a>
    <a href={resolve_path(`/workbench`)}>
      <strong>Data workbench <span aria-hidden="true">→</span></strong>
      <span
        >A working data explorer combining file loading, JSON inspection, progress, and
        resizable panels.</span
      >
    </a>
  </div>
  <nav class="project-links" aria-label="Project resources">
    <a href={resolve_path(`/changelog`)}>Changelog</a>
    <a href={resolve_path(`/contributing`)}>Contributing</a>
    <a href={repository}>GitHub</a>
  </nav>

  {#if contributors.length > 0}
    <section class="contributors" aria-label="Contributors">
      <p>Made better by contributors. Thank you!</p>
      <ContributorList
        {contributors}
        --contributor-avatar-size="36px"
        --contributor-gap="0.6rem"
      />
    </section>
  {/if}
</main>

<style>
  .intro {
    margin-block: 1.5rem 2.5rem;
    :global(h1) {
      justify-content: start;
      font-size: clamp(1.8rem, 4vw, 2.5rem);
      line-height: 1.2;
      letter-spacing: -0.035em;
      margin: 0.5rem 0 1rem;
    }
    .summary {
      max-width: 44rem;
      color: var(--text-muted);
      font-size: 1.1rem;
      margin: 0;
    }
  }
  .eyebrow {
    color: var(--text-muted);
    font-size: 0.8rem;
    margin: 0;
    span {
      margin-left: 0.75em;
      color: var(--accent);
    }
  }
  .getting-started {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.5rem;
    margin-top: 1.25rem;
    pre {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--border);
      min-width: 0;
      code {
        min-width: 0;
      }
    }
    a {
      font-size: 0.9rem;
    }
  }
  main > :global(h2) {
    margin: 2.5rem 0 0.35rem;
    font-size: 1.35rem;
  }
  .section-intro {
    color: var(--text-muted);
    margin: 0 0 1.25rem;
    font-size: 0.95rem;
  }
  .catalog {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    section {
      padding: 1.15rem 1.25rem;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    :global(h3) {
      margin: 0;
      font-size: 1.1rem;
      a {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: inherit;
        &:hover {
          color: var(--accent);
        }
        > span:first-child {
          display: inline-flex;
          align-items: center;
          :global(.heading-icon) {
            --icon-size: 1.2em;
          }
        }
        > span[aria-hidden='true'] {
          color: var(--text-muted);
          font-size: 0.9em;
        }
      }
    }
    p {
      margin: 0.4rem 0 0.9rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    ul {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem 0.8rem;
      padding: 0;
      margin: 0;
      list-style: none;
      font-size: 0.85rem;
      a {
        display: inline-block;
        padding-block: 0.15rem;
      }
    }
    .detail {
      font-size: 0.8rem;
      margin: 0.9rem 0 0;
    }
    section > a {
      display: inline-block;
      margin-top: 0.6rem;
      font-size: 0.85rem;
    }
  }
  .resources {
    border-top: 1px solid var(--border);
    > a {
      display: grid;
      grid-template-columns: 13rem 1fr;
      gap: 1rem;
      padding-block: 1rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
      > span {
        color: var(--text-muted);
      }
    }
  }
  .project-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-top: 1.5rem;
    font-size: 0.9rem;
  }
  .contributors {
    margin-top: 2.5rem;
    p {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  }
  @media (max-width: 600px) {
    .catalog {
      grid-template-columns: 1fr;
    }
    .resources > a {
      grid-template-columns: 1fr;
      gap: 0.3rem;
    }
  }
</style>
