import { supabase } from '../supabaseClient'

export type AuditActionType =
  | 'view'
  | 'status_change'
  | 'assign'
  | 'update'
  | 'create'
  | 'delete'

export type AuditRecordType =
  | 'service_booking'
  | 'vehicle_booking'
  | 'ticket'
  | 'vehicle'
  | 'mechanic'
  | 'user'
  | 'service'
  | 'payment'
  | 'system'

export interface AdminAuditEntry {
  id?: string
  admin_id?: string
  admin_name: string
  admin_email: string
  action_type: AuditActionType
  record_type: AuditRecordType | string
  record_id: string
  record_title?: string
  details?: Record<string, unknown>
  created_at?: string
}

// 60-second debounce cache for views to avoid log spam on component re-renders
const viewThrottleCache = new Map<string, number>()
const VIEW_THROTTLE_MS = 60 * 1000

/**
 * Log an audit entry directly to `admin_audit_logs`.
 * Non-blocking, fails silently with console warning to prevent UI interruption.
 */
export async function logAdminAudit(
  entry: Omit<AdminAuditEntry, 'id' | 'created_at'>
): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      return
    }

    const adminId = session.user.id
    const adminEmail = session.user.email || ''
    const adminName =
      (session.user.user_metadata?.full_name as string) ||
      (session.user.user_metadata?.name as string) ||
      adminEmail.split('@')[0] ||
      'Admin'

    const payload = {
      admin_id: adminId,
      admin_name: entry.admin_name || adminName,
      admin_email: entry.admin_email || adminEmail,
      action_type: entry.action_type,
      record_type: entry.record_type,
      record_id: String(entry.record_id),
      record_title: entry.record_title || null,
      details: entry.details || {},
    }

    const { error } = await supabase.from('admin_audit_logs').insert(payload)
    if (error) {
      console.warn('[auditLogger] Failed to write audit log:', error.message)
    }
  } catch (err) {
    console.warn('[auditLogger] Unexpected error:', err)
  }
}

/**
 * Track when an admin checks/views a specific record (booking, customer logbook, ticket).
 * Throttled to 1 view event per record every 60 seconds.
 */
export async function logRecordView(params: {
  recordType: AuditRecordType | string
  recordId: string
  recordTitle?: string
  details?: Record<string, unknown>
}): Promise<void> {
  const cacheKey = `${params.recordType}:${params.recordId}`
  const lastLogged = viewThrottleCache.get(cacheKey) || 0
  const now = Date.now()

  if (now - lastLogged < VIEW_THROTTLE_MS) {
    return // Skip duplicate view within throttle window
  }

  viewThrottleCache.set(cacheKey, now)

  await logAdminAudit({
    admin_name: '',
    admin_email: '',
    action_type: 'view',
    record_type: params.recordType,
    record_id: params.recordId,
    record_title: params.recordTitle,
    details: params.details,
  })
}

/**
 * Track an active admin action (e.g. status change, assignment, manual override, refund, deletion).
 */
export async function logRecordAction(params: {
  actionType: AuditActionType
  recordType: AuditRecordType | string
  recordId: string
  recordTitle?: string
  details?: Record<string, unknown>
}): Promise<void> {
  await logAdminAudit({
    admin_name: '',
    admin_email: '',
    action_type: params.actionType,
    record_type: params.recordType,
    record_id: params.recordId,
    record_title: params.recordTitle,
    details: params.details,
  })
}
