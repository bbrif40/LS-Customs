/**
 * useSmsNotification — client-side wrapper for invoking the dispatch-notification
 * edge function to send SMS notifications via TextBee (or Twilio if configured).
 *
 * This hook is used to send immediate SMS confirmations after:
 *  - Vehicle booking confirmation
 *  - Service booking confirmation
 *  - Payment retry link generation (Tier C)
 *
 * Usage:
 *   const { sendSms, loading, error } = useSmsNotification()
 *   await sendSms({
 *     userId: user.id,
 *     type: 'booking_confirmed',
 *     title: 'Booking confirmed',
 *     body: 'Your rental is confirmed. Booking ref: VS-ABC123',
 *   })
 *
 * The edge function handles the actual SMS delivery via TextBee/Twilio.
 */
import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface SmsNotificationParams {
  userId: string
  type: string
  title: string
  body: string
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
      // Insert a notification row; the trigger + dispatch-notification
      // edge function will pick it up and send the SMS via TextBee/Twilio.
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          channels: ['sms'],
          is_read: false,
        })

      if (insertError) {
        throw insertError
      }

      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send SMS notification'
      setError(msg)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return { sendSms, loading, error }
}
