// Share exact string identity across menus, loaded pages, and persisted recent actions.
export function validate_cmd_actions(
  actions: readonly { id?: unknown; label: string }[],
  ids = new Set<string>(),
  reserved_ids?: ReadonlySet<string>,
): Set<string> {
  for (const { id, label } of actions) {
    if (typeof id !== `string` || !id.trim()) {
      throw new Error(
        `Command action "${label}" requires a non-empty string id, got ${typeof id} ${JSON.stringify(String(id))}`,
      )
    }
    if (ids.has(id) || reserved_ids?.has(id))
      throw new Error(`Duplicate command action id: ${id}`)
    ids.add(id)
  }
  return ids
}
