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
      // 1. Insert notification row into public.notifications
      const { data: notif, error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          channels: ['sms', 'in_app'],
          metadata: {
            ...(params.metadata || {}),
            dispatch_sms: true,
            phone: params.phone,
          },
          is_read: false,
        })
        .select('id')
        .maybeSingle()

      if (insertError) {
        console.warn('[useSmsNotification] notification insert error:', insertError)
      }

      // 2. Invoke dispatch-notification Edge Function
      const { data: dispatchResult, error: dispatchError } = await supabase.functions.invoke(
        'dispatch-notification',
        {
          body: {
            notification_id: notif?.id,
            user_id: params.userId,
            phone: params.phone,
            message: params.body,
            title: params.title,
          },
        },
      )

      if (dispatchError) {
        console.warn('[useSmsNotification] dispatch-notification error:', dispatchError)
      } else {
        console.log('[useSmsNotification] SMS dispatch result:', dispatchResult)
      }

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
