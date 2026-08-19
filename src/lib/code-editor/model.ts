import type {
  EditorModel,
  EditorModelInit,
  EditorSelection,
  EditorTransaction,
  EditorUpdate,
  EditorUpdateSource,
  TextEdit,
  TransactOptions,
} from './types'

const BOM = `\uFEFF`
const CHUNK_SIZE = 32 * 1024
const DEFAULT_HISTORY_LIMIT = 8 * 1024 * 1024
const GROUP_INTERVAL_MS = 750
const editor_text = (raw: string): string =>
  (raw.startsWith(BOM) ? raw.slice(BOM.length) : raw).replaceAll(/\r\n?/g, `\n`)
let node_sequence = 0
const priority_for = (sequence: number): number => {
  let mixed = sequence + 0x9e3779b9
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad)
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97)
  return (mixed ^ (mixed >>> 15)) >>> 0
}
const text_breaks = (text: string): number => text.match(/\n/g)?.length ?? 0
class RopeNode {
  readonly priority = priority_for(++node_sequence)
  left: RopeNode | null = null
  right: RopeNode | null = null
  length: number
  readonly own_breaks: number
  breaks: number
  constructor(readonly text: string) {
    this.length = text.length
    this.own_breaks = text_breaks(text)
    this.breaks = this.own_breaks
  }
}
const rope_length = (node: RopeNode | null): number => node?.length ?? 0
const rope_breaks = (node: RopeNode | null): number => node?.breaks ?? 0
const update_node = (node: RopeNode): RopeNode => {
  node.length = rope_length(node.left) + node.text.length + rope_length(node.right)
  node.breaks = rope_breaks(node.left) + node.own_breaks + rope_breaks(node.right)
  return node
}
const merge = (left: RopeNode | null, right: RopeNode | null): RopeNode | null => {
  if (!left) return right
  if (!right) return left
  if (left.priority <= right.priority) {
    left.right = merge(left.right, right)
    return update_node(left)
  }
  right.left = merge(left, right.left)
  return update_node(right)
}
const split = (
  node: RopeNode | null,
  offset: number,
): [RopeNode | null, RopeNode | null] => {
  if (!node) return [null, null]
  const left_length = rope_length(node.left)
  const text_end = left_length + node.text.length
  if (offset <= left_length) {
    const [left, right] = split(node.left, offset)
    node.left = right
    return [left, update_node(node)]
  }
  if (offset >= text_end) {
    const [left, right] = split(node.right, offset - text_end)
    node.right = left
    return [update_node(node), right]
  }
  const [left_tree, right_tree] = [node.left, node.right]
  const within = offset - left_length
  const left_piece = new RopeNode(node.text.slice(0, within))
  const right_piece = new RopeNode(node.text.slice(within))
  return [merge(left_tree, left_piece), merge(right_piece, right_tree)]
}
const rope_from = (text: string): RopeNode | null => {
  let root: RopeNode | null = null
  for (let offset = 0; offset < text.length; offset += CHUNK_SIZE)
    root = merge(root, new RopeNode(text.slice(offset, offset + CHUNK_SIZE)))
  return root
}
const collect = (
  node: RopeNode | null,
  from: number,
  to: number,
  base: number,
  parts: string[],
): void => {
  if (!node || to <= base || from >= base + node.length) return
  const text_start = base + rope_length(node.left)
  collect(node.left, from, to, base, parts)
  const local_from = Math.max(0, from - text_start)
  const local_to = Math.min(node.text.length, to - text_start)
  if (local_to > local_from) parts.push(node.text.slice(local_from, local_to))
  collect(node.right, from, to, text_start + node.text.length, parts)
}
const breaks_before = (root: RopeNode | null, offset: number): number => {
  let node = root
  let remaining = offset
  let count = 0
  while (node) {
    const left_length = rope_length(node.left)
    if (remaining <= left_length) {
      node = node.left
      continue
    }
    count += rope_breaks(node.left)
    remaining -= left_length
    if (remaining <= node.text.length)
      return count + text_breaks(node.text.slice(0, remaining))
    count += node.own_breaks
    remaining -= node.text.length
    node = node.right
  }
  return count
}
const break_offset = (root: RopeNode | null, target: number): number => {
  let node = root
  let base = 0
  let remaining = target
  while (node) {
    const left_count = rope_breaks(node.left)
    const left_length = rope_length(node.left)
    if (remaining < left_count) {
      node = node.left
      continue
    }
    remaining -= left_count
    base += left_length
    if (remaining < node.own_breaks) {
      let offset = -1
      for (let count = 0; count <= remaining; count++)
        offset = node.text.indexOf(`\n`, offset + 1)
      return base + offset
    }
    remaining -= node.own_breaks
    base += node.text.length
    node = node.right
  }
  throw new Error(`No newline ${target} in rope with ${rope_breaks(root)} newlines`)
}
const slice_rope = (root: RopeNode | null, from: number, to: number): string => {
  const parts: string[] = []
  collect(root, from, to, 0, parts)
  return parts.join(``)
}
const pop_edge = (node: RopeNode, side: `left` | `right`): [RopeNode | null, string] => {
  const child = node[side]
  if (!child) return [node[side === `left` ? `right` : `left`], node.text]
  const [rest, text] = pop_edge(child, side)
  node[side] = rest
  return [update_node(node), text]
}
const replace_rope = (
  root: RopeNode | null,
  from: number,
  to: number,
  insert: string,
): RopeNode | null => {
  let [before, tail] = split(root, from)
  let [, after] = split(tail, to - from)
  if (before && insert.length <= CHUNK_SIZE) {
    let boundary: string
    ;[before, boundary] = pop_edge(before, `right`)
    if (boundary.length + insert.length <= CHUNK_SIZE) insert = boundary + insert
    else before = merge(before, new RopeNode(boundary))
  }
  if (after && insert.length <= CHUNK_SIZE) {
    let boundary: string
    ;[after, boundary] = pop_edge(after, `left`)
    if (insert.length + boundary.length <= CHUNK_SIZE) insert += boundary
    else after = merge(new RopeNode(boundary), after)
  }
  return merge(merge(before, rope_from(insert)), after)
}
const line_start = (root: RopeNode | null, line_idx: number): number =>
  line_idx === 0 ? 0 : break_offset(root, line_idx - 1) + 1
