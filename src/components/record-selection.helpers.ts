export function pageSelectionState(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
): { allSelected: boolean; partiallySelected: boolean } {
  const selectedCount = pageIds.filter((id) => selected.has(id)).length;
  return {
    allSelected: pageIds.length > 0 && selectedCount === pageIds.length,
    partiallySelected: selectedCount > 0 && selectedCount < pageIds.length,
  };
}

export function updatePageSelection(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
  checked: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const id of pageIds) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}
