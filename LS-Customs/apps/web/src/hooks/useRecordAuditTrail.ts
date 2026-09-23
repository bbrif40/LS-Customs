import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { logRecordView, type AdminAuditEntry } from '../services/auditLogger'

interface UseRecordAuditTrailProps {
  recordType: string
  recordId: string
  recordTitle?: string
  autoLogView?: boolean
}

export function useRecordAuditTrail({
  recordType,
  recordId,
  recordTitle,
  autoLogView = true,
}: UseRecordAuditTrailProps) {
  const [auditTrail, setAuditTrail] = useState<AdminAuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTrail = useCallback(async () => {
    if (!recordId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('*')
        .eq('record_type', recordType)
        .eq('record_id', String(recordId))
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.warn('[useRecordAuditTrail] error fetching trail:', error.message)
      } else {
        setAuditTrail((data as AdminAuditEntry[]) || [])
      }
    } catch (err) {
      console.warn('[useRecordAuditTrail] unexpected error:', err)
    } finally {
      setLoading(false)
    }
  }, [recordType, recordId])

  useEffect(() => {
    if (!recordId) return

    // 1. Auto-log the view event if enabled (debounced to avoid duplicate logs)
    if (autoLogView) {
      logRecordView({
        recordType,
        recordId,
        recordTitle,
      }).then(() => {
        // Refetch after logging view so the admin sees their own view event in the trail
        fetchTrail()
      })
    } else {
      fetchTrail()
    }

    // 2. Realtime subscription for updates to this record's audit trail
    const channel = supabase
      .channel(`audit-trail-${recordType}-${recordId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_audit_logs',
          filter: `record_id=eq.${recordId}`,
        },
        (payload) => {
          const newEntry = payload.new as AdminAuditEntry
          if (newEntry.record_type === recordType) {
            setAuditTrail((prev) => [newEntry, ...prev.filter((item) => item.id !== newEntry.id)])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [recordType, recordId, recordTitle, autoLogView, fetchTrail])

  return {
    auditTrail,
    loading,
    refetch: fetchTrail,
  }
}
