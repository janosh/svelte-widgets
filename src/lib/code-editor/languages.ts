// Filename-driven defaults used by CodeEditor keyboard commands. Backends remain the
// source of truth for grammar detection and the language label.

import { SvelteMap, SvelteSet } from 'svelte/reactivity'

const COMMENT_TOKEN_GROUPS: readonly (readonly [string, string])[] = [
  [
    `#`,
    `bash cif cmake contcar csh dockerfile env fish gql graphql jl lammpstrj mk nix pl
     poscar ps1 py pyi pyw r rb sbatch sh slurm toml vasp yaml yml zsh`,
  ],
  [
    `//`,
    `c cc cjs cpp cs cts cu cxx go h hh hpp hxx java js jsx kt kts mjs mts php proto
     rs scss svelte swift ts tsx zig`,
  ],
  [`;`, `cfg clj conf el ini lisp scm`],
  [`%`, `bib m sty tex`],
  [`--`, `hs lua sql`],
  [`::`, `bat cmd`],
  [`!`, `f f90`],
  [`"`, `vim`],
]

const COMMENT_TOKEN_BASENAMES = `.bash_profile .bashrc .dockerignore .env .gitattributes
  .gitignore .npmignore .profile .zshrc cmakelists.txt containerfile contcar dockerfile
  gnumakefile incar kpoints makefile outcar poscar xdatcar`

const words = (list: string) => list.trim().split(/\s+/)

const token_by_extension = new SvelteMap<string, string>(
  COMMENT_TOKEN_GROUPS.flatMap(([token, extensions]) =>
    words(extensions).map((extension): [string, string] => [extension, token]),
  ),
)
const hash_comment_basenames = new SvelteSet(words(COMMENT_TOKEN_BASENAMES))

export const line_comment_token = (filename: string): string | null => {
  const basename = filename.toLowerCase().split(/[\\/]/u).at(-1) ?? ``
  const segments = basename.split(`.`)
  const stem = basename.startsWith(`.`) ? `.${segments[1] ?? ``}` : segments[0]
  if (hash_comment_basenames.has(basename) || hash_comment_basenames.has(stem)) return `#`
  return token_by_extension.get(segments.at(-1) ?? ``) ?? null
}

export const indent_unit = (tab_size: number, insert_spaces: boolean): string => {
  if (!insert_spaces) return `\t`
  const width = Number.isFinite(tab_size) ? Math.floor(tab_size) : 2
  return ` `.repeat(Math.min(Math.max(width, 1), 16))
}
