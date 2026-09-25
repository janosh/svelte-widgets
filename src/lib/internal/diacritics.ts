// Combining diacritical marks (accents, umlauts, cedillas) that plain-letter queries ignore.
// Narrower than \p{M}, which also covers marks that change the letter itself, like Japanese
// dakuten (か vs が) or Indic vowel signs.
export const DIACRITIC = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/u
export const DIACRITICS = new RegExp(DIACRITIC.source, `gu`)
const COMBINING_MARK = /\p{M}/u
// True when a hit ending at `after` would stop before a mark that belongs to its last letter
// (か vs が, क vs क़), unless the query's next char is that mark.
export const splits_letter = (text: string, after: number, next_query_char?: string) =>
  COMBINING_MARK.test(text[after] ?? ``) && text[after] !== next_query_char
