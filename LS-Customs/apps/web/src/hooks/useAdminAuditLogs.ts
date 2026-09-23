import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import type { AdminAuditEntry, AuditActionType } from '../services/auditLogger'

export interface AuditLogFilters {
  search: string
  adminEmail: string
  actionType: AuditActionType | 'all'
  recordType: string
  timeRange: 'today' | '7days' | '30days' | 'all'
}

export function useAdminAuditLogs() {
  const [logs, setLogs] = useState<AdminAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    adminEmail: 'all',
    actionType: 'all',
    recordType: 'all',
    timeRange: 'all',
  })

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchErr } = await supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (fetchErr) {
        // If table does not exist or permission denied, handle gracefully
        console.warn('[useAdminAuditLogs] fetch error:', fetchErr.message)
        setError(fetchErr.message)
        setLogs([])
      } else {
        setLogs((data as AdminAuditEntry[]) || [])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()

    // Subscribe to realtime audit log inserts
    const channel = supabase
      .channel('admin-audit-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_audit_logs' },
        (payload) => {
          const newEntry = payload.new as AdminAuditEntry
          setLogs((prev) => [newEntry, ...prev.filter((item) => item.id !== newEntry.id)])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchLogs])

  // Extract unique admin list for filter dropdown
  const uniqueAdmins = useMemo(() => {
    const map = new Map<string, string>()
    logs.forEach((log) => {
      if (log.admin_email) {
        map.set(log.admin_email, log.admin_name || log.admin_email)
      }
    })
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }))
  }, [logs])

  // Filter logs based on active filter state
  const filteredLogs = useMemo(() => {
    const now = Date.now()

    return logs.filter((log) => {
      // 1. Admin Email filter
      if (filters.adminEmail !== 'all' && log.admin_email !== filters.adminEmail) {
        return false
      }

      // 2. Action Type filter
      if (filters.actionType !== 'all' && log.action_type !== filters.actionType) {
        return false
      }

      // 3. Record Type filter
      if (filters.recordType !== 'all' && log.record_type !== filters.recordType) {
        return false
      }

      // 4. Time Range filter
      if (filters.timeRange !== 'all' && log.created_at) {
        const logTime = new Date(log.created_at).getTime()
        const diffMs = now - logTime
        if (filters.timeRange === 'today' && diffMs > 24 * 60 * 60 * 1000) return false
        if (filters.timeRange === '7days' && diffMs > 7 * 24 * 60 * 60 * 1000) return false
        if (filters.timeRange === '30days' && diffMs > 30 * 24 * 60 * 60 * 1000) return false
      }

      // 5. Text Search filter
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase()
        const matchName = log.admin_name?.toLowerCase().includes(q)
        const matchEmail = log.admin_email?.toLowerCase().includes(q)
        const matchTitle = log.record_title?.toLowerCase().includes(q)
        const matchId = log.record_id?.toLowerCase().includes(q)
        const matchAction = log.action_type?.toLowerCase().includes(q)
        const matchRecordType = log.record_type?.toLowerCase().includes(q)
        if (!matchName && !matchEmail && !matchTitle && !matchId && !matchAction && !matchRecordType) {
          return false
        }
      }

      return true
    })
  }, [logs, filters])

  // Key KPI metrics computed from all logs
  const stats = useMemo(() => {
    const totalEntries = logs.length
    const viewCount = logs.filter((l) => l.action_type === 'view').length
    const actionCount = logs.filter((l) => l.action_type !== 'view').length
    const adminSet = new Set(logs.map((l) => l.admin_email).filter(Boolean))

    return {
      totalEntries,
      viewCount,
      actionCount,
      activeAdminsCount: adminSet.size,
    }
  }, [logs])

  return {
    logs: filteredLogs,
    rawLogsCount: logs.length,
    loading,
    error,
    filters,
    setFilters,
    uniqueAdmins,
    stats,
    refetch: fetchLogs,
  }
}
