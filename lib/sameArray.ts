/**
 * Fast structural equality for "list of plain rows" — what useDashboardData
 * gets back every 60s poll: an array of RoomView/SheetRow objects.
 *
 * We compare row-by-row at one level deep:
 *   1. same length
 *   2. for each index, every own enumerable key has the same value
 *
 * That covers a no-change refresh, which is the case we care about: an
 * ETag/304 path hands the client the same JSON, so React.useState's
 * functional updater returns `prev` and React skips the re-render. When
 * data DOES change (a status flip, new task), some row's key differs and
 * we hand back the new array — no false negatives.
 *
 * Why not deepEqual / JSON.stringify?
 *   - stringify on a 1k-task array is O(n) with a big constant; this is
 *     also O(n) but with cheap key walks (and bails on the first diff)
 *   - we don't have nested objects to worry about in RoomView/SheetRow
 *     (Date is parsed lazily by callers; rows are flat strings/numbers).
 *
 * Sets used internally by the dashboard hook (pending optimistic patches)
 * are NOT compared via this — those are checked by identity at the call
 * site.
 */
export function sameRowArray<T extends Record<string, unknown>>(
  a: T[],
  b: T[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (ra === rb) continue;
    if (!ra || !rb) return false;
    const ka = Object.keys(ra);
    const kb = Object.keys(rb);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (ra[k] !== rb[k]) return false;
    }
  }
  return true;
}
