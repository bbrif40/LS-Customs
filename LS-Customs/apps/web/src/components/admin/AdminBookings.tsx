/**
 * AdminBookings — Combined Bookings Overview (read-only with admin status updates).
 * Shows both vehicle_bookings and service_bookings in tabbed views.
 * Admin can update status via existing RLS policy (unrestricted for admins).
 */
import { useEffect, useState } from 'react'
import { Search, Filter, Truck, Wrench, X, Loader2, ChevronLeft, ChevronRight, AlertTriangle, CreditCard } from 'lucide-react'
import {
  useAdminVehicleBookings,
  useAdminServiceBookings,
} from '../../hooks/useAdminData'
import { supabase } from '../../supabaseClient'
import { MapView, type MapPin } from '../common/map'
import { AdminBookingDetail } from './AdminBookingDetail'
import { AdminTransactions } from './AdminTransactions'
import type { VehicleBooking, ServiceBooking, Profile, Vehicle, Address, MechanicProfile, MechanicService } from '@ls-customs/shared-types'

interface AvailableMechanic {
  id: string
  full_name: string
  phone: string | null
  years_experience: number | null
  rating_avg: number | null
}

type BookingTab = 'vehicles' | 'services' | 'transactions'
type BookingStatus = VehicleBooking['status'] | ServiceBooking['status']

// Extended types for joined data
type VehicleBookingWithDetails = VehicleBooking & {
  profiles?: Profile[] | null
  vehicles?: Vehicle[] | null
}

type ServiceBookingWithDetails = ServiceBooking & {
  profiles?: Profile[] | null
  mechanic_profiles?: (MechanicProfile & { profiles?: Profile[] | null })[] | null
  addresses?: Address[] | null
  service_booking_items?: (ServiceBookingItem & { mechanic_services?: MechanicService | null })[] | null
}

type ServiceBookingItem = {
  id: string
  service_booking_id: string
  mechanic_service_id: string
  quantity: number
  price_at_booking: number
}

const statusLabels: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route: 'En Route',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const statusColors: Record<BookingStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  assigned: '#8b5cf6',
  en_route: '#06b6d4',
  in_progress: '#e8a838',
  completed: '#22c55e',
  cancelled: '#ef4444',
}

function getAdminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const details = error as { message?: string; details?: string; hint?: string; code?: string }
    return [details.message, details.details, details.hint, details.code ? `Code: ${details.code}` : '']
      .filter(Boolean)
      .join(' | ') || fallback
  }
  return fallback
}

