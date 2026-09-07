<script lang="ts">
  import { CodeBlock } from '$lib'
  import { default_highlighter } from '$lib/highlight'

  let {
    value = $bindable(``),
    language,
    label,
    rows = 13,
  }: {
    value: string
    language: string
    label: string
    rows?: number
  } = $props()
  let preview: HTMLDivElement | undefined = $state()
</script>

<div class="source-input">
  <div class="preview" bind:this={preview} aria-hidden="true" inert>
    <CodeBlock
      code={`${value}\n`}
      {language}
      highlight={default_highlighter.highlight}
      tabindex={-1}
    />
  </div>
  <textarea
    bind:value
    {rows}
    aria-label={label}
    spellcheck="false"
    wrap="off"
    onscroll={(event) => {
      if (preview) {
        preview.scrollTop = event.currentTarget.scrollTop
        preview.scrollLeft = event.currentTarget.scrollLeft
      }
    }}></textarea>
</div>

<style>
  .source-input {
    position: relative;
    font:
      0.85rem/1.6 ui-monospace,
      monospace;
    background: light-dark(#f6f8fa, #151b24);
    border-bottom: 1px solid light-dark(#b7c1d1, #526078);
    &:focus-within {
      outline: 2px solid #6987ef;
      outline-offset: 2px;
    }
  }
  .preview {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    :global(.code-block) {
      min-width: max-content;
      background: transparent;
      border-radius: 0;
      font: inherit;
      padding: 0.8rem;
    }
    :global(code) {
      font: inherit;
      overflow: visible;
    }
  }
  textarea {
    position: relative;
    display: block;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 0.8rem;
    margin: 0;
    border: 0;
    outline: none;
    border-radius: 0;
    font: inherit;
    tab-size: 2;
    color: transparent;
    caret-color: light-dark(#151b24, #f6f8fa);
    background: transparent;
  }
</style>
