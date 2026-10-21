import { supabase } from '../supabaseClient'
import { requireFunctionData } from './functionResult'
export async function verifyServiceLocation(lat: number, lng: number): Promise<string> {
  const fallback = 'Your location could not be checked. Please retry; your booking draft is saved.'
  const result = await supabase.functions.invoke('verify-service-location', { body: { lat, lng } })
  if (result.error?.context instanceof Response) {
    const payload = await result.error.context.clone().json().catch(() => null)
    throw new Error(payload?.error?.message || fallback)
  }
  return requireFunctionData<{ id: string }>(result, fallback).id
}
