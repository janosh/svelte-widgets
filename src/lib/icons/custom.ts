// Hand-maintained glyphs (domain shapes, hand-tuned marks, pre-generator set). See icons.ts for tree-shake rationale.
import type { IconData } from './types.ts'

const icon = (markup: string) => ({ viewBox: `0 0 24 24`, markup }) satisfies IconData

export const AreaPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M5 18c2-7 4-4 6-8s4 1 8-5v13z" fill="currentColor" opacity="0.45"/><path d="M5 18c2-7 4-4 6-8s4 1 8-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
)
export const BandsDOS = {
  viewBox: `0 0 24 24`,
  d: `M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M4 4h10v16H4zm12 0h4v16h-4z`,
} satisfies IconData
export const BandStructure = {
  viewBox: `0 0 28 24`,
  stroke: `currentColor`,
  markup: `<g stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M1 20c3-4 5-6 7-6s5 5 7 5 5-4 7-4"/><path d="M1 17c2-3 5-5 7-3s5 4 7 3 5-5 7-3"/><line x1="1" y1="12" x2="27" y2="12" stroke-dasharray="2 1.5" opacity="0.2"/><path d="M1 9c3 3 5 5 7 5s5-5 7-5 5 3 7 3"/><path d="M1 6c2 2 5 4 7 2s5-3 7-2 5 4 7 2"/><path d="M1 4c3 1 5 1 7 0s5-1 7 0 5 1 7 0" opacity="0.5"/><line x1="8" y1="1" x2="8" y2="23" stroke-dasharray="1.5 1.5" opacity="0.2"/><line x1="15" y1="1" x2="15" y2="23" stroke-dasharray="1.5 1.5" opacity="0.2"/><line x1="22" y1="1" x2="22" y2="23" stroke-dasharray="1.5 1.5" opacity="0.2"/></g>`,
} satisfies IconData
export const BarPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="6" y="12" width="3" height="7" rx="0.5" fill="currentColor" opacity="0.65"/><rect x="10.5" y="7" width="3" height="12" rx="0.5" fill="currentColor"/><rect x="15" y="10" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.8"/>`,
)
export const BinnedScatterPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><g fill="currentColor"><path d="m5 14l2-1.2L9 14v2.3l-2 1.2l-2-1.2z" opacity="0.35"/><path d="m8.5 10.5l2-1.2l2 1.2v2.3l-2 1.2l-2-1.2z" opacity="0.65"/><path d="m12 14l2-1.2l2 1.2v2.3l-2 1.2l-2-1.2z" opacity="0.85"/><path d="m12 7l2-1.2L16 7v2.3l-2 1.2l-2-1.2z"/><path d="m15.5 10.5l2-1.2l2 1.2v2.3l-2 1.2l-2-1.2z" opacity="0.55"/></g>`,
)
export const BlandAltmanPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5 7h16M5 12h16M5 17h16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.5" opacity="0.45"/><g fill="currentColor"><circle cx="7" cy="13.5" r="1.3"/><circle cx="10" cy="9" r="1.3"/><circle cx="13" cy="15" r="1.3"/><circle cx="16" cy="11" r="1.3"/><circle cx="19" cy="6" r="1.3"/></g>`,
)
export const BodePlot = icon(
  `<g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M3 2v9h18M3 13v9h18" stroke-width="1.2" opacity="0.6"/><path d="M5 9c3 0 3-5 7-5s4 4 8 4M5 20c3-6 6-6 8-2s4 2 7-2" stroke-width="1.5"/></g>`,
)
export const BoxPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 3v4m0 10v4M4 3h4m-4 18h4" opacity="0.6"/><rect x="3.5" y="7" width="5" height="10" rx="0.6"/><path d="M3.5 12h5"/><path d="M18 3v6m0 7v5m-2-18h4m-4 18h4" opacity="0.6"/><rect x="15.5" y="9" width="5" height="7" rx="0.6"/><path d="M15.5 13h5"/></g>`,
)
export const BrillouinZone = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  markup: `<g stroke-width="1.3" fill="none"><polygon points="12,1 22,7 22,17 12,23 2,17 2,7"/><line x1="2" y1="7" x2="22" y2="17"/><line x1="12" y1="1" x2="12" y2="23"/><line x1="22" y1="7" x2="2" y2="17"/></g>`,
} satisfies IconData
export const BubblePlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><g fill="currentColor"><circle cx="7" cy="16" r="2.5" opacity="0.5"/><circle cx="12" cy="12" r="3.5" opacity="0.75"/><circle cx="17.5" cy="7" r="2"/><circle cx="18.5" cy="16.5" r="1.4" opacity="0.65"/></g>`,
)
export const BulletChart = icon(
  `<g fill="currentColor"><rect x="3" y="5" width="18" height="5" rx="1" opacity="0.2"/><rect x="3" y="5" width="14" height="5" rx="1" opacity="0.55"/><rect x="3" y="6.2" width="10" height="2.6" rx="0.5"/><rect x="3" y="15" width="18" height="5" rx="1" opacity="0.2"/><rect x="3" y="15" width="11" height="5" rx="1" opacity="0.55"/><rect x="3" y="16.2" width="7" height="2.6" rx="0.5"/></g><path d="M16 3v9m-4 1v9" stroke="currentColor" stroke-width="1.5"/>`,
)
export const CalendarHeatmap = icon(
  `<g fill="currentColor"><rect x="2" y="4" width="3" height="3" rx="0.5" opacity="0.25"/><rect x="6.2" y="4" width="3" height="3" rx="0.5" opacity="0.75"/><rect x="10.4" y="4" width="3" height="3" rx="0.5"/><rect x="14.6" y="4" width="3" height="3" rx="0.5" opacity="0.45"/><rect x="18.8" y="4" width="3" height="3" rx="0.5" opacity="0.65"/><rect x="2" y="8.5" width="3" height="3" rx="0.5" opacity="0.7"/><rect x="6.2" y="8.5" width="3" height="3" rx="0.5" opacity="0.3"/><rect x="10.4" y="8.5" width="3" height="3" rx="0.5" opacity="0.55"/><rect x="14.6" y="8.5" width="3" height="3" rx="0.5"/><rect x="18.8" y="8.5" width="3" height="3" rx="0.5" opacity="0.2"/><rect x="2" y="13" width="3" height="3" rx="0.5" opacity="0.4"/><rect x="6.2" y="13" width="3" height="3" rx="0.5"/><rect x="10.4" y="13" width="3" height="3" rx="0.5" opacity="0.3"/><rect x="14.6" y="13" width="3" height="3" rx="0.5" opacity="0.7"/><rect x="18.8" y="13" width="3" height="3" rx="0.5" opacity="0.5"/><rect x="2" y="17.5" width="3" height="3" rx="0.5"/><rect x="6.2" y="17.5" width="3" height="3" rx="0.5" opacity="0.45"/><rect x="10.4" y="17.5" width="3" height="3" rx="0.5" opacity="0.8"/><rect x="14.6" y="17.5" width="3" height="3" rx="0.5" opacity="0.25"/><rect x="18.8" y="17.5" width="3" height="3" rx="0.5" opacity="0.6"/></g>`,
)
export const CalibrationPlot = icon(
  `<path d="M3 3v18h18M5 19L20 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/><path d="M5 18l4-5l4-1l3-4l4-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="5" cy="18" r="1.2"/><circle cx="9" cy="13" r="1.2"/><circle cx="13" cy="12" r="1.2"/><circle cx="16" cy="8" r="1.2"/><circle cx="20" cy="6" r="1.2"/></g>`,
)
export const CandlestickPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><g stroke="currentColor" stroke-width="1.3"><path d="M8 6v12m5-15v14m5-10v13"/><rect x="6" y="9" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.5"/><rect x="11" y="6" width="4" height="7" rx="0.5" fill="none"/><rect x="16" y="11" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.8"/></g>`,
)
export const Celsius = {
  viewBox: `0 0 16 16`,
  d: `M2.5 5.5a1 1 0 1 1 2 0a1 1 0 0 1-2 0m1-2.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5M11 4.5C9.401 4.5 8 5.76 8 8s1.401 3.5 3 3.5c.882 0 1.703-.382 2.263-1.101c.181-.233.446-.399.741-.399c.564 0 .954.565.644 1.036A4.3 4.3 0 0 1 11 13c-2.544 0-4.5-2.053-4.5-5S8.456 3 11 3c1.525 0 2.84.738 3.648 1.964c.31.471-.08 1.036-.644 1.036c-.295 0-.56-.166-.741-.399A2.83 2.83 0 0 0 11 4.5`,
} satisfies IconData
export const Changelog = {
  viewBox: `0 0 24 24`,
  d: `M13 3a9 9 0 0 0-9 9H1l4 4l4-4H6c0-3.87 3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18m-1 5v5l4.25 2.52l.77-1.28l-3.52-2.09V8z`,
} satisfies IconData
export const ChevronCollapse = {
  viewBox: `0 0 16 16`,
  d: `M3.646 2.146a.5.5 0 0 1 .708 0L8 5.793l3.646-3.647a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 0-.708zm0 11.708a.5.5 0 0 0 .708 0L8 10.207l3.646 3.647a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 0 0 0 .708z`,
} satisfies IconData
export const ChevronExpand = {
  viewBox: `0 0 16 16`,
  d: `M3.646 9.146a.5.5 0 0 1 .708 0L8 12.793l3.646-3.647a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 0-.708zm0-2.292a.5.5 0 0 0 .708 0L8 3.207l3.646 3.647a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 0 0 0 .708z`,
} satisfies IconData
export const ChordDiagram = icon(
  `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.45"/><g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M5 7c8 0 6 10 14 10M7 19c0-8 10-6 10-14M4 14c5-5 11-5 16 0" stroke-width="2" opacity="0.7"/></g><g fill="currentColor"><circle cx="5" cy="7" r="1.6"/><circle cx="17" cy="5" r="1.6"/><circle cx="19" cy="17" r="1.6"/><circle cx="7" cy="19" r="1.6"/></g>`,
)
export const CircularBarPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 12V4" stroke-width="2.8"/><path d="M12 12l6-6" stroke-width="2.8" opacity="0.8"/><path d="M12 12h9" stroke-width="2.8" opacity="0.65"/><path d="M12 12l6 6" stroke-width="2.8" opacity="0.5"/><path d="M12 12v7" stroke-width="2.8" opacity="0.35"/><circle cx="12" cy="12" r="10" stroke-width="1" opacity="0.2"/></g>`,
)
export const ColorBar = icon(
  `<rect x="6" y="2" width="5" height="20" rx="2.5" fill="currentColor" opacity="0.15"/><rect x="6" y="2" width="5" height="15" rx="2.5" fill="currentColor" opacity="0.4"/><rect x="6" y="2" width="5" height="10" rx="2.5" fill="currentColor" opacity="0.7"/><rect x="6" y="2" width="5" height="5" rx="2.5" fill="currentColor"/><g stroke="currentColor" stroke-width="1.2" opacity="0.5"><line x1="13" y1="4" x2="16" y2="4"/><line x1="13" y1="12" x2="16" y2="12"/><line x1="13" y1="20" x2="16" y2="20"/></g>`,
)
export const ContourPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8c1-5 7-6 11-5s8 4 7 9s-5 9-11 9s-9-4-7-8" opacity="0.35"/><path d="M6 9c1-3 4-4 7-3s6 2 5 6s-3 6-7 6s-6-3-5-5" opacity="0.65"/><path d="M9 10c1-2 4-2 5 0s0 5-2 5s-4-2-3-3"/></g>`,
)
export const Correlogram = icon(
  `<g fill="currentColor"><circle cx="5" cy="5" r="2.7"/><circle cx="10" cy="5" r="2" opacity="0.7"/><circle cx="15" cy="5" r="1.4" opacity="0.45"/><circle cx="20" cy="5" r="0.8" opacity="0.3"/><circle cx="5" cy="10" r="2" opacity="0.7"/><circle cx="10" cy="10" r="2.7"/><circle cx="15" cy="10" r="1.8" opacity="0.6"/><circle cx="20" cy="10" r="1.2" opacity="0.4"/><circle cx="5" cy="15" r="1.4" opacity="0.45"/><circle cx="10" cy="15" r="1.8" opacity="0.6"/><circle cx="15" cy="15" r="2.7"/><circle cx="20" cy="15" r="2.1" opacity="0.75"/><circle cx="5" cy="20" r="0.8" opacity="0.3"/><circle cx="10" cy="20" r="1.2" opacity="0.4"/><circle cx="15" cy="20" r="2.1" opacity="0.75"/><circle cx="20" cy="20" r="2.7"/></g>`,
)
export const Cross = {
  viewBox: `0 0 24 24`,
  d: `M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59L7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12L5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z`,
} satisfies IconData
export const CrystalGrowth = {
  viewBox: `0 0 512 512`,
  d: `m253.8 15.56l-79.9 84.11l2.3 58.83l50.6 36.2l31.9 182l10.8-26.9l11.8-235.4l18.7 1l-9.1 181l28.3-70.8l8.2-108l.9-17.93zm139 50.57l-46.6 50.77l-3.9 51.1l10.6-26.2l30.4-13.7c3.2-20.6 6.3-41.3 9.5-61.97m60.3 51.17l-85.7 38.4l-102.6 255.9l14.6 83.3h7.8l147.6-293.1l16.7 8.4l-143.4 284.7h24.4l146.6-291.8zm-340.2 18.9l-54.11 99.1l69.11 259.6h93.6l-51.1-274.8l18.3-3.4l51.8 278.2h19.9l-50.7-289.4zm358.3 260.4l-65.8-5.2l-49.8 99.2l69.8-36.7zm-435.96-28l42.47 126.7h30.99L80.6 389.9z`,
} satisfies IconData
export const CrystalShrine = {
  viewBox: `0 0 512 512`,
  d: `M116.215 17.404c0 16-16 32-32 32c16 0 32 16 32 32c0-16 16-32 32-32c-16 0-32-16-32-32m64.326 12.87l-23.488 92.062h63.965l27.49-27.49zm228.147 25.958c0 20.214-20.216 40.428-40.43 40.428c20.214 0 40.43 20.214 40.43 40.428c0-20.214 20.213-40.428 40.427-40.428c-20.214 0-40.428-20.214-40.428-40.428zm-150.022 53.913l-23.18 23.18L283.043 311h29.066zm75.232 2.365l16.123 32.281l45.188 33.148l-4.393-53.533zm-18.033 4.181l-26.685 38.121l10 37.586l33.38-42.283zm-160.672 23.645L172.42 206.4l21.988 12.623L239.043 311h25.365l-45.68-170.664zm189.797 23.088l-40.03 50.703L330.737 311h.026l64.08-111.004l-49.852-36.572zm122.352 5.834c0 16-16 32-32 32c16 0 32 16 32 32c0-16 16-32 32-32c-16 0-32-16-32-32m-374.22 12.375l11.308 76.129l48.834-6.356l19.322-24.154l-79.465-45.62zm346.995 53.793l-52.547 13.172L351.547 311h25.77l19.16-19.48zm-255.21 5.244l-17.403 21.75l25.77 48.58h25.761l-34.129-70.33zm-33.84 29.174l-39.005 5.074L148.145 311h24.751zm-91.37 11.396c0 16-16 32-32 32c16 0 32 16 32 32c0-16 16-32 32-32c-16 0-32-16-32-32M137 329v30h238v-30zm32 48v78h16v-78zm34 0v78h106v-78zm124 0v78h16v-78zm-164.758 96l-30.119 16h247.754l-30.12-16H162.243z`,
} satisfies IconData
export const Cursor = {
  viewBox: `0 0 32 32`,
  markup: `<path fill="#444" d="M3.75 9v14h24.5V9L16 2"/><path fill="#939393" d="M16 16V2L3.75 9l24.5 14L16 30L3.75 23"/><path fill="#e3e3e3" d="M28.25 9H16v21"/><path fill="#fff" d="M3.75 9h24.5L16 16"/>`,
} satisfies IconData
export const DataAggregate = icon(
  `<g fill="currentColor"><circle cx="4" cy="6" r="2"/><circle cx="4" cy="12" r="2" opacity="0.7"/><circle cx="4" cy="18" r="2" opacity="0.45"/><circle cx="20" cy="12" r="2.5"/></g><path d="M6 6c5 0 5 6 11.5 6M6 12h11.5M6 18c5 0 5-6 11.5-6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
)
export const DataAnomaly = icon(
  `<path d="M2 16l4-4l3 2l4-9l3 11l3-4l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M13 3.5v2m0 1.2v.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M2 20h20" stroke="currentColor" stroke-width="1.2" opacity="0.4"/>`,
)
export const DataArchive = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 7h18v14H3zM2 3h20v4H2z"/><path d="M9 11h6" stroke-linecap="round"/><path d="M12 13v5m-2-2l2 2l2-2" opacity="0.65"/></g>`,
)
export const DataAugment = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="4" width="14" height="17" rx="1.5"/><path d="M2 9h14M7 4v17m0-7h9m-9 4h6" opacity="0.55"/><path d="M20 3v7m-3.5-3.5h7" stroke-width="1.8" stroke-linecap="round"/></g>`,
)
export const Databases = {
  viewBox: `0 0 32 32`,
  d: `M21 3H11c-1.1 0-2 .9-2 2v22c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M11 5h10v6H11zm0 8h10v6H11zm0 14v-6h10v6zM2 10v16c0 1.1.9 2 2 2h3v-2H4v-4h3v-2H4v-4h3v-2H4v-4h3V8H4c-1.1 0-2 .9-2 2m26-2h-3v2h3v4h-3v2h3v4h-3v2h3v4h-3v2h3c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2M14 9c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1m0 8c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1m0 8c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1`,
} satisfies IconData
export const DataBatch = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="6" y="3" width="15" height="12" rx="1.5"/><path d="M3 6v12h15M1 9v12h14" opacity="0.6"/><path d="M10 7h7m-7 4h5" stroke-linecap="round"/></g>`,
)
export const DataCatalog = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 4h7c1.2 0 2 .8 2 2v15c0-1.2-.8-2-2-2H3zM21 4h-7c-1.2 0-2 .8-2 2v15c0-1.2.8-2 2-2h7z"/><path d="M6 8h3m-3 4h3m6-4h3m-3 4h3" stroke-linecap="round" opacity="0.65"/></g>`,
)
export const DataClean = icon(
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11v16H4zM4 9h11M8 4v16" stroke-width="1.2" opacity="0.55"/><path d="M15 17l5-5l2 2l-5 5z" stroke-width="1.5"/><path d="M18 5v4m-2-2h4" stroke-width="1.4"/></g>`,
)
export const DataCompare = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/><path d="M2 8h8M2 13h8m4-5h8m-8 5h8M10 17h4m-2-2l2 2l-2 2" opacity="0.65"/></g>`,
)
export const DataCube = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="m12 2l9 5v10l-9 5l-9-5V7z"/><path d="m3 7l9 5l9-5M12 12v10"/><path d="m7.5 4.5l9 5v10M7.5 9.5v10" opacity="0.45"/></g>`,
)
export const DataEncode = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="8" height="18" rx="1"/><path d="M2 8h8M2 13h8M6 3v18" opacity="0.5"/><path d="M13 6h2v5h-2zm6 0h2v5h-2zm-6 8h2v5h-2zm6 0h2v5h-2z"/><path d="M16.5 8.5h1m-1 8h1" stroke-linecap="round"/></g>`,
)
export const DataFilter = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="11" height="18" rx="1"/><path d="M2 8h11M7 3v18m0-8h6m-6 4h4" opacity="0.55"/><path d="M15 5h7l-2.5 3v5l-2 1V8z" fill="currentColor" stroke="none"/></g>`,
)
export const DataFrame = icon(
  `<rect x="2" y="3" width="20" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 8h20M7 3v18m5-13v13m5-13v13" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.65"/><g fill="currentColor"><circle cx="4.5" cy="11" r="0.8"/><circle cx="4.5" cy="15" r="0.8"/><circle cx="4.5" cy="19" r="0.8"/></g>`,
)
export const DataGroup = icon(
  `<g fill="currentColor"><rect x="5" y="3" width="5" height="4" rx="1"/><rect x="5" y="10" width="5" height="4" rx="1" opacity="0.7"/><rect x="5" y="17" width="5" height="4" rx="1" opacity="0.45"/></g><path d="M3 3H2v18h1m10-16h8m-8 7h5m-5 7h8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
)
export const DataImpute = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="16" height="18" rx="1.5"/><path d="M2 8h16M7 3v18m5-13v13" opacity="0.5"/><rect x="13.5" y="10" width="3" height="3" rx="0.4" stroke-dasharray="1 1"/><path d="M20 11v7m-2.5-2.5L20 18l2.5-2.5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
)
export const DataIndex = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="3" width="20" height="18" rx="1.5"/><path d="M2 8h20M8 3v18m5-13v13m4-13v13" opacity="0.45"/><path d="M4 12h2m-2 4h2m-2 4h2"/></g>`,
)
export const DataJoin = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="4" width="8" height="16" rx="1"/><rect x="14" y="4" width="8" height="16" rx="1"/><path d="M2 9h8M2 14h8M14 9h8m-8 5h8M10 12h4m-2-2l2 2l-2 2" opacity="0.65"/></g>`,
)
export const DataLabel = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 4h9l5 5l-9 9l-5-5z"/><circle cx="7" cy="8" r="1.2" fill="currentColor" stroke="none"/><path d="M14 5h7m-5 5h5m-9 5h9m-13 5h13" stroke-linecap="round" opacity="0.6"/></g>`,
)
export const DataLineage = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="6" height="5" rx="1"/><rect x="16" y="3" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><path d="M5 8v3h14V8M12 11v5" opacity="0.7"/></g>`,
)
export const DataMerge = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="7" height="7" rx="1"/><rect x="2" y="14" width="7" height="7" rx="1"/><rect x="16" y="8" width="6" height="8" rx="1"/><path d="M9 6.5c4 0 3 5.5 7 5.5M9 17.5c4 0 3-5.5 7-5.5"/><path d="m13 10l3 2l-3 2"/></g>`,
)
export const DataModel = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="8" height="7" rx="1"/><rect x="14" y="3" width="8" height="7" rx="1"/><rect x="8" y="15" width="8" height="6" rx="1"/><path d="M2 6h8m4 0h8M8 18h8M6 10v2h6v3m6-5v2h-6" opacity="0.6"/></g>`,
)
export const DataNormalize = icon(
  `<g fill="currentColor"><rect x="2" y="12" width="3" height="8" rx="0.5"/><rect x="6" y="5" width="3" height="15" rx="0.5" opacity="0.6"/><rect x="15" y="9" width="3" height="11" rx="0.5"/><rect x="19" y="9" width="3" height="11" rx="0.5" opacity="0.6"/></g><path d="M10 12h4m-2-2l2 2l-2 2M2 22h20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
)
export const DataPartition = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="18" rx="1.5"/><path d="M2 8h20M8 3v18m7-13v13" opacity="0.5"/><path d="M8 13h7" stroke-width="2" stroke-dasharray="2 1.5"/><path d="M18 11l3 2l-3 2" stroke-linejoin="round"/></g>`,
)
export const DataPipeline = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><rect x="16" y="3" width="6" height="5" rx="1"/><path d="M8 5.5h8m-2-2l2 2l-2 2M19 8v4c0 2-1 3-3 3h-4v1m-2-2l2 2l-2 2"/></g>`,
)
export const DataQuality = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="13" height="18" rx="1.5"/><path d="M2 8h13M7 3v18m0-8h8m-8 4h5" opacity="0.5"/><path d="m18 10l1.2 2.5l2.8.4l-2 2l.5 2.8l-2.5-1.3l-2.5 1.3l.5-2.8l-2-2l2.8-.4z" fill="currentColor" stroke="none"/></g>`,
)
export const DataSample = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="18" rx="1.5"/><path d="M2 8h20M8 3v18m7-13v13" opacity="0.4"/><rect x="9.5" y="10" width="11" height="8" rx="1" stroke-dasharray="2 1"/><path d="m17 14l2 2l3-4" stroke-width="1.6" stroke-linecap="round"/></g>`,
)
export const DataSchema = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="8" height="6" rx="1"/><rect x="14" y="3" width="8" height="6" rx="1"/><rect x="8" y="16" width="8" height="5" rx="1"/><path d="M6 9v3h12V9M12 12v4"/><path d="M4 6h4m8 0h4m-10 13h4" opacity="0.55"/></g>`,
)
export const Dataset = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M5 3h12l3 3v15H5z"/><path d="M17 3v4h3M8 10h9M8 14h9M8 18h6" opacity="0.65"/><path d="M2 6v17h15" opacity="0.45"/></g>`,
)
export const DataSort = icon(
  `<g fill="currentColor"><rect x="3" y="5" width="9" height="3" rx="0.5"/><rect x="3" y="10.5" width="6" height="3" rx="0.5" opacity="0.7"/><rect x="3" y="16" width="3" height="3" rx="0.5" opacity="0.45"/></g><path d="M18 4v16m-3-3l3 3l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
)
export const DataSource = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><ellipse cx="8" cy="5" rx="5" ry="2.5"/><path d="M3 5v10c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V5M3 10c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5" opacity="0.7"/><path d="M13 12h8m-3-3l3 3l-3 3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
)
export const DataSplit = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5c3 0 3-6 6-6h7m-7 12h7"/><path d="m18 3l3 3l-3 3m0 6l3 3l-3 3"/></g><circle cx="8" cy="12" r="2" fill="currentColor"/>`,
)
export const DataStream = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 7c4-4 7 4 11 0s6-1 9 0M2 12c4-4 7 4 11 0s6-1 9 0M2 17c4-4 7 4 11 0s6-1 9 0"/><path d="m19 4l3 3l-3 3m0-1l3 3l-3 3m0-1l3 3l-3 3" opacity="0.6"/></g>`,
)
export const DataTransform = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="7" height="16" rx="1"/><path d="M2 9h7M2 14h7m3-2h8m-3-3l3 3l-3 3" opacity="0.7"/><path d="M14 20v-4h3v4m1 0v-7h3v7"/></g>`,
)
export const DataValidation = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="13" height="18" rx="1.5"/><path d="M2 8h13M7 3v18m0-8h8m-8 4h5" opacity="0.55"/><path d="m14 17l2.5 2.5L22 13" stroke-width="2"/></g>`,
)
export const DataVersion = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M4 3h11l3 3v8H4zM15 3v4h3"/><path d="M2 7v11h11" opacity="0.5"/><circle cx="17" cy="17" r="5"/><path d="M17 14v3l2 1" stroke-linecap="round"/></g>`,
)
export const DataWarehouse = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2 9l10-6l10 6v12H2zM2 9h20"/><path d="M6 13h4v8H6zm8 0h4v3h-4zm0 5h4v3h-4z"/><path d="M4 6h16" opacity="0.5"/></g>`,
)
export const Dendrogram = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v4h5m-5 4V8m5 0h5m-5 8v-4h5m-5 8v-4m5-8h6m-6 8h6M14 8v8"/></g><g fill="currentColor"><circle cx="4" cy="4" r="1.7"/><circle cx="4" cy="12" r="1.7" opacity="0.75"/><circle cx="9" cy="20" r="1.7" opacity="0.5"/><circle cx="20" cy="8" r="1.7"/><circle cx="20" cy="16" r="1.7" opacity="0.65"/></g>`,
)
export const DensityOfStates = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  markup: `<line x1="3" y1="21" x2="21" y2="21" stroke-width="0.7" opacity="0.3"/><path d="M3 21C3 21 4 21 5 11C6 21 7 21 9 21C9 21 10 21 11 15C12 21 13 21 14 21C14 21 15 21 16.5 6C18 21 19 21 21 21" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M3 21C3 21 4 21 5 11C6 21 7 21 9 21C9 21 10 21 11 15C12 21 13 21 14 21C14 21 15 21 16.5 6C18 21 19 21 21 21Z" fill="currentColor" stroke="none" opacity="0.12"/>`,
} satisfies IconData
export const DensityPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M4 19c3 0 4-1 5-6s2-7 4-7s3 3 4 7s2 6 4 6z" fill="currentColor" opacity="0.35"/><path d="M4 19c3 0 4-1 5-6s2-7 4-7s3 3 4 7s2 6 4 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
)
export const Directory = {
  viewBox: `0 0 24 24`,
  d: `M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z`,
} satisfies IconData
export const Disabled = {
  viewBox: `0 0 24 24`,
  d: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10Zm-4.906-3.68L18.32 7.094A8 8 0 0 1 7.094 18.32ZM5.68 16.906A8 8 0 0 1 16.906 5.68L5.68 16.906Z`,
} satisfies IconData
export const Docs = {
  viewBox: `0 0 16 16`,
  d: `M9 3.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0M9 5v3h1v1H8V6H7V5zM13.855 14.147a1.3 1.3 0 0 1-.158-.246A2 2 0 0 1 13.5 13c0-.414.103-.713.197-.901a1.3 1.3 0 0 1 .158-.246l.003-.005A.5.5 0 0 0 14 11.5V.5a.5.5 0 0 0-.5-.5H3.461l-.083.005a3 3 0 0 0-1.102.298a2.26 2.26 0 0 0-.88.763C1.148 1.44 1 1.913 1 2.5V13c0 .463.117.843.318 1.145c.2.298.462.491.708.615a2.3 2.3 0 0 0 .94.24H3v-1l-.029-.002a1.3 1.3 0 0 1-.498-.133a.8.8 0 0 1-.323-.275C2.07 13.47 2 13.287 2 13s.07-.47.15-.59a.8.8 0 0 1 .324-.275A1.3 1.3 0 0 1 3 12h9.658c-.091.27-.158.605-.158 1s.067.73.158 1H8v1h5.5a.5.5 0 0 0 .359-.848zm-.001 0l.002.002zM2.724 1.197q.14-.068.276-.11C3 2.918 3.001 11 2.999 11h-.033a2 2 0 0 0-.283.3a2.3 2.3 0 0 0-.657.21L2 11.254V2.5c0-.413.102-.689.229-.879c.128-.193.304-.328.495-.424M4 11V1h9v10zM7 13H4v2.5a.5.5 0 0 0 .854.354l.646-.647l.646.647A.5.5 0 0 0 7 15.5z`,
} satisfies IconData
export const DonutChart = icon(
  `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="17 2 10 2 13 3" transform="rotate(-90 12 12)" opacity="0.75"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>`,
)
export const DumbbellPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 5h11M9 10h10M5 15h9M8 20h12" opacity="0.55"/></g><g fill="currentColor"><circle cx="6" cy="5" r="2"/><circle cx="17" cy="5" r="2" opacity="0.55"/><circle cx="9" cy="10" r="2"/><circle cx="19" cy="10" r="2" opacity="0.55"/><circle cx="5" cy="15" r="2"/><circle cx="14" cy="15" r="2" opacity="0.55"/><circle cx="8" cy="20" r="2"/><circle cx="20" cy="20" r="2" opacity="0.55"/></g>`,
)
export const ECDFPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M5 18h3v-3h3v-4h4V8h4V5h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="8" cy="15" r="1.2"/><circle cx="11" cy="11" r="1.2"/><circle cx="15" cy="8" r="1.2"/><circle cx="19" cy="5" r="1.2"/></g>`,
)
export const ElectronShells = {
  viewBox: `0 0 24 24`,
  d: `M12 11c-1.1 0-2 .9-2 2s.9 2 2 2s2-.9 2-2s-.9-2-2-2m6 2c0-3.31-2.69-6-6-6s-6 2.69-6 6c0 2.22 1.21 4.15 3 5.19l1-1.74c-1.19-.7-2-1.97-2-3.45c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.48-.81 2.75-2 3.45l1 1.74c1.79-1.04 3-2.97 3-5.19M12 3C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1-1.73C5.61 18.53 4 15.96 4 13c0-4.42 3.58-8 8-8s8 3.58 8 8c0 2.96-1.61 5.53-4 6.92l1 1.73c2.99-1.73 5-4.95 5-8.65c0-5.52-4.48-10-10-10`,
} satisfies IconData
export const Energy = {
  viewBox: `0 0 512 512`,
  d: `M362.667 42.667L325.51 192h106.667L171.17 469.334l58.389-234.667h-85.333l47.773-192z`,
} satisfies IconData
export const ErrorBandPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5 15c3-6 5-5 8-7s5-1 7-3v6c-2 2-4 1-7 3s-5 1-8 5z" fill="currentColor" opacity="0.3"/><path d="M5 17c3-6 5-5 8-7s5-1 7-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
)
export const ErrorBarPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M7 10v8m-2-8h4m-4 8h4M13 5v9m-2-9h4m-4 9h4m4-6v8m-2-8h4m-4 8h4"/><circle cx="7" cy="14" r="1.5" fill="currentColor"/><circle cx="13" cy="9" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></g>`,
)
export const ExitFullscreen = {
  viewBox: `1.25 1.25 21.5 21.5`,
  d: `M10 4H7.5v4.5H4V11h6zm-2.5 16H10v-6H4v2.5h3.5zM20 14h-6v6h2.5v-3.5H20zm0-5.5h-3.5V4H14v7h6z`,
} satisfies IconData
export const FacetGrid = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="9" height="9" rx="1" opacity="0.35"/><rect x="13" y="2" width="9" height="9" rx="1" opacity="0.35"/><rect x="2" y="13" width="9" height="9" rx="1" opacity="0.35"/><rect x="13" y="13" width="9" height="9" rx="1" opacity="0.35"/><path d="m4 8l2-3l3 2m6 1l2-3l3 3M4 19l2-4l3 3m6 1l2-3l3 1"/></g>`,
)
export const FeatureEngineering = icon(
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h8m-8 7h5m-5 7h8" stroke-width="1.5"/><path d="M15 3v5m-2.5-2.5h5M18 13v8m-4-4h8" stroke-width="1.7"/><circle cx="10" cy="12" r="2.5" stroke-width="1.3" opacity="0.6"/></g>`,
)
export const FeatureSelection = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><path d="M2 8h14M7 3v18m0-8h9m-9 4h6" opacity="0.55"/><path d="M18 5h4l-1.5 2v4l-1 1V7z" fill="currentColor" stroke="none"/><path d="m16 17l2 2l4-5" stroke-width="1.8"/></g>`,
)
export const FermiSurface = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  markup: `<g stroke-width="1.3" fill="none"><circle cx="12" cy="12" r="9" opacity="0.3"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="9"/><ellipse cx="12" cy="12" rx="6" ry="7" transform="rotate(45 12 12)" opacity="0.5"/></g>`,
} satisfies IconData
export const ForestPlot = icon(
  `<path d="M12 3v18" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5" opacity="0.45"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 6h8M7 11h10M5 16h13M9 21h11"/></g><g fill="currentColor"><circle cx="8" cy="6" r="1.8"/><rect x="10" y="9.5" width="3" height="3" transform="rotate(45 11.5 11)"/><circle cx="14" cy="16" r="1.8"/><circle cx="16" cy="21" r="1.8"/></g>`,
)
export const FunnelPlot = icon(
  `<g fill="currentColor"><path d="M2 3h20l-3 4H5z"/><path d="M6 9h12l-3 4H9z" opacity="0.75"/><path d="M10 15h4l-1 6h-2z" opacity="0.5"/></g>`,
)
export const GanttChart = icon(
  `<g fill="currentColor"><rect x="7" y="3" width="9" height="3" rx="0.7"/><rect x="11" y="8" width="10" height="3" rx="0.7" opacity="0.75"/><rect x="5" y="13" width="9" height="3" rx="0.7" opacity="0.55"/><rect x="9" y="18" width="10" height="3" rx="0.7" opacity="0.85"/></g><path d="M2 4.5h2m-2 5h6m-6 5h1m-1 5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
)
export const GaugeChart = icon(
  `<path d="M3 17a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 2" opacity="0.45"/><path d="m12 16l5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16" r="2.2" fill="currentColor"/><path d="M5 20h14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
)
export const Grid2x2 = {
  viewBox: `0 0 24 24`,
  d: `M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M4 4h7v7H4zm0 9h7v7H4zm9-9h7v7h-7zm0 9h7v7h-7z`,
} satisfies IconData
export const HandsClapping = {
  viewBox: `0 0 256 256`,
  d: `M160.22 24V8a8 8 0 0 1 16 0v16a8 8 0 0 1-16 0m35.88 17a7.9 7.9 0 0 0 4.17 1.17a8 8 0 0 0 6.84-3.83l8-13.11a8 8 0 0 0-13.68-8.33l-8 13.1a8 8 0 0 0 2.67 11m47.51 12.59a8 8 0 0 0-10.08-5.16l-15.06 4.85a8 8 0 0 0 2.46 15.62a8.2 8.2 0 0 0 2.46-.39l15.05-4.85a8 8 0 0 0 5.17-10.11ZM217 97.58a80.22 80.22 0 0 1-10.22 94c-.34 1.73-.72 3.46-1.19 5.18A80.17 80.17 0 0 1 58.77 216L23.5 155a26 26 0 0 1 19.24-38.79l-3-5.2a26 26 0 0 1 19.2-38.78l-.7-1.23a26 26 0 0 1 37.23-34.47a26.06 26.06 0 0 1 44.83.47l12.26 21.2a26.07 26.07 0 0 1 43.25 2.8ZM109.07 55l25 43.17a26 26 0 0 1 17.33-10L126.42 45a10 10 0 1 0-17.35 10m-36.95 8l6.46 11.17a26.05 26.05 0 0 1 17.32-10L89.45 53a10 10 0 1 0-17.33 10m111.54 81l-20.22-35a10 10 0 0 0-17.74 9.25L158.3 140a8 8 0 0 1-13.87 8l-36.5-63a10 10 0 1 0-17.35 10l26.05 45a8 8 0 0 1-13.87 8L71 93a10 10 0 0 0-17.33 10l35.22 61A8 8 0 0 1 75 172l-20.28-35a10 10 0 0 0-17.34 10l35.27 61a64.12 64.12 0 0 0 117.42-15.44a63.52 63.52 0 0 0-6.41-48.56m19.41-38.42L181.93 69a10 10 0 0 0-17.38 10l33 57.05a80.2 80.2 0 0 1 9.45 25.46a64.23 64.23 0 0 0-3.93-55.93`,
} satisfies IconData
export const HasseDiagram = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 3L6 9m6-6l6 6M6 9l6 6m6-6l-6 6m0 0l-5 6m5-6l5 6" opacity="0.65"/></g><g fill="currentColor"><circle cx="12" cy="3" r="2"/><circle cx="6" cy="9" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="7" cy="21" r="2"/><circle cx="17" cy="21" r="2"/></g>`,
)
export const HeatmapMatrix = icon(
  `<rect x="2" y="2" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.9"/><rect x="9.2" y="2" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.4"/><rect x="16.5" y="2" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.15"/><rect x="2" y="9.2" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.5"/><rect x="9.2" y="9.2" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.8"/><rect x="16.5" y="9.2" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.35"/><rect x="2" y="16.5" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.2"/><rect x="9.2" y="16.5" width="5.5" height="5.5" rx="0.8" fill="currentColor" opacity="0.65"/><rect x="16.5" y="16.5" width="5.5" height="5.5" rx="0.8" fill="currentColor"/>`,
)
export const HeatmapTable = icon(
  `<rect x="2" y="2" width="20" height="4" rx="1" fill="currentColor" opacity="0.25"/><rect x="2" y="8" width="9" height="3.5" rx="0.5" fill="currentColor" opacity="0.6"/><rect x="13" y="8" width="9" height="3.5" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="2" y="13.5" width="9" height="3.5" rx="0.5" fill="currentColor" opacity="0.85"/><rect x="13" y="13.5" width="9" height="3.5" rx="0.5" fill="currentColor" opacity="0.5"/><rect x="2" y="19" width="9" height="3.5" rx="0.5" fill="currentColor" opacity="0.3"/><rect x="13" y="19" width="9" height="3.5" rx="0.5" fill="currentColor" opacity="0.9"/>`,
)
export const HexbinPlot = icon(
  `<g fill="currentColor"><path d="m9 2l3 1.7v3.5L9 9L6 7.2V3.7z" opacity="0.45"/><path d="m15 5.5l3 1.7v3.5l-3 1.8l-3-1.8V7.2z" opacity="0.8"/><path d="m9 9l3 1.7v3.5L9 16l-3-1.8v-3.5z"/><path d="m15 12.5l3 1.7v3.5l-3 1.8l-3-1.8v-3.5z" opacity="0.55"/><path d="m9 16l3 1.7v3.5L9 23l-3-1.8v-3.5z" opacity="0.7"/></g>`,
)
export const Histogram = {
  viewBox: `0 0 48 48`,
  stroke: `currentColor`,
  fill: `currentColor`,
  d: `M4 42h40 M8 28h6v14H8zm13-10h6v24h-6zM34 6h6v36h-6z`,
} satisfies IconData
export const Histogram2D = icon(
  `<g fill="currentColor"><rect x="3" y="3" width="4" height="4" opacity="0.2"/><rect x="8" y="3" width="4" height="4" opacity="0.5"/><rect x="13" y="3" width="4" height="4" opacity="0.8"/><rect x="18" y="3" width="3" height="4" opacity="0.35"/><rect x="3" y="8" width="4" height="4" opacity="0.45"/><rect x="8" y="8" width="4" height="4" opacity="0.9"/><rect x="13" y="8" width="4" height="4"/><rect x="18" y="8" width="3" height="4" opacity="0.6"/><rect x="3" y="13" width="4" height="4" opacity="0.75"/><rect x="8" y="13" width="4" height="4"/><rect x="13" y="13" width="4" height="4" opacity="0.65"/><rect x="18" y="13" width="3" height="4" opacity="0.3"/><rect x="3" y="18" width="4" height="3" opacity="0.25"/><rect x="8" y="18" width="4" height="3" opacity="0.55"/><rect x="13" y="18" width="4" height="3" opacity="0.4"/><rect x="18" y="18" width="3" height="3" opacity="0.15"/></g>`,
)
export const IciclePlot = icon(
  `<g fill="currentColor"><rect x="2" y="2" width="20" height="5" rx="0.6"/><rect x="2" y="8" width="12" height="5" rx="0.6" opacity="0.75"/><rect x="15" y="8" width="7" height="5" rx="0.6" opacity="0.45"/><rect x="2" y="14" width="5" height="8" rx="0.6" opacity="0.85"/><rect x="8" y="14" width="6" height="8" rx="0.6" opacity="0.55"/><rect x="15" y="14" width="3" height="8" rx="0.6" opacity="0.7"/><rect x="19" y="14" width="3" height="8" rx="0.6" opacity="0.3"/></g>`,
)
export const Issues = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  d: `M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4M9 18c-4.51 2-5-2-7-2`,
} satisfies IconData
export const Lattice = {
  viewBox: `0 0 24 24`,
  d: `m6.953 7.244l3.458-1.97a1.9 1.9 0 0 1-.108-.608c0-.835.608-1.525 1.407-1.67V0h.58v2.995a1.704 1.704 0 0 1 1.407 1.67c0 .219-.045.418-.118.609l3.468 1.97q.192-.219.454-.382a1.705 1.705 0 0 1 2.151.382l2.596-1.498l.29.508l-2.595 1.498a1.69 1.69 0 0 1-1.244 2.242v4.012a1.69 1.69 0 0 1 1.244 2.242l2.596 1.498l-.29.508l-2.597-1.498a1.705 1.705 0 0 1-2.151.382a2 2 0 0 1-.454-.382c-1.153.654-2.306 1.317-3.468 1.97c.073.19.118.39.118.608c0 .835-.608 1.525-1.407 1.67V24h-.58v-2.995a1.704 1.704 0 0 1-1.407-1.67c0-.219.045-.418.108-.609l-3.458-1.97a2 2 0 0 1-.454.382a1.705 1.705 0 0 1-2.151-.382l-2.596 1.498l-.29-.508l2.595-1.498a1.69 1.69 0 0 1 1.244-2.242V9.994a1.69 1.69 0 0 1-1.244-2.242L1.461 6.254l.29-.508l2.597 1.498a1.705 1.705 0 0 1 2.151-.382c.173.11.327.236.454.382m9.803 9.004a1.68 1.68 0 0 1 .128-1.425a1.7 1.7 0 0 1 1.234-.835v-3.976a1.7 1.7 0 0 1-1.234-.835a1.68 1.68 0 0 1-.128-1.425L13.29 5.773a1.7 1.7 0 0 1-1.289.59a1.7 1.7 0 0 1-1.289-.59L7.244 7.752c.163.454.136.98-.128 1.425a1.7 1.7 0 0 1-1.234.835v3.976a1.7 1.7 0 0 1 1.234.835c.264.445.291.971.128 1.425l3.467 1.979a1.7 1.7 0 0 1 1.289-.59a1.7 1.7 0 0 1 1.289.59z`,
} satisfies IconData
export const LinePlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="m5 17l4-5l4 2l6-8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="5" cy="17" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="13" cy="14" r="1.4"/><circle cx="19" cy="6" r="1.4"/></g>`,
)
export const LollipopPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><g stroke="currentColor" stroke-width="1.4"><path d="M7 18V9m5 9V5m5 13v-6"/></g><g fill="currentColor"><circle cx="7" cy="9" r="2.2"/><circle cx="12" cy="5" r="2.2" opacity="0.75"/><circle cx="17" cy="12" r="2.2" opacity="0.5"/></g>`,
)
export const LorenzCurve = icon(
  `<path d="M3 3v18h18M4 20L20 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/><path d="M4 20c7 0 12-2 16-16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
)
export const Magnetic = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  markup: `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 3v18m6-14c-.633-1.255-1.538-2-2.5-2c-1.933 0-3.5 3.134-3.5 7s1.567 7 3.5 7s3.5-3.134 3.5-7v-1M6 7c.633-1.255 1.538-2 2.5-2c1.933 0 3.5 3.134 3.5 7s-1.567 7-3.5 7S5 15.866 5 12v-1"/><path d="m3 13l2-2l2 2m10 0l2-2l2 2"/></g>`,
} satisfies IconData
export const ManhattanPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><g fill="currentColor"><circle cx="5" cy="17" r="1" opacity="0.45"/><circle cx="7" cy="14" r="1"/><circle cx="9" cy="18" r="1" opacity="0.6"/><circle cx="11" cy="11" r="1"/><circle cx="13" cy="16" r="1" opacity="0.5"/><circle cx="15" cy="6" r="1.2"/><circle cx="17" cy="13" r="1" opacity="0.65"/><circle cx="19" cy="9" r="1"/><circle cx="21" cy="17" r="1" opacity="0.45"/></g><path d="M4 8h17" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1" opacity="0.35"/>`,
)
export const Materials = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  d: `M3 7l7-4l11 4M3 7v5l11 4l7-4V7M3 7l11 4l7-4M3 12v5l11 4l7-4v-5`,
} satisfies IconData
export const MissingData = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="18" rx="1.5"/><path d="M2 8h20M8 3v18m7-13v13" opacity="0.55"/><rect x="9.5" y="10" width="4" height="4" rx="0.5" stroke-dasharray="1.5 1"/><path d="m17 16l4 4m0-4l-4 4" stroke-width="1.7" stroke-linecap="round"/></g>`,
)
export const MissingMetadata = {
  viewBox: `0 0 24 24`,
  d: `M19.75 2A2.25 2.25 0 0 1 22 4.25v5.462a3.25 3.25 0 0 1-.952 2.298l-.026.026a6.476 6.476 0 0 0-1.43-.692l.396-.395a1.75 1.75 0 0 0 .512-1.237V4.25a.75.75 0 0 0-.75-.75h-5.465c-.465 0-.91.185-1.239.513l-8.512 8.523a1.75 1.75 0 0 0 .015 2.462l4.461 4.454a1.755 1.755 0 0 0 2.33.13c.165.487.386.947.654 1.375a3.256 3.256 0 0 1-4.043-.443L3.489 16.06a3.25 3.25 0 0 1-.003-4.596l8.5-8.51A3.25 3.25 0 0 1 14.284 2h5.465zM17 5.502a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zM23 17.5a5.5 5.5 0 1 0-11 0a5.5 5.5 0 0 0 11 0zm-6.125 3.005a.625.625 0 1 1 1.25 0a.625.625 0 0 1-1.25 0zm-1.228-4.548c-.011-1.137.805-1.954 1.853-1.954c1.031 0 1.853.846 1.853 1.95c0 .566-.185.913-.663 1.447l-.265.29l-.101.116c-.248.292-.324.462-.324.695a.5.5 0 1 1-1 0c0-.576.187-.926.671-1.468l.265-.29l.1-.113c.242-.286.317-.453.317-.677c0-.558-.38-.95-.853-.95c-.494 0-.859.366-.853.945a.5.5 0 1 1-1 .01z`,
} satisfies IconData
export const MoleculeNetwork = {
  viewBox: `0 0 24 24`,
  d: `m21.24 5.46l-3-1.72a1.5 1.5 0 0 0-1.49 0l-2.6 1.49a.47.47 0 0 1-.43 0l-3.41-1.31a.5.5 0 0 1-.31-.47V2.12A1.23 1.23 0 0 0 9.31 1L7.56.13a1.29 1.29 0 0 0-1.12 0L4.69 1A1.23 1.23 0 0 0 4 2.12v2.17a1.24 1.24 0 0 0 .68 1.11l1.75.9a1.23 1.23 0 0 0 1.14 0l1.25-.64a.5.5 0 0 1 .41 0L12.69 7a.5.5 0 0 1 .31.47v2.21a1.48 1.48 0 0 0 .76 1.3l1.61.93a.24.24 0 0 1 .13.2a.25.25 0 0 1-.1.21l-3.21 2.38a.5.5 0 0 1-.54 0l-3.42-1.9a1.51 1.51 0 0 0-1.46 0l-4 2.22A1.53 1.53 0 0 0 2 16.37v3.91a1.5 1.5 0 0 0 .77 1.31l4 2.22a1.5 1.5 0 0 0 1.46 0l4-2.22a1.5 1.5 0 0 0 .77-1.31v-3.44a.51.51 0 0 1 .2-.4a71 71 0 0 1 8-5.46a1.48 1.48 0 0 0 .8-1.3V6.76a1.48 1.48 0 0 0-.76-1.3m-14-1.23a.53.53 0 0 1-.46 0L6.27 4A.49.49 0 0 1 6 3.53V2.9a.5.5 0 0 1 .28-.45l.5-.25a.49.49 0 0 1 .44 0l.5.25A.5.5 0 0 1 8 2.9v.63a.49.49 0 0 1-.27.47ZM11 19.69a.51.51 0 0 1-.26.44l-3 1.66a.46.46 0 0 1-.48 0l-3-1.66a.51.51 0 0 1-.26-.44V17a.48.48 0 0 1 .26-.43l3-1.67a.51.51 0 0 1 .48 0l3 1.67A.48.48 0 0 1 11 17ZM20 9.1a.5.5 0 0 1-.25.43l-2 1.15a.55.55 0 0 1-.5 0l-2-1.15A.5.5 0 0 1 15 9.1V7.34a.52.52 0 0 1 .25-.44l2-1.14a.52.52 0 0 1 .5 0l2 1.15a.5.5 0 0 1 .25.43Z`,
} satisfies IconData
export const MosaicPlot = icon(
  `<g fill="currentColor"><rect x="2" y="2" width="7" height="12" rx="0.8"/><rect x="11" y="2" width="11" height="5" rx="0.8" opacity="0.75"/><rect x="11" y="9" width="5" height="5" rx="0.8" opacity="0.45"/><rect x="18" y="9" width="4" height="13" rx="0.8" opacity="0.85"/><rect x="2" y="16" width="14" height="6" rx="0.8" opacity="0.6"/></g>`,
)
export const NetworkPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5 6l6 5m0 0l7-6m-7 6l2 8m-8-3l6-5m7-6l1 9m-6 5l6-5" opacity="0.65"/></g><g fill="currentColor"><circle cx="5" cy="6" r="2.3"/><circle cx="11" cy="11" r="2.7"/><circle cx="18" cy="5" r="2" opacity="0.75"/><circle cx="5" cy="16" r="2" opacity="0.5"/><circle cx="13" cy="19" r="2.2" opacity="0.8"/><circle cx="19" cy="14" r="2.4"/></g>`,
)
export const NeuralNetwork = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  d: `M21.5 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0m-8-8a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1 7.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-6-4a2 2 0 1 1-4 0a2 2 0 0 1 4 0m4 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0m3-14.5l4 5m-3 5.5l-4 3m-2.5-1l-3-8m1.313-2.846L10.5 4.5m2 7l4.005.344M12 5.5L11 10`,
} satisfies IconData
export const NyquistPlot = icon(
  `<path d="M3 3v18h18M3 12h18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/><path d="M5 12c0-5 5-8 10-6s6 7 2 10s-9 1-7-2s5-2 5 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
)
export const Optimade = {
  viewBox: `0 0 55 55`,
  markup: ` <g id="between"> <path stroke="#9ed700" stroke-width="1.15" d="m27 14.5 11-6.553" /> <path stroke="#00acd9" stroke-width="1.15" d="M37.825 33.25 38 46.053" /> <path stroke="#7a2dd0" stroke-width="1.15" d="M16.175 33.25 5 27" /> </g> <g id="outside"> <path stroke="#00acd9" stroke-width="1.15" d="M49 27 38 46.053" /> <path stroke="#f1f1f1" stroke-width="2" d="M38 46.053H16" /> <path stroke="#7a2dd0" stroke-width="1.15" d="M16 46.053 5 27" /> <path stroke="#f1f1f1" stroke-width="2" d="M5 27 16 7.947" /> <path stroke="#9ed700" stroke-width="1.15" d="M16 7.947h22" /> <path stroke="#f1f1f1" stroke-width="2" d="M38 7.947 49 27" /> <circle cx="49" cy="27" r="3.5" fill="#00acd9" /> <circle cx="38" cy="46.053" r="3.5" fill="#00acd9" /> <circle cx="16" cy="46.053" r="3.5" fill="#7a2dd0" /> <circle cx="5" cy="27" r="3.5" fill="#7a2dd0" /> <circle cx="16" cy="7.947" r="3.5" fill="#9ed700" /> <circle cx="38" cy="7.947" r="3.5" fill="#9ed700" /> </g> <g id="inside"> <path stroke="#ff414d" d="m27 39.5-10.825-6.25M16.175 33.25v-12.5M16.175 20.75 27 14.5M27 14.5l10.825 6.25M37.825 20.75v12.5M37.825 33.25 27 39.5" /> <circle cx="27" cy="39.5" r="2.5" fill="#ff414d" /> <circle cx="16.175" cy="33.25" r="2.5" fill="#ff414d" /> <circle cx="16.175" cy="20.75" r="2.5" fill="#ff414d" /> <circle cx="27" cy="14.5" r="2.5" fill="#ff414d" /> <circle cx="37.825" cy="20.75" r="2.5" fill="#ff414d" /> <circle cx="37.825" cy="33.25" r="2.5" fill="#ff414d" /> </g>`,
} satisfies IconData
export const OutlierDetection = icon(
  `<g fill="currentColor"><circle cx="6" cy="15" r="1.4"/><circle cx="9" cy="12" r="1.5" opacity="0.7"/><circle cx="11" cy="16" r="1.3"/><circle cx="14" cy="13" r="1.5" opacity="0.8"/><circle cx="8" cy="18" r="1.2" opacity="0.6"/><circle cx="18" cy="6" r="1.7"/></g><circle cx="18" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1"/><path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>`,
)
export const Paper = {
  viewBox: `0 0 24 24`,
  d: `M16.5 19q1.05 0 1.775-.725T19 16.5t-.725-1.775T16.5 14t-1.775.725T14 16.5t.725 1.775T16.5 19m5.8 3.3q-.275.275-.7.275t-.7-.275l-2-2q-.525.35-1.137.525T16.5 21q-1.875 0-3.187-1.312T12 16.5t1.313-3.187T16.5 12t3.188 1.313T21 16.5q0 .65-.175 1.263T20.3 18.9l2 2q.275.275.275.7t-.275.7M5 22q-.825 0-1.412-.587T3 20V4q0-.825.588-1.412T5 2h7.175q.4 0 .763.15t.637.425l4.85 4.85q.275.275.425.638t.15.762v.45q0 .45-.363.725t-.812.15q-.325-.075-.65-.113T16.5 10q-2.95 0-4.75 2t-1.8 4.525q0 1.1.388 2.175t1.212 2.025q.35.375.162.825t-.637.45zm7-18v4q0 .425.288.713T13 9h4zl5 5z`,
} satisfies IconData
export const ParallelCoordinates = icon(
  `<g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M4 3v18m5-18v18m6-18v18m5-18v18" stroke-width="1.1" opacity="0.35"/><path d="M4 7l5 9l6-7l5 5M4 16l5-6l6 8l5-11M4 12l5 2l6-9l5 13" stroke-width="1.3"/></g>`,
)
export const ParetoChart = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><g fill="currentColor"><rect x="5" y="8" width="3" height="11" rx="0.4"/><rect x="9.5" y="11" width="3" height="8" rx="0.4" opacity="0.75"/><rect x="14" y="14" width="3" height="5" rx="0.4" opacity="0.55"/><rect x="18.5" y="16" width="2.5" height="3" rx="0.4" opacity="0.35"/></g><path d="M6.5 6l4.5 2l4.5 1l4.5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
)
export const Phonons = icon(
  `<path d="M16.67 9.295l.83 3.625l1.285-2.625L18 7.07zM5.245 13.615l.755 3.8L7.265 14.5L6.5 11.07zM9 18.43l.88-.075l.62-2.71V8.07L9 11.395zM13.5 16.43l.88-.65l.62-2.7V5.57l-1.5 3.25z"/><path d="M9 18.43c1.15.285 2.34-.34 2.65-1.4L15 5.57c-1.15-.285-2.34.34-2.65 1.4zM8.385 16.04A1.95 1.95 0 0 1 6 17.43l2.115-7.97A1.95 1.95 0 0 1 10.5 8.07zM15.885 15.04a1.947 1.947 0 0 1-2.385 1.39l2.115-7.97A1.95 1.95 0 0 1 18 7.07zM19.985 11.59c-.285 1.015-1.4 1.615-2.485 1.345l1.01-3.525c.29-1.015 1.405-1.615 2.49-1.345zM3 15.935c1.085.27 2.2-.33 2.49-1.345l1.01-3.525c-1.085-.27-2.2.33-2.49 1.345z"/>`,
)
export const PieChart = icon(
  `<path d="M11 2a10 10 0 1 0 10 10H11z" fill="currentColor" opacity="0.35"/><path d="M13 2v8h8A10 10 0 0 0 13 2" fill="currentColor"/><path d="M13 12h8a10 10 0 0 1-4 8z" fill="currentColor" opacity="0.7"/>`,
)
export const PolarPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-width="1.2" opacity="0.35"/><circle cx="12" cy="12" r="4.5" stroke-width="1" opacity="0.25"/><path d="M12 3v18M3 12h18" stroke-width="1" opacity="0.25"/><path d="M12 12c1-5 6-6 7-2s-3 8-7 7s-6-5-3-8" stroke-width="1.6"/></g>`,
)
export const PrecisionRecallPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5 6c4 0 5 1 7 4s4 6 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 6v12h15" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5" opacity="0.35"/>`,
)
export const QQPlot = icon(
  `<path d="M3 3v18h18M5 19L20 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/><g fill="currentColor"><circle cx="7" cy="17" r="1.4"/><circle cx="9.5" cy="14" r="1.4"/><circle cx="12" cy="12.5" r="1.4"/><circle cx="15" cy="8.5" r="1.4"/><circle cx="18" cy="6.5" r="1.4"/></g>`,
)
export const RadarPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-linejoin="round"><path d="m12 2l9.5 7l-3.6 11H6.1L2.5 9zM12 2v19M2.5 9L18 20M21.5 9L6 20" stroke-width="1" opacity="0.3"/><path d="m12 5l6 5l-2.5 7l-7-1l-3-6z" fill="currentColor" fill-opacity="0.3" stroke-width="1.5"/></g>`,
)
export const RegressionPlot = icon(
  `<path d="M3 3v18h18M5 18L20 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/><g fill="currentColor"><circle cx="7" cy="15" r="1.4"/><circle cx="9" cy="17" r="1.4" opacity="0.65"/><circle cx="12" cy="11" r="1.4"/><circle cx="15" cy="12" r="1.4" opacity="0.65"/><circle cx="18" cy="6" r="1.4"/></g>`,
)
export const RepoFork = {
  viewBox: `0 0 24 24`,
  stroke: `currentColor`,
  markup: `<g fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="20" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v5"/></g>`,
} satisfies IconData
export const ResidualPlot = icon(
  `<path d="M3 3v18h18M4 12h17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/><g stroke="currentColor" stroke-width="1.2"><path d="M7 12V7m4 5v4m4-4V9m4 3v6"/></g><g fill="currentColor"><circle cx="7" cy="7" r="1.5"/><circle cx="11" cy="16" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="19" cy="18" r="1.5"/></g>`,
)
export const RidgelinePlot = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 7c3 0 3-4 6-4s3 4 6 4s3-2 6-2M3 13c3 0 3-5 6-5s3 5 6 5s3-3 6-3M3 19c3 0 3-6 6-6s3 6 6 6s3-4 6-4"/><path d="M3 7h18M3 13h18M3 19h18" opacity="0.25"/></g>`,
)
export const ROCPlot = icon(
  `<path d="M3 3v18h18M4 20L20 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/><path d="M4 20c0-9 4-14 16-16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
)
export const RugPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><g stroke="currentColor" stroke-width="1.5"><path d="M6 21v-4m3 4v-6m2.5 6v-3m3 3v-7m2 7v-5m3 5v-3"/></g>`,
)
export const Sankey = icon(
  `<g fill="currentColor"><rect x="2" y="3" width="3" height="7" rx="0.6"/><rect x="2" y="14" width="3" height="7" rx="0.6" opacity="0.65"/><rect x="10.5" y="5" width="3" height="14" rx="0.6"/><rect x="19" y="3" width="3" height="9" rx="0.6"/><rect x="19" y="15" width="3" height="6" rx="0.6" opacity="0.65"/></g><g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M5 6.5c2.8 0 2.7 3 5.5 3" stroke-width="2.8" opacity="0.8"/><path d="M5 17.5c2.8 0 2.7-3 5.5-3" stroke-width="2.3" opacity="0.45"/><path d="M13.5 9c2.8 0 2.7-2.5 5.5-2.5" stroke-width="3.5" opacity="0.75"/><path d="M13.5 15c2.8 0 2.7 3 5.5 3" stroke-width="2.2" opacity="0.45"/></g>`,
)
export const ScatterPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><g fill="currentColor"><circle cx="7" cy="16" r="1.7"/><circle cx="10.5" cy="12.5" r="1.4" opacity="0.7"/><circle cx="14" cy="14.5" r="1.6"/><circle cx="16.5" cy="8" r="1.8" opacity="0.8"/><circle cx="20" cy="5" r="1.3"/></g>`,
)
export const ScatterPlot3D = icon(
  `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"><line x1="3" y1="21" x2="3" y2="5"/><line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="21" x2="9" y2="15"/></g><circle cx="11" cy="11" r="1.5" fill="currentColor"/><circle cx="16" cy="15" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="15" cy="8" r="1.5" fill="currentColor"/>`,
)
export const SlopeChart = icon(
  `<path d="M5 3v18m14-18v18" stroke="currentColor" stroke-width="1.1" opacity="0.35"/><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 6l14 10M5 12l14-5M5 18l14-7"/></g><g fill="currentColor"><circle cx="5" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="7" r="1.5"/><circle cx="19" cy="11" r="1.5"/><circle cx="19" cy="16" r="1.5"/></g>`,
)
export const SmallMultiples = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="9" height="9" rx="1"/><path d="M4 9l2-3l2 1l1-3"/><rect x="13" y="2" width="9" height="9" rx="1"/><path d="M15 8l2-2l3 3"/><rect x="2" y="13" width="9" height="9" rx="1"/><path d="M4 20l2-4l3 2"/><rect x="13" y="13" width="9" height="9" rx="1"/><path d="M15 19l2-3l3 1"/></g>`,
)
export const SolarPanel = {
  viewBox: `0 0 48 48`,
  stroke: `currentColor`,
  markup: `<g fill="none" stroke-width="4"><rect width="40" height="24" x="4" y="8" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M30 32V8M18 32V8m24 12H6m18 21v-9m7 9H17"/></g>`,
} satisfies IconData
export const SpacegroupBarPlot = icon(
  `<rect x="2" y="13" width="3.5" height="8" fill="currentColor"/><rect x="7" y="7" width="3.5" height="14" fill="currentColor"/><rect x="12" y="10" width="3.5" height="11" fill="currentColor"/><rect x="17" y="5" width="3.5" height="16" fill="currentColor"/><path d="M21 2l1.5 2.5h-3z" fill="currentColor" opacity="0.5"/>`,
)
export const Spectrum = {
  viewBox: `0 0 512 512`,
  d: `M16 160h32v192H16zm360 0h32v192h-32zM104 88h32v328h-32zm184 8h32v320h-32zm176 0h32v320h-32zM192 16h32v480h-32z`,
} satisfies IconData
export const StackedAreaPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 18c3-5 5-1 8-5s5-2 8-6v11z" fill="currentColor" opacity="0.4"/><path d="M4 18c3-2 5 0 8-2s5-1 8-3v5z" fill="currentColor" opacity="0.85"/><path d="M4 18c3-5 5-1 8-5s5-2 8-6" fill="none" stroke="currentColor" stroke-width="1.3"/>`,
)
export const StemPlot = icon(
  `<path d="M3 3v18h18M4 12h17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/><g stroke="currentColor" stroke-width="1.4"><path d="M7 12V6m4 6v4m4-4V8m4 4v7"/></g><g fill="currentColor"><circle cx="7" cy="6" r="1.4"/><circle cx="11" cy="16" r="1.4"/><circle cx="15" cy="8" r="1.4"/><circle cx="19" cy="19" r="1.4"/></g>`,
)
export const StepPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M5 18h4v-5h4V9h4V5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
)
export const Streamgraph = icon(
  `<path d="M2 9c4-5 7 2 11-2s6 0 9-2v4c-3 2-5-2-9 2S6 9 2 13z" fill="currentColor" opacity="0.35"/><path d="M2 13c4-4 7 2 11-2s6 0 9-2v5c-4-1-6 3-10 2s-6 2-10 1z" fill="currentColor" opacity="0.7"/><path d="M2 17c4 1 6-2 10-1s6-3 10-2v4c-5-1-7 3-11 1s-6 2-9 0z" fill="currentColor"/>`,
)
export const StripPlot = icon(
  `<path d="M3 3v18h18M7 5v14m5-14v14m5-14v14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/><g fill="currentColor"><circle cx="6.4" cy="8" r="1.3"/><circle cx="7.6" cy="12" r="1.3"/><circle cx="6.6" cy="17" r="1.3"/><circle cx="11.5" cy="6" r="1.3"/><circle cx="12.5" cy="11" r="1.3"/><circle cx="11.7" cy="15" r="1.3"/><circle cx="17.4" cy="9" r="1.3"/><circle cx="16.5" cy="13" r="1.3"/><circle cx="17.6" cy="18" r="1.3"/></g>`,
)
export const Sunburst = icon(
  `<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="13 2 8 2 18 3" transform="rotate(-90 12 12)" opacity="0.45"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 1.5 4 1.5 9 2" transform="rotate(-35 12 12)" opacity="0.8"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/>`,
)
export const SurvivalPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5 6h4v3h3v3h3v4h3v3h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="1.1"><path d="M8 7h2m-1-1v2m5 5h2m-1-1v2m4 3h2m-1-1v2"/></g>`,
)
export const SwarmPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/><g fill="currentColor"><circle cx="7" cy="17" r="1.4"/><circle cx="9" cy="14" r="1.4"/><circle cx="11" cy="17" r="1.4"/><circle cx="13" cy="13" r="1.4"/><circle cx="15" cy="16" r="1.4"/><circle cx="17" cy="11" r="1.4"/><circle cx="19" cy="15" r="1.4"/><circle cx="12" cy="9" r="1.4"/><circle cx="16" cy="7" r="1.4"/></g>`,
)
export const TernaryPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M12 2L22 21H2z" stroke-width="1.5"/><path d="M7 11.5h10M4.5 16h15M9.5 7h5M7 11.5l5 9.5m5-9.5L12 21" stroke-width="1" opacity="0.3"/></g><g fill="currentColor"><circle cx="10" cy="14" r="1.4"/><circle cx="14" cy="17" r="1.4" opacity="0.7"/><circle cx="13" cy="9" r="1.4"/></g>`,
)
export const ThreePanels = {
  viewBox: `0 0 24 24`,
  d: `M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M4 4h5v16H4zm7 0h9v8h-9zm0 10h9v6h-9z`,
} satisfies IconData
export const TimeSeriesPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5 16l3-4l3 2l3-7l3 4l4-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 19v2m6-2v2m6-2v2" stroke="currentColor" stroke-width="1.1" opacity="0.6"/>`,
)
export const Treemap = icon(
  `<g fill="currentColor"><rect x="2" y="2" width="11" height="12" rx="1"/><rect x="15" y="2" width="7" height="7" rx="1" opacity="0.65"/><rect x="15" y="11" width="7" height="11" rx="1" opacity="0.85"/><rect x="2" y="16" width="6" height="6" rx="1" opacity="0.55"/><rect x="10" y="16" width="3" height="6" rx="1" opacity="0.35"/></g>`,
)
export const TwoColumns = {
  viewBox: `0 0 24 24`,
  d: `M3 5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm6 0H5v14h4zm4 0a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2zm6 0h-4v14h4z`,
} satisfies IconData
export const Unavailable = {
  viewBox: `0 0 24 24`,
  d: `M12 20a8 8 0 0 1-8-8H2c0 5.523 4.477 10 10 10zm0-16a8 8 0 0 1 8 8h2c0-5.523-4.477-10-10-10zm-8 8a7.97 7.97 0 0 1 2.343-5.657L4.93 4.93A9.97 9.97 0 0 0 2 12zm2.343-5.657A7.97 7.97 0 0 1 12 4V2a9.97 9.97 0 0 0-7.071 2.929zm-1.414 0l12.728 12.728l1.414-1.414L6.343 4.929zM20 12a7.97 7.97 0 0 1-2.343 5.657l1.414 1.414A9.97 9.97 0 0 0 22 12zm-2.343 5.657A7.97 7.97 0 0 1 12 20v2a9.97 9.97 0 0 0 7.071-2.929z`,
} satisfies IconData
export const UpSetPlot = icon(
  `<g fill="currentColor"><rect x="3" y="3" width="3" height="8" rx="0.5"/><rect x="8" y="6" width="3" height="5" rx="0.5" opacity="0.7"/><rect x="13" y="2" width="3" height="9" rx="0.5" opacity="0.5"/><rect x="18" y="8" width="3" height="3" rx="0.5" opacity="0.35"/><circle cx="4.5" cy="15" r="1.4"/><circle cx="9.5" cy="15" r="1.4" opacity="0.35"/><circle cx="14.5" cy="15" r="1.4"/><circle cx="19.5" cy="15" r="1.4" opacity="0.35"/><circle cx="4.5" cy="19.5" r="1.4" opacity="0.35"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="14.5" cy="19.5" r="1.4"/><circle cx="19.5" cy="19.5" r="1.4"/></g><path d="M4.5 15h10m-5 4.5h10" stroke="currentColor" stroke-width="1.2"/>`,
)
export const VectorFieldPlot = icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l4-4m-3 0h3v3M3 10l4-1m-2-2l2 2l-1 2m5 8l1-5m-2 2l2-2l2 2m0-8l4-4m-1 4h1V6m-6 4l2-4m-3 1l3-1l1 3m3 8l3-2m-1-1l1 1v2"/></g>`,
)
export const VennDiagram = icon(
  `<circle cx="9" cy="10" r="6.5" fill="currentColor" opacity="0.35"/><circle cx="15" cy="10" r="6.5" fill="currentColor" opacity="0.35"/><circle cx="12" cy="15" r="6.5" fill="currentColor" opacity="0.35"/><path d="M12 5c2 1.3 3.5 3 3.5 5s-1.5 3.7-3.5 5c-2-1.3-3.5-3-3.5-5S10 6.3 12 5" fill="currentColor" opacity="0.65"/>`,
)
export const ViolinPlot = icon(
  `<path d="M7.5 2.5C5.2 5.2 5 8.1 6.2 12c-1.2 3.9-1 6.8 1.3 9.5c2.3-2.7 2.5-5.6 1.3-9.5c1.2-3.9 1-6.8-1.3-9.5m9 2c-2.5 2.1-3 4.8-1.5 7.5c-1.5 2.7-1 5.4 1.5 7.5c2.5-2.1 3-4.8 1.5-7.5c1.5-2.7 1-5.4-1.5-7.5" fill="currentColor" opacity="0.8"/><path d="M4 12h7m2 0h7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
)
export const VolcanoPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/><g fill="currentColor"><circle cx="6" cy="7" r="1.3"/><circle cx="8" cy="10" r="1.2"/><circle cx="10" cy="15" r="1.1" opacity="0.6"/><circle cx="12" cy="18" r="1.1" opacity="0.45"/><circle cx="14" cy="15" r="1.1" opacity="0.6"/><circle cx="16" cy="10" r="1.2"/><circle cx="18" cy="6" r="1.3"/><circle cx="20" cy="9" r="1.2"/></g><path d="M4 11h18" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1" opacity="0.35"/>`,
)
export const WaffleChart = icon(
  `<g fill="currentColor"><rect x="2" y="2" width="4" height="4" rx="0.6"/><rect x="7.3" y="2" width="4" height="4" rx="0.6"/><rect x="12.7" y="2" width="4" height="4" rx="0.6"/><rect x="18" y="2" width="4" height="4" rx="0.6" opacity="0.7"/><rect x="2" y="7.3" width="4" height="4" rx="0.6"/><rect x="7.3" y="7.3" width="4" height="4" rx="0.6"/><rect x="12.7" y="7.3" width="4" height="4" rx="0.6" opacity="0.7"/><rect x="18" y="7.3" width="4" height="4" rx="0.6" opacity="0.45"/><rect x="2" y="12.7" width="4" height="4" rx="0.6"/><rect x="7.3" y="12.7" width="4" height="4" rx="0.6" opacity="0.7"/><rect x="12.7" y="12.7" width="4" height="4" rx="0.6" opacity="0.45"/><rect x="18" y="12.7" width="4" height="4" rx="0.6" opacity="0.25"/><rect x="2" y="18" width="4" height="4" rx="0.6" opacity="0.7"/><rect x="7.3" y="18" width="4" height="4" rx="0.6" opacity="0.45"/><rect x="12.7" y="18" width="4" height="4" rx="0.6" opacity="0.25"/><rect x="18" y="18" width="4" height="4" rx="0.6" opacity="0.15"/></g>`,
)
export const WaterfallPlot = icon(
  `<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><g fill="currentColor"><rect x="5" y="7" width="3" height="11" rx="0.4"/><rect x="10" y="10" width="3" height="5" rx="0.4" opacity="0.65"/><rect x="15" y="6" width="3" height="4" rx="0.4" opacity="0.8"/><rect x="19" y="6" width="2" height="12" rx="0.4" opacity="0.45"/></g><path d="M8 7h2m3 3h2m3-4h1" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1 1"/>`,
)
export const WindRosePlot = icon(
  `<g fill="currentColor" transform="translate(12 12)"><path d="M0 0L-2-9L2-9z"/><path d="M0 0L-2-6L2-6z" transform="rotate(45)" opacity="0.75"/><path d="M0 0L-2-8L2-8z" transform="rotate(90)" opacity="0.55"/><path d="M0 0L-2-5L2-5z" transform="rotate(135)" opacity="0.8"/><path d="M0 0L-2-7L2-7z" transform="rotate(180)" opacity="0.45"/><path d="M0 0L-2-4L2-4z" transform="rotate(225)" opacity="0.7"/><path d="M0 0L-2-6L2-6z" transform="rotate(270)" opacity="0.5"/><path d="M0 0L-2-5L2-5z" transform="rotate(315)" opacity="0.65"/></g><circle cx="12" cy="12" r="2" fill="currentColor"/>`,
)
