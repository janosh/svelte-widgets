// Combining diacritical marks (accents, umlauts, cedillas) that plain-letter queries ignore.
// Narrower than \p{M}, which also covers marks that change the letter itself, like Japanese
// dakuten (か vs が) or Indic vowel signs.
export const DIACRITIC = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/u
export const DIACRITICS = new RegExp(DIACRITIC.source, `gu`)
