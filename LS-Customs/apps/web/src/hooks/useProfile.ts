/**
 * useProfile — manages the signed-in customer's profile + default address.
 *
 * Loads `profiles` (full_name, phone) and the customer's default `addresses`
 * row (line1, city) so the Profile screen can be a real two-way binding to
 * the database instead of a static form.
 *
 * Address is stored in the `addresses` table. Lat/lng are required columns
 * but we don't have a geocoder here, so they default to 0. Replace with a
 * real geocoding step when that's available.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { Profile as DbProfile } from '@ls-customs/shared-types'

interface DefaultAddress {
  id: string
  line1: string
  city: string
  label: string | null
}

interface UseProfileResult {
  profile: DbProfile | null
  defaultAddress: DefaultAddress | null
  loading: boolean
  saving: boolean
  error: string | null
  refetch: () => Promise<void>
  updateProfile: (updates: { full_name?: string; phone?: string | null }) => Promise<void>
  upsertDefaultAddress: (input: { line1: string; city: string; label?: string }) => Promise<void>
}

export function useProfile(userId: string | undefined): UseProfileResult {
  const [profile, setProfile] = useState<DbProfile | null>(null)
  const [defaultAddress, setDefaultAddress] = useState<DefaultAddress | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setDefaultAddress(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, avatar_url, role, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle()

      if (profileError) throw profileError
      setProfile(profileRow as DbProfile | null)

      const { data: addressRow, error: addressError } = await supabase
        .from('addresses')
        .select('id, line1, city, label')
        .eq('customer_id', userId)
        .eq('is_default', true)
        .maybeSingle()

      if (addressError) throw addressError
      setDefaultAddress(addressRow as DefaultAddress | null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const updateProfile = useCallback(
    async (updates: { full_name?: string; phone?: string | null }) => {
      if (!userId) throw new Error('Not signed in')
      setSaving(true)
      setError(null)
      try {
        const { data, error: updateError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select('id, full_name, phone, avatar_url, role, created_at, updated_at')
          .single()
        if (updateError) throw updateError
        setProfile(data as DbProfile)
      } finally {
        setSaving(false)
      }
    },
    [userId],
  )

  const upsertDefaultAddress = useCallback(
    async (input: { line1: string; city: string; label?: string }) => {
      if (!userId) throw new Error('Not signed in')
      setSaving(true)
      setError(null)
      try {
        // If a default address already exists, update it; otherwise insert a new one.
        if (defaultAddress?.id) {
          const { data, error: updateError } = await supabase
            .from('addresses')
            .update({
              line1: input.line1,
              city: input.city,
              label: input.label ?? defaultAddress.label ?? 'Home',
            })
            .eq('id', defaultAddress.id)
            .select('id, line1, city, label')
            .single()
          if (updateError) throw updateError
          setDefaultAddress(data as DefaultAddress)
        } else {
          // Unset any other default the customer may have so there's only one.
          await supabase
            .from('addresses')
            .update({ is_default: false })
            .eq('customer_id', userId)
            .eq('is_default', true)

          const { data, error: insertError } = await supabase
            .from('addresses')
            .insert({
              customer_id: userId,
              line1: input.line1,
              city: input.city,
              lat: 0,
              lng: 0,
              is_default: true,
              label: input.label ?? 'Home',
            })
            .select('id, line1, city, label')
            .single()
          if (insertError) throw insertError
          setDefaultAddress(data as DefaultAddress)
        }
      } finally {
        setSaving(false)
      }
    },
    [userId, defaultAddress],
  )

  return {
    profile,
    defaultAddress,
    loading,
    saving,
    error,
    refetch: fetchAll,
    updateProfile,
    upsertDefaultAddress,
  }
}
