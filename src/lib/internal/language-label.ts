// Shared as an inline style because mdsvex's code-only output is raw HTML with no
// component scope. `pre` preserves whitespace, so the label must stay out of flow.
const language_label_style = `position:absolute;bottom:2px;inset-inline-end:6px;font-size:0.65rem;opacity:0.35;text-transform:uppercase;pointer-events:none;user-select:none;line-height:1`

export const language_label_html = (language: string): string => {
  const escaped = language
    .replaceAll(`&`, `&amp;`)
    .replaceAll(`<`, `&lt;`)
    .replaceAll(`>`, `&gt;`)
  return `<span class="lang-label" style="${language_label_style}">${escaped}</span>`
}