export function AdminBookings() {
  const [activeTab, setActiveTab] = useState<BookingTab>('vehicles')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Mechanics available to take a new job. Loaded once on mount; the
  // assign dropdown re-renders from this list.
  const [availableMechanics, setAvailableMechanics] = useState<AvailableMechanic[]>([])
  const [assignOpenFor, setAssignOpenFor] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [completionBooking, setCompletionBooking] = useState<VehicleBooking | ServiceBooking | null>(null)
  const [violationPaymentRequired, setViolationPaymentRequired] = useState(false)
  const [violationAmount, setViolationAmount] = useState('')
  const [violationNotes, setViolationNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const pageSize = 10

  // Fetch available mechanics once on mount. Cheap query; the list
  // rarely changes mid-session.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('mechanic_profiles')
        .select('id, years_experience, rating_avg, profiles!inner(full_name, phone)')
        .eq('is_available', true)
        .order('rating_avg', { ascending: false, nullsFirst: false })
      if (cancelled) return
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[admin] failed to load mechanics:', error.message)
        return
      }
      type Row = { id: string; years_experience: number | null; rating_avg: number | null; profiles: { full_name: string; phone: string | null } | null }
      setAvailableMechanics(
        ((data ?? []) as unknown as Row[])
          .map((r) => ({
            id: r.id,
            full_name: r.profiles?.full_name ?? 'Mechanic',
            phone: r.profiles?.phone ?? null,
            years_experience: r.years_experience,
            rating_avg: r.rating_avg,
          })),
      )
    })()
    return () => { cancelled = true }
  }, [])

  const {
    data: vehicleBookings,
    loading: vehicleLoading,
    error: vehicleError,
    refetch: refetchVehicles,
    updateBookingStatus: updateVehicleBookingStatus,
  } = useAdminVehicleBookings()

  const {
    data: serviceBookings,
    loading: serviceLoading,
    error: serviceError,
    refetch: refetchServices,
    updateBookingStatus: updateServiceBookingStatus,
  } = useAdminServiceBookings()

  // Cast to extended types for joined data access
  const vehicleBookingsWithDetails = vehicleBookings as VehicleBookingWithDetails[] | undefined
  const serviceBookingsWithDetails = serviceBookings as ServiceBookingWithDetails[] | undefined

  const loading = vehicleLoading || serviceLoading
  const error = vehicleError || serviceError

  const bookings = activeTab === 'vehicles' ? vehicleBookingsWithDetails : serviceBookingsWithDetails

  const filteredBookings = bookings?.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    const searchTerm = searchQuery.toLowerCase()
    if (searchTerm) {
      const customer = b.profiles?.[0]?.full_name
      const idMatch = b.id.toLowerCase().includes(searchTerm)
      const nameMatch = customer?.toLowerCase().includes(searchTerm)
      if (!idMatch && !nameMatch) return false
    }
    return true
  }) || []

  const paginatedBookings = filteredBookings.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const totalPages = Math.ceil(filteredBookings.length / pageSize)

  // Service bookings carry the customer's dropped pin. Dynamically filters
  // by the current status filter and highlights the active selected booking.
  const activeServiceBookings = (serviceBookingsWithDetails ?? []).filter(
    (booking): booking is ServiceBookingWithDetails & { pin_lat: number; pin_lng: number } =>
      booking.pin_lat != null && booking.pin_lng != null,
  )

  const relevantServiceBookings = activeServiceBookings.filter((booking) => {
    if (statusFilter !== 'all' && booking.status !== statusFilter) return false
    return true
  })

  const selectedBooking = (serviceBookingsWithDetails ?? []).find((b) => b.id === selectedId)

  const servicePins: MapPin[] = relevantServiceBookings.map((booking) => {
    const isSelected = selectedId === booking.id
    const customer = booking.profiles?.[0]?.full_name ?? `Booking #${booking.id.slice(0, 8)}`
    const serviceName = booking.service_booking_items?.[0]?.mechanic_services?.name ?? 'Service'
    return {
      id: booking.id,
      lat: booking.pin_lat,
      lng: booking.pin_lng,
      title: `${isSelected ? '★ ' : ''}${customer}`,
      description: `${serviceName} · ${statusLabels[booking.status] ?? booking.status} · ₱${booking.total_price.toLocaleString()}`,
      color: isSelected ? '#e8a838' : (statusColors[booking.status] ?? '#3b82f6'),
    }
  })

  const mapCenter = (selectedBooking?.pin_lat != null && selectedBooking?.pin_lng != null)
    ? { lat: selectedBooking.pin_lat, lng: selectedBooking.pin_lng }
    : undefined

  const handleStatusChange = async (
    booking: VehicleBooking | ServiceBooking,
    nextStatus: BookingStatus,
  ) => {
    try {
      if (activeTab === 'vehicles') {
        await updateVehicleBookingStatus(booking.id, nextStatus)
      } else {
        await updateServiceBookingStatus(booking.id, nextStatus)
      }
    } catch (err) {
      console.error('[admin] failed to update booking status', err)
      alert(getAdminErrorMessage(err, 'Failed to update booking status'))
    }
  }

  const openCompletionModal = (booking: VehicleBooking | ServiceBooking) => {
    setCompletionBooking(booking)
    setViolationPaymentRequired(false)
    setViolationAmount('')
    setViolationNotes('')
  }

  const closeCompletionModal = () => {
    setCompletionBooking(null)
    setViolationPaymentRequired(false)
    setViolationAmount('')
    setViolationNotes('')
  }

  const handleConfirmCompletion = async () => {
    if (!completionBooking) return

    if (!violationPaymentRequired) {
      await handleStatusChange(completionBooking, 'completed')
      closeCompletionModal()
      return
    }

    const amount = parseFloat(violationAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      alert('Please enter a valid violation payment amount greater than zero.')
      return
    }

    setCompleting(true)
    try {
      const { error: paymentError } = await supabase.from('payments').insert({
        booking_type: activeTab === 'vehicles' ? 'vehicle' : 'service',
        booking_id: completionBooking.id,
        customer_id: completionBooking.customer_id,
        amount,
        currency: 'PHP',
        provider: 'admin_violation',
        provider_reference: violationNotes.trim() || null,
        status: 'pending',
      })
      if (paymentError) throw paymentError
      await handleStatusChange(completionBooking, 'completed')
      closeCompletionModal()
    } catch (err) {
      console.error('[admin] failed to record payment requirement', err)
      alert(getAdminErrorMessage(err, 'Failed to record payment requirement'))
    } finally {
      setCompleting(false)
    }
  }

  // Single-shot assign: writes mechanic_id and status='assigned' in one
  // update. Also creates customer notification and immediately dispatches
  // the SMS notification to the customer with booking and mechanic details.
  const assignMechanic = async (bookingId: string, mechanicId: string) => {
    setAssigning(true)
    try {
      // 1. Pre-check: was the booking still pending?
      const { data: probe, error: probeErr } = await supabase
        .from('service_bookings')
        .select('status, customer_id')
        .eq('id', bookingId)
        .single()
      if (probeErr) throw probeErr
      if (probe.status !== 'pending') {
        throw new Error(`Booking is already ${probe.status}; reload to see the latest.`)
      }

      // 2. Identify target booking & customer details
      const targetBooking = serviceBookingsWithDetails?.find((b) => b.id === bookingId)
      const customerRelation = targetBooking?.profiles as unknown as Profile | Profile[] | null | undefined
      const customerProfile = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation

      let customerName = customerProfile?.full_name || ''
      let customerPhone = customerProfile?.phone || null
      const customerId = probe.customer_id || targetBooking?.customer_id

      // Fetch fresh customer details if needed
      if ((!customerPhone || !customerName) && customerId) {
        const { data: custRow } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', customerId)
          .maybeSingle()
        if (custRow) {
          if (!customerName && custRow.full_name) customerName = custRow.full_name
          if (!customerPhone && custRow.phone) customerPhone = custRow.phone
        }
      }
      if (!customerName) customerName = 'Customer'

      // 3. Identify selected mechanic details
      const mechanic = availableMechanics.find((m) => m.id === mechanicId)
      let mechanicName = mechanic?.full_name || ''
      let mechanicPhone = mechanic?.phone || null

      if (!mechanicName || !mechanicPhone) {
        const { data: mechRow } = await supabase
          .from('mechanic_profiles')
          .select('profiles(full_name, phone)')
          .eq('id', mechanicId)
          .maybeSingle()
        const mechProfile = (mechRow?.profiles as unknown as { full_name?: string; phone?: string } | null)
        if (mechProfile?.full_name) mechanicName = mechProfile.full_name
        if (mechProfile?.phone) mechanicPhone = mechProfile.phone
      }
      if (!mechanicName) mechanicName = 'LS Customs Mechanic'

      // 4. Update the service booking to assigned
      const { error: updateErr } = await supabase
        .from('service_bookings')
        .update({ mechanic_id: mechanicId, status: 'assigned' })
        .eq('id', bookingId)
      if (updateErr) throw updateErr

      // 5. Construct friendly SMS message
      const bookingRef = bookingId.slice(0, 8).toUpperCase()
      const contactDetail = mechanicPhone ? ` (Contact: ${mechanicPhone})` : ''
      const smsMessage = `Hi ${customerName}! Your LS Customs mobile mechanic service (Booking #${bookingRef}) has been assigned to ${mechanicName}${contactDetail}. They will arrive at your scheduled time.`

      // 6. Insert in-app & SMS notification row into public.notifications
      let notifId: string | undefined
      if (customerId) {
        const { data: insertedNotif } = await supabase
          .from('notifications')
          .insert({
            user_id: customerId,
            type: 'booking_status_changed',
            title: 'Mechanic Assigned',
            body: smsMessage,
            channels: ['sms', 'in_app'],
            metadata: {
              booking_id: bookingId,
              booking_type: 'service',
              status: 'assigned',
              customer_name: customerName,
              customer_phone: customerPhone,
              mechanic_id: mechanicId,
              mechanic_name: mechanicName,
              mechanic_phone: mechanicPhone,
              dispatch_sms: true,
            },
            is_read: false,
          })
          .select('id')
          .maybeSingle()

        if (insertedNotif?.id) {
          notifId = insertedNotif.id
        }
      }

      // 7. Directly invoke dispatch-notification Edge Function
      let smsStatusMsg = ''
      try {
        const { data: dispatchResult, error: dispatchErr } = await supabase.functions.invoke('dispatch-notification', {
          body: {
            notification_id: notifId,
            phone: customerPhone,
            message: smsMessage,
            user_id: customerId,
            title: 'Mechanic Assigned',
            booking_id: bookingId,
            mechanic_name: mechanicName,
            mechanic_phone: mechanicPhone,
          },
        })

        if (dispatchErr) {
          console.warn('[admin] SMS dispatch error:', dispatchErr)
          smsStatusMsg = customerPhone
            ? ` (SMS dispatch queued for ${customerPhone})`
            : ` (Customer has no phone number on profile)`
        } else if (dispatchResult?.recipient_phone) {
          smsStatusMsg = ` (SMS notification sent to ${dispatchResult.recipient_phone})`
        } else if (customerPhone) {
          smsStatusMsg = ` (SMS notification queued for ${customerPhone})`
        } else {
          smsStatusMsg = ` (Note: Customer profile has no phone number)`
        }
      } catch (invokeErr) {
        console.warn('[admin] dispatch-notification invocation failed:', invokeErr)
      }

      setAssignOpenFor(null)
      setAssignmentNotice({
        type: customerPhone ? 'success' : 'warning',
        text: `Mechanic ${mechanicName} assigned to booking #${bookingRef}!${smsStatusMsg}`,
      })
      setTimeout(() => setAssignmentNotice(null), 7000)

      await Promise.all([refetchVehicles(), refetchServices()])
    } catch (err) {
      console.error('[admin] failed to assign mechanic', err)
      alert(getAdminErrorMessage(err, 'Failed to assign mechanic'))
    } finally {
      setAssigning(false)
    }
  }

  const getCustomerName = (booking: VehicleBookingWithDetails | ServiceBookingWithDetails) => {
    const relation = booking.profiles as unknown as Profile | Profile[] | null | undefined
    const profile = Array.isArray(relation) ? relation[0] : relation
    return profile?.full_name || 'Customer name unavailable'
  }

  const getVehicleName = (booking: VehicleBookingWithDetails) => {
    const relation = booking.vehicles as unknown as Vehicle | Vehicle[] | null | undefined
    const vehicle = Array.isArray(relation) ? relation[0] : relation
    return vehicle?.name || 'Vehicle name unavailable'
  }

  const getServiceDetails = (booking: ServiceBookingWithDetails) => {
    const items = booking.service_booking_items
    if (!items || items.length === 0) return 'No services'
    return items.map(i => i.mechanic_services?.name).filter(Boolean).join(', ')
  }

  const getMechanicName = (booking: ServiceBookingWithDetails) => {
    const mechanic = booking.mechanic_profiles?.[0]
    return mechanic?.profiles?.[0]?.full_name || 'Unassigned'
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading bookings...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load bookings</div>
        <p style={{ color: 'var(--admin-muted)', marginTop: 8 }}>{error}</p>
        <button onClick={() => { refetchVehicles(); refetchServices(); }} className="admin-add-btn" style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="admin-main">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="admin-fleet-header">
        <div>
          <h1>Bookings Overview</h1>
          <p>All vehicle rentals and mechanic service bookings.</p>
        </div>
        <span className="admin-status-badge active" style={{ fontSize: 12 }}>
          Admin: Unrestricted Status Updates
        </span>
      </div>

      {/* ── Assignment & SMS Notification Alert Banner ─────────── */}
      {assignmentNotice && (
        <div
          role="status"
          style={{
            padding: '12px 18px',
            marginBottom: 16,
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background:
              assignmentNotice.type === 'success'
                ? 'rgba(34, 197, 94, 0.15)'
                : assignmentNotice.type === 'warning'
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${
              assignmentNotice.type === 'success'
                ? '#22c55e'
                : assignmentNotice.type === 'warning'
                ? '#f59e0b'
                : '#ef4444'
            }`,
            color:
              assignmentNotice.type === 'success'
                ? '#86efac'
                : assignmentNotice.type === 'warning'
                ? '#fde047'
                : '#fca5a5',
          }}
        >
          <span>{assignmentNotice.text}</span>
          <button
            onClick={() => setAssignmentNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              marginLeft: 12,
              fontSize: 15,
              lineHeight: 1,
            }}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Tab Navigation ───────────────────────────────────── */}
      <div className="admin-filter-row" style={{ marginBottom: 16, borderBottom: '1px solid #2d3748', paddingBottom: 12 }}>
        <button
          className={`admin-filter-btn ${activeTab === 'vehicles' ? 'active' : ''}`}
          onClick={() => { setActiveTab('vehicles'); setCurrentPage(1); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Truck size={16} /> Vehicle Rentals
          <span style={{ background: '#374151', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
            {vehicleBookings?.length || 0}
          </span>
        </button>
        <button
          className={`admin-filter-btn ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => { setActiveTab('services'); setCurrentPage(1); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Wrench size={16} /> Mechanic Services
          <span style={{ background: '#374151', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
            {serviceBookings?.length || 0}
          </span>
        </button>
        <button
          className={`admin-filter-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => { setActiveTab('transactions'); setCurrentPage(1); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <CreditCard size={16} /> Transactions
        </button>

        <div style={{ flex: 1 }} />
        <div className="admin-fleet-search" style={{ minWidth: 250 }}>
          <Search size={14} style={{ color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search by customer or booking ID..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {activeTab === 'transactions' ? (
        <AdminTransactions />
      ) : (
        <>
      {/* ── Status Filter ────────────────────────────────────── */}
      <div className="admin-filter-row" style={{ marginBottom: 16, gap: 8 }}>
        <span style={{ color: 'var(--admin-muted)', fontSize: 13, alignSelf: 'center' }}>Status:</span>
        {['all', 'pending', 'confirmed', 'assigned', 'en_route', 'in_progress', 'completed', 'cancelled'].map((s) => (
          <button
            key={s}
            className={`admin-filter-btn ${statusFilter === s ? 'active' : ''}`}
            onClick={() => { setStatusFilter(s as 'all' | BookingStatus); setCurrentPage(1); }}
            style={{
              ...(s !== 'all' && {
                borderColor: statusColors[s as BookingStatus],
                color: statusColors[s as BookingStatus],
              }),
            }}
          >
            {s === 'all' ? 'All' : statusLabels[s as BookingStatus]}
          </button>
        ))}
      </div>

      {activeTab === 'services' && (
        <section className="admin-map-panel">
          <h3>Service customer locations</h3>
          <p className="admin-map-panel-sub">
            {selectedBooking
              ? `Focused on Booking #${selectedBooking.id.slice(0, 8)} (${selectedBooking.profiles?.[0]?.full_name ?? 'Customer'}) · ${statusLabels[selectedBooking.status] ?? selectedBooking.status}`
              : servicePins.length === 0
                ? 'No service bookings have a pinned customer location yet.'
                : `${servicePins.length} pinned service customer${servicePins.length === 1 ? '' : 's'} on the map.`}
          </p>
          <MapView pins={servicePins} center={mapCenter} height={360} />
        </section>
      )}

      {/* ── Bookings Table ───────────────────────────────────── */}
      <div className="admin-vehicle-grid" style={{ gridTemplateColumns: '1fr' }}>
        {filteredBookings.length === 0 ? (
          <div className="admin-empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}>
            No bookings found.
          </div>
        ) : (
          <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Customer</th>
                  {activeTab === 'vehicles' ? (
                    <>
                      <th>Vehicle</th>
                      <th>Dates</th>
                      <th>Pickup Location</th>
                    </>
                  ) : (
                    <>
                      <th>Services</th>
                      <th>Mechanic</th>
                      <th>Scheduled</th>
                      <th>Address / Pin</th>
                    </>
                  )}
                  <th>Total (₱)</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBookings.map((booking) => {
                  const isServiceRow = activeTab === 'services'
                  const isSelected = selectedId === booking.id
                  return (
                  <tr
                    key={booking.id}
                    onClick={isServiceRow ? () => setSelectedId(booking.id) : undefined}
                    style={{
                      cursor: isServiceRow ? 'pointer' : 'default',
                      background: isSelected ? 'rgba(232, 168, 56, 0.06)' : undefined,
                    }}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {booking.id.slice(0, 8)}...
                    </td>
                    <td style={{ fontWeight: 500 }}>{getCustomerName(booking)}</td>
                    {activeTab === 'vehicles' ? (
                      <>
                        <td>{getVehicleName(booking as VehicleBooking)}</td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                          {(booking as VehicleBooking).start_date} → {(booking as VehicleBooking).end_date}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--admin-muted)', maxWidth: 200 }}>
                          {(booking as VehicleBooking).pickup_location || '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        {(() => {
                          const sb = booking as ServiceBookingWithDetails
                          return (
                            <>
                              <td style={{ maxWidth: 250 }}>{getServiceDetails(sb)}</td>
                              <td>{getMechanicName(sb)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {new Date(sb.scheduled_at).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--admin-muted)', maxWidth: 220 }}>
                                {(() => {
                                  if (sb.addresses?.[0]) return `${sb.addresses[0].line1}, ${sb.addresses[0].city}`
                                  if (sb.notes) {
                                    const match = sb.notes.match(/Address:\s*([^|]+)/i)
                                    if (match && match[1]?.trim()) return match[1].trim()
                                  }
                                  if (sb.pin_lat != null && sb.pin_lng != null) {
                                    return `Pin: ${sb.pin_lat.toFixed(4)}, ${sb.pin_lng.toFixed(4)}`
                                  }
                                  return '—'
                                })()}
                              </td>
                            </>
                          )
                        })()}
                      </>
                    )}
                    <td style={{ fontWeight: 600, color: '#e8a838' }}>
                      {booking.total_price.toLocaleString()}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className="admin-status-badge"
                        style={{
                          background: `${statusColors[booking.status]}20`,
                          color: statusColors[booking.status],
                          border: `1px solid ${statusColors[booking.status]}40`,
                        }}
                      >
                        {statusLabels[booking.status]}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['pending', 'confirmed', 'assigned', 'en_route', 'in_progress'] as BookingStatus[]).includes(booking.status) && (
                          <>
                            {booking.status !== 'completed' && (
                              <button
                                className="admin-vehicle-btn secondary"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openCompletionModal(booking)
                                }}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                Complete
                              </button>
                            )}
                            {booking.status !== 'cancelled' && (
                              <button
                                className="admin-vehicle-btn secondary"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleStatusChange(booking, 'cancelled')
                                }}
                                style={{ padding: '4px 8px', fontSize: 11, borderColor: '#ef4444', color: '#ef4444' }}
                              >
                                Cancel
                              </button>
                            )}
                            {booking.status === 'pending' && activeTab === 'services' && (
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                  className="admin-vehicle-btn secondary"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setAssignOpenFor((cur) => (cur === booking.id ? null : booking.id))
                                  }}
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  disabled={assigning}
                                >
                                  Assign ▾
                                </button>
                                {assignOpenFor === booking.id && (
                                  <div
                                    role="menu"
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      right: 0,
                                      marginTop: 4,
                                      minWidth: 240,
                                      background: 'var(--admin-card, #1a1f2e)',
                                      border: '1px solid var(--admin-border, #2d3748)',
                                      borderRadius: 6,
                                      boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
                                      zIndex: 10,
                                      padding: 4,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {availableMechanics.length === 0 ? (
                                      <div style={{ padding: 8, fontSize: 11, color: 'var(--admin-muted, #9ca3af)' }}>
                                        No available mechanics.
                                      </div>
                                    ) : availableMechanics.map((m) => (
                                      <button
                                        key={m.id}
                                        type="button"
                                        className="admin-vehicle-btn secondary"
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, marginBottom: 2 }}
                                        disabled={assigning}
                                        onClick={() => void assignMechanic(booking.id, m.id)}
                                      >
                                        <strong style={{ display: 'block' }}>{m.full_name}</strong>
                                        <span style={{ color: 'var(--admin-muted, #9ca3af)' }}>
                                          {m.years_experience != null ? `${m.years_experience} yrs` : 'New'} · {m.rating_avg != null ? `★ ${m.rating_avg.toFixed(1)}` : 'unrated'}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {booking.status === 'assigned' && activeTab === 'services' && (
                              <button
                                className="admin-vehicle-btn secondary"
                                onClick={() => handleStatusChange(booking, 'en_route')}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                En Route
                              </button>
                            )}
                            {booking.status === 'en_route' && activeTab === 'services' && (
                              <button
                                className="admin-vehicle-btn secondary"
                                onClick={() => handleStatusChange(booking, 'in_progress')}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                Start
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="admin-transactions-pagination" style={{ marginTop: 16 }}>
                <span>Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredBookings.length)} of {filteredBookings.length} entries</span>
                <div className="admin-pagination-btns">
                  <button
                    className="admin-pagination-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--admin-muted)' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className="admin-pagination-btn"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Booking detail drawer ─────────────────────────────── */}
      <AdminBookingDetail
        booking={
          selectedId
            ? (serviceBookingsWithDetails ?? []).find((b) => b.id === selectedId) ?? null
            : null
        }
        onClose={() => setSelectedId(null)}
      />

      {completionBooking && (
        <div className="admin-modal-overlay" onClick={closeCompletionModal}>
          <div className="admin-modal completion-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2>Complete rental</h2>
                <p className="admin-modal-subtitle">
                  Booking {completionBooking.id.slice(0, 8)}... · {getCustomerName(completionBooking as VehicleBookingWithDetails)}
                </p>
              </div>
              <button className="admin-modal-close" onClick={closeCompletionModal} aria-label="Close completion modal">
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="completion-summary">
                <strong>{activeTab === 'vehicles'
                  ? getVehicleName(completionBooking as VehicleBookingWithDetails)
                  : getServiceDetails(completionBooking as ServiceBookingWithDetails)}</strong>
                <span>Total booking value: ₱{completionBooking.total_price.toLocaleString()}</span>
              </div>

              <label className="completion-warning-option">
                <input
                  type="checkbox"
                  checked={violationPaymentRequired}
                  onChange={(event) => setViolationPaymentRequired(event.target.checked)}
                />
                <span>
                  <strong><AlertTriangle size={15} /> Payment is required for violations</strong>
                  <small>Keep this booking active until the additional charge is collected.</small>
                </span>
              </label>

              {violationPaymentRequired && (
                <div className="completion-violation-fields">
                  <div className="admin-form-field">
                    <label htmlFor="violation-amount">Additional payment (₱)</label>
                    <input
                      id="violation-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={violationAmount}
                      onChange={(event) => setViolationAmount(event.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="admin-form-field">
                    <label htmlFor="violation-notes">Violation details</label>
                    <textarea
                      id="violation-notes"
                      value={violationNotes}
                      onChange={(event) => setViolationNotes(event.target.value)}
                      placeholder="Describe the damage, late return, or other charge..."
                    />
                  </div>
                  <p className="completion-payment-note"><CreditCard size={14} /> This booking will remain active and will not be marked completed.</p>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="admin-modal-btn secondary" onClick={closeCompletionModal} disabled={completing}>
                Cancel
              </button>
              {violationPaymentRequired ? (
                <button type="button" className="admin-modal-btn primary completion-payment-btn" onClick={() => void recordViolationPayment()} disabled={completing}>
                  {completing ? 'Recording...' : 'Record payment required'}
                </button>
              ) : (
                <button type="button" className="admin-modal-btn primary" onClick={() => void completeRental()} disabled={completing}>
                  {completing ? 'Completing...' : 'Complete rental'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}