import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

interface PhoneOtpResult {
  verification?: 'sms' | 'profile_phone'
  challengeId?: string
  session?: Session
}

/** The endpoint keeps profile-to-auth account resolution off the public client. */
export async function phoneOtpRequest(body: Record<string, unknown>): Promise<PhoneOtpResult> {
  const { data, error } = await supabase.functions.invoke('customer-phone-otp', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context instanceof Response) {
      const result = await context.json().catch(() => null)
      if (typeof result?.error?.message === 'string') throw new Error(result.error.message)
    }
    throw new Error('SMS sign-in is unavailable. Please try again or sign in with email or Google.')
  }
  if (data?.error) throw new Error(data.error.message || 'Unable to complete SMS sign-in.')
  if (!data?.data) throw new Error('Unable to complete SMS sign-in.')
  return data.data as PhoneOtpResult
}