interface HistoryRecord {
  forward: readonly TextEdit[]
  inverse: readonly TextEdit[]
  selection_before: EditorSelection
  selection: EditorSelection
  before_state: number
  after_state: number
}
interface HistoryGroup {
  key: string | null
  timestamp: number
  records: HistoryRecord[]
  cost: number
}
const same_selection = (left: EditorSelection, right: EditorSelection): boolean =>
  left.anchor === right.anchor && left.head === right.head
const copy_selection = (selection: EditorSelection): EditorSelection => ({ ...selection })
const merge_typed_records = (
  previous: HistoryRecord,
  next: HistoryRecord,
  key: string,
): boolean => {
  const [left, right, left_inverse, right_inverse] = [
    previous.forward[0],
    next.forward[0],
    previous.inverse[0],
    next.inverse[0],
  ]
  if (
    previous.forward.length !== 1 ||
    next.forward.length !== 1 ||
    !left ||
    !right ||
    !left_inverse ||
    !right_inverse
  )
    return false
  let forward: TextEdit | undefined
  let deleted = ``
  if (
    key === `insert` &&
    left.from === left.to &&
    right.from === right.to &&
    right.from === left.from + left.insert.length
  )
    forward = { ...left, insert: left.insert + right.insert }
  else if (
    key.startsWith(`composition-`) &&
    right.from === left.from &&
    right.to === left.from + left.insert.length
  ) {
    forward = { ...left, insert: right.insert }
    deleted = left_inverse.insert
  } else if (left.insert === `` && right.insert === ``) {
    if (key === `backspace` && right.to === left.from) {
      forward = { from: right.from, to: left.to, insert: `` }
      deleted = right_inverse.insert + left_inverse.insert
    } else if (key === `delete` && right.from === left.from) {
      forward = { from: left.from, to: left.to + right.to - right.from, insert: `` }
      deleted = left_inverse.insert + right_inverse.insert
    }
  }
  if (!forward) return false
  previous.forward = [forward]
  previous.inverse = [
    { from: forward.from, to: forward.from + forward.insert.length, insert: deleted },
  ]
  previous.selection = next.selection
  previous.after_state = next.after_state
  return true
}
export const create_editor_model = (init: EditorModelInit): EditorModel => {
  const had_bom = init.text.startsWith(BOM)
  const eol = init.text.includes(`\r\n`) ? `crlf` : `lf`
  let root = rope_from(editor_text(init.text))
  const history_limit = init.history_limit_chars ?? DEFAULT_HISTORY_LIMIT
  if (!Number.isInteger(history_limit) || history_limit < 0)
    throw new Error(`Invalid history_limit_chars=${history_limit}`)
  let selection: EditorSelection = { anchor: 0, head: 0 }
  let revision = 0
  let next_state = 0
  let state = 0
  let saved_state = 0
  let history_chars = 0
  let history: HistoryGroup[] = []
  let redo_groups: HistoryGroup[] = []
  let listeners: ((update: EditorUpdate) => void)[] = []
  const break_history_group = (): void => {
    const latest = history.at(-1)
    if (latest) latest.key = null
  }
  const validate_offset = (
    value: unknown,
    label: string,
    length = rope_length(root),
  ): number => {
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > length)
      throw new Error(`Invalid ${label}=${String(value)} for length ${length}`)
    return Number(value)
  }
  const validate_selection = (
    next: EditorSelection,
    length = rope_length(root),
  ): EditorSelection => {
    for (const name of [`anchor`, `head`] as const) {
      const value = next?.[name]
      validate_offset(value, `selection ${name}`, length)
    }
    return copy_selection(next)
  }
  const notify = (transaction?: EditorTransaction): void => {
    for (const listener of listeners)
      listener({
        revision,
        selection: copy_selection(selection),
        dirty: state !== saved_state,
        transaction,
      })
  }
  const validate_edits = (edits: readonly TextEdit[]): number => {
    let length = rope_length(root)
    let previous_end = 0
    for (const [edit_idx, { from, to, insert }] of edits.entries()) {
      if (
        typeof insert !== `string` ||
        insert.includes(`\r`) ||
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < previous_end ||
        to < from ||
        to > length
      )
        throw new Error(
          `Invalid edit ${edit_idx}: from=${from}, to=${to}, insert=${JSON.stringify(insert)}, previous_end=${previous_end}, length=${length}`,
        )
      length += insert.length - (to - from)
      previous_end = from + insert.length
    }
    return length
  }
  const apply = (
    edits: readonly TextEdit[],
    next_selection: EditorSelection,
    source: EditorUpdateSource,
    capture_history: boolean,
    target_state?: number,
  ): { transaction: EditorTransaction; record: HistoryRecord; cost: number } => {
    const final_length = validate_edits(edits)
    const valid_selection = validate_selection(next_selection, final_length)
    const selection_before = copy_selection(selection)
    const inverse: TextEdit[] = []
    let undo_delta = 0
    let cost = 0
    for (const { from, to, insert } of edits) {
      if (capture_history) {
        const deleted = slice_rope(root, from, to)
        const next_from = from + undo_delta
        inverse.push({ from: next_from, to: next_from + insert.length, insert: deleted })
        undo_delta += deleted.length - insert.length
        cost += insert.length + deleted.length
      }
      root = replace_rope(root, from, to, insert)
    }
    const base_revision = revision
    revision += 1
    selection = valid_selection
    const before_state = state
    state = target_state ?? ++next_state
    const transaction = Object.freeze({
      base_revision,
      revision,
      edits: Object.freeze(edits.map((edit) => Object.freeze({ ...edit }))),
      selection_before: Object.freeze(selection_before),
      selection: Object.freeze(copy_selection(selection)),
      source,
    })
    const record = {
      forward: transaction.edits,
      inverse,
      selection_before,
      selection: copy_selection(selection),
      before_state,
      after_state: state,
    }
    return { transaction, record, cost }
  }
  const trim_history = (): void => {
    while (history.length > 1 && history_chars > history_limit)
      history_chars -= history.shift()?.cost ?? 0
  }
  const transact = (
    edits: readonly TextEdit[],
    options: TransactOptions = {},
  ): EditorTransaction => {
    if (edits.length === 0)
      throw new Error(`Editor transactions require at least one edit`)
    const add_to_history = options.add_to_history !== false
    const timestamp = options.timestamp ?? performance.now()
    if (add_to_history && !Number.isFinite(timestamp))
      throw new Error(`Invalid history timestamp=${timestamp}`)
    const source = options.source ?? `external`
    const next_selection = options.selection ?? selection
    const { transaction, record, cost } = apply(
      edits,
      next_selection,
      source,
      add_to_history,
    )
    if (add_to_history) {
      const key = options.history_group ?? null
      const previous = history.at(-1)
      const elapsed = timestamp - (previous?.timestamp ?? timestamp)
      if (
        key !== null &&
        previous?.key === key &&
        elapsed >= 0 &&
        (elapsed <= GROUP_INTERVAL_MS || key.startsWith(`composition-`)) &&
        same_selection(
          previous.records.at(-1)?.selection ?? selection,
          record.selection_before,
        )
      ) {
        if (!merge_typed_records(previous.records.at(-1) ?? record, record, key))
          previous.records.push(record)
        previous.timestamp = timestamp
        previous.cost += cost
      } else history.push({ key, timestamp, records: [record], cost })
      history_chars += cost
      redo_groups = []
      trim_history()
    } else {
      history = []
      redo_groups = []
      history_chars = 0
    }
    notify(transaction)
    return transaction
  }
  const replay_group = (group: HistoryGroup, direction: `undo` | `redo`): void => {
    const records = direction === `undo` ? group.records.toReversed() : group.records
    for (const record of records) {
      const edits = direction === `undo` ? record.inverse : record.forward
      const next_selection =
        direction === `undo` ? record.selection_before : record.selection
      const target_state = direction === `undo` ? record.before_state : record.after_state
      const { transaction } = apply(edits, next_selection, direction, false, target_state)
      notify(transaction)
    }
  }
  const model: EditorModel = {
    uri: init.uri,
    get revision() {
      return revision
    },
    get length() {
      return rope_length(root)
    },
    get line_count() {
      return rope_breaks(root) + 1
    },
    get selection() {
      return copy_selection(selection)
    },
    get dirty() {
      return state !== saved_state
    },
    eol,
    had_bom,
    slice: (from = 0, to = rope_length(root)) => {
      validate_offset(from, `slice from`)
      validate_offset(to, `slice to`)
      if (to < from)
        throw new Error(
          `Invalid slice from=${from}, to=${to}, length=${rope_length(root)}`,
        )
      return slice_rope(root, from, to)
    },
    line: (line_idx) => {
      const line_count = rope_breaks(root) + 1
      if (!Number.isInteger(line_idx) || line_idx < 0 || line_idx >= line_count)
        throw new Error(`Invalid line ${line_idx} for ${line_count} lines`)
      const from = line_start(root, line_idx)
      const to =
        line_idx + 1 < line_count ? line_start(root, line_idx + 1) - 1 : rope_length(root)
      return { line_idx, from, to, text: slice_rope(root, from, to) }
    },
    line_at: (offset) => {
      validate_offset(offset, `offset`)
      return model.line(breaks_before(root, offset))
    },
    text: () => slice_rope(root, 0, rope_length(root)),
    disk_text: () => {
      const text = slice_rope(root, 0, rope_length(root))
      return `${had_bom ? BOM : ``}${eol === `crlf` ? text.replaceAll(`\n`, `\r\n`) : text}`
    },
    transact,
    set_selection: (next) => {
      const valid = validate_selection(next)
      if (same_selection(selection, valid)) return
      break_history_group()
      selection = valid
      notify()
    },
    undo: () => {
      const group = history.pop()
      if (!group) return false
      break_history_group()
      history_chars -= group.cost
      replay_group(group, `undo`)
      redo_groups.push(group)
      return true
    },
    redo: () => {
      const group = redo_groups.pop()
      if (!group) return false
      group.key = null
      replay_group(group, `redo`)
      history.push(group)
      history_chars += group.cost
      trim_history()
      return true
    },
    mark_saved: () => {
      break_history_group()
      if (saved_state === state) return
      saved_state = state
      notify()
    },
    subscribe: (listener) => {
      const subscription = (update: EditorUpdate): void => listener(update)
      listeners.push(subscription)
      return () =>
        void (listeners = listeners.filter((candidate) => candidate !== subscription))
    },
  }
  return model
}
