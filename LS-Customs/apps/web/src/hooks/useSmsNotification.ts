/**
 * useSmsNotification — client-side wrapper for invoking the dispatch-notification
 * edge function to send SMS notifications via Twilio, TextBee, or Semaphore.
 *
 * This hook is used to send immediate SMS confirmations after:
 *  - Vehicle booking confirmation
 *  - Service booking confirmation
 *  - Mechanic assignment
 *  - Payment retry link generation
 *
 * Usage:
 *   const { sendSms, loading, error } = useSmsNotification()
 *   await sendSms({
 *     userId: user.id,
 *     phone: '+639171234567', // optional direct override
 *     type: 'booking_confirmed',
 *     title: 'Booking confirmed',
 *     body: 'Your rental is confirmed. Booking ref: VS-ABC123',
 *   })
 */
import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'
import { requireFunctionData } from '../utils/functionResult'

export interface SmsNotificationParams {
  userId: string
  type: string
  title: string
  body: string
  phone?: string | null
  metadata?: Record<string, unknown>
}

interface UseSmsNotificationResult {
  sendSms: (params: SmsNotificationParams) => Promise<boolean>
  loading: boolean
  error: string | null
}

export function useSmsNotification(): UseSmsNotificationResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendSms = useCallback(async (params: SmsNotificationParams): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      if (typeof params.metadata?.booking_id !== 'string') throw new Error('A booking reference is required for notification dispatch.')
      const { data: notif, error: lookupError } = await supabase.from('notifications').select('id')
        .eq('user_id', params.userId).contains('metadata', { booking_id: params.metadata?.booking_id })
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (lookupError || !notif) throw new Error('Booking notification is not available yet.')
      const dispatch = requireFunctionData<{ dispatched: boolean; simulated?: boolean; channels: string[] }>(
        await supabase.functions.invoke('dispatch-notification', { body: { notification_id: notif.id } }),
        'SMS dispatch failed.',
      )
      if (!dispatch.dispatched || dispatch.simulated || !dispatch.channels.some(channel => channel.startsWith('sms_')))
        throw new Error('SMS was not accepted by a provider.')

      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send SMS notification'
      console.warn('[useSmsNotification] exception:', msg)
      setError(msg)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return { sendSms, loading, error }
}
