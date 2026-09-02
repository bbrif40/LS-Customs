import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { CustomerNotification } from '../types'

// ponytail: each consumer needs a unique channel name — Supabase dedupes
// realtime channels by name, so two `useCustomerNotifications(userId)` calls
// would share one channel and throw "cannot add postgres_changes callbacks
// after subscribe()" the second time around. Caller passes `channelKey` to
// disambiguate. Upgrade path: one shared context/subscription feeding all
// consumers in the tree.
export function useCustomerNotifications(userId: string | undefined, channelKey: string = 'main') {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id, type, title, body, metadata, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25)
    if (queryError) setError(queryError.message)
    else setNotifications((data ?? []) as CustomerNotification[])
    setLoading(false)
  }, [userId])

  useEffect(() => { void fetchNotifications() }, [fetchNotifications])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`customer-notifications:${channelKey}:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifications((current) => [payload.new as CustomerNotification, ...current].slice(0, 25))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, channelKey])

  const markAsRead = useCallback(async (id: string) => {
    const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    if (updateError) throw updateError
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item))
  }, [])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
    if (updateError) throw updateError
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
  }, [userId])

  return { notifications, unreadCount: notifications.filter((item) => !item.is_read).length, loading, error, refetch: fetchNotifications, markAsRead, markAllAsRead }
}