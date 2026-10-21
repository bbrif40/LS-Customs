/** Per-user, per-tab recovery. Never store card data, provider secrets or ID uploads. */
const prefix = 'ls-customs:draft:'
export function readBookingDraft<T>(owner: string | undefined, kind: string): T | null {
  if (!owner) return null
  try {
    const saved = JSON.parse(sessionStorage.getItem(`${prefix}${owner}:${kind}`) ?? 'null')
    if (saved?.version !== 1 || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > 86400000 || !saved.data || typeof saved.data !== 'object') return null
    return saved.data as T
  } catch { return null }
}
export function saveBookingDraft(owner: string | undefined, kind: string, data: unknown) {
  if (!owner) return
  try { sessionStorage.setItem(`${prefix}${owner}:${kind}`, JSON.stringify({ version: 1, savedAt: Date.now(), data })) } catch { /* Storage can be unavailable; booking remains usable. */ }
}
export function clearBookingDrafts(owner: string | undefined) {
  if (!owner) return
  try { Object.keys(sessionStorage).filter(key => key.startsWith(`${prefix}${owner}:`)).forEach(key => sessionStorage.removeItem(key)) } catch { /* No persisted draft to clear. */ }
}

export function clearBookingDraft(owner: string | undefined, kind: string) {
  if (!owner) return
  try { sessionStorage.removeItem(`${prefix}${owner}:${kind}`) } catch { /* Storage can be unavailable. */ }
}
