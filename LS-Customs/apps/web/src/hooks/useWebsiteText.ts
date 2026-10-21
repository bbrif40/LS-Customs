import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../supabaseClient'
import { resolveWebsiteText, websiteTextLookup, type TextVariables, type WebsiteTextRow } from '../utils/websiteText'
export type { WebsiteTextRow } from '../utils/websiteText'
interface CatalogState { rows: WebsiteTextRow[]; loading: boolean; error: string }
let state: CatalogState = { rows: [], loading: true, error: '' }
let lookup = websiteTextLookup([])
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const getSnapshot = () => state
function publish(next: CatalogState) {
  state = next
  lookup = websiteTextLookup(next.rows)
  listeners.forEach(listener => listener())
}
let pending: Promise<void> | null = null
let channelId = 0
async function fetchCatalog() {
  const rows: WebsiteTextRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('website_text').select('key,section,label,default_text,value,revision,updated_at').order('key').range(offset, offset + 999)
    if (error) throw new Error('Website text could not be loaded. Please check your connection and retry.')
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  publish({ rows, loading: false, error: '' })
}
export function refreshWebsiteText(): Promise<void> {
  if (pending) return pending
  pending = fetchCatalog().catch(error => {
    publish({ ...state, loading: false, error: error instanceof Error ? error.message : 'Website text could not be loaded.' })
    throw error
  }).finally(() => { pending = null })
  return pending
}
/** One subscription for the whole application, including public pages. */
export function useWebsiteTextSync() {
  useEffect(() => {
    let active = true
    const refresh = () => { if (active && document.visibilityState !== 'hidden') void refreshWebsiteText().catch(() => {}) }
    refresh()
    const channel = supabase.channel(`customer-website-text-${++channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'website_text' }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh() })
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); void supabase.removeChannel(channel) }
  }, [])
}
export function useWebsiteTextCatalog() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...snapshot, refresh: refreshWebsiteText }
}
export function useWebsiteText(section: string, usePublishedDefault = false) {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  // Stable identity keeps existing memo/effect dependencies safe. Read the latest store.
  return useCallback((original: string, variables?: TextVariables, currentFallback?: string) => resolveWebsiteText(lookup, section, original, variables, currentFallback, usePublishedDefault), [section, usePublishedDefault])
}
