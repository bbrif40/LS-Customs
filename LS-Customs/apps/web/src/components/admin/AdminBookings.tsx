/**
 * AdminBookings — Combined Bookings Overview (read-only with admin status updates).
 * Shows both vehicle_bookings and service_bookings in tabbed views.
 * Admin can update status via existing RLS policy (unrestricted for admins).
 */
import { useEffect, useState } from 'react'
import { Search, Filter, Truck, Wrench, X, Loader2, ChevronLeft, ChevronRight, AlertTriangle, CreditCard, Ticket, Eye, Edit, Check, UserPlus } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { closeOutline, star } from 'ionicons/icons'
import {
  useAdminVehicleBookings,
  useAdminServiceBookings,
} from '../../hooks/useAdminData'
import { supabase } from '../../supabaseClient'
import { requireFunctionData } from '../../utils/functionResult'
import { MapView, type MapPin } from '../common/map'
import { AdminBookingDetail } from './AdminBookingDetail'
import { AdminTransactions } from './AdminTransactions'
import { AdminTableSkeleton } from '../common/Skeleton'
import { parsePromoFromText } from '../../utils/promoHelper'
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
  const [editingBooking, setEditingBooking] = useState<VehicleBooking | ServiceBooking | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [paymentSummary, setPaymentSummary] = useState<number | null>(null)
  const [paymentSummaryError, setPaymentSummaryError] = useState(false)

  const [completionBooking, setCompletionBooking] = useState<VehicleBooking | ServiceBooking | null>(null)
  const [viewingBooking, setViewingBooking] = useState<VehicleBookingWithDetails | ServiceBookingWithDetails | null>(null)
  useEffect(() => {
    let active = true
    setPaymentSummary(null)
    setPaymentSummaryError(false)
    if (!viewingBooking) return
    const type = 'vehicle_id' in viewingBooking ? 'vehicle' : 'service'
    void supabase.from('payments').select('amount, status').eq('booking_id', viewingBooking.id).eq('booking_type', type)
      .then(({ data, error }) => {
        if (!active) return
        if (error) setPaymentSummaryError(true)
        else setPaymentSummary((data ?? []).filter(row => row.status === 'succeeded').reduce((sum, row) => sum + Number(row.amount), 0))
      })
    return () => { active = false }
  }, [viewingBooking])
  const [violationPaymentRequired, setViolationPaymentRequired] = useState(false)
  const [violationAmount, setViolationAmount] = useState('')
  const [violationNotes, setViolationNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [assignmentNotice, setAssignmentNotice] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const pageSize = 10

  // Fetch available mechanics once on mount. Cheap query; the list
  // rarely changes mid-session.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('mechanic_profiles')
        .select('id, years_experience, rating_avg, profiles!inner(full_name, phone)')
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

  const getCustomerName = (booking: VehicleBookingWithDetails | ServiceBookingWithDetails) => {
    const relation = booking.profiles as unknown as Profile | Profile[] | null | undefined
    const profile = Array.isArray(relation) ? relation[0] : relation
    return profile?.full_name || 'Customer'
  }

  const bookings = activeTab === 'vehicles' ? vehicleBookingsWithDetails : serviceBookingsWithDetails

  const filteredBookings = bookings?.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    const searchTerm = searchQuery.toLowerCase()
    if (searchTerm) {
      const customer = getCustomerName(b)
      const idMatch = b.id.toLowerCase().includes(searchTerm)
      const nameMatch = customer.toLowerCase().includes(searchTerm)
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
  // Completed and cancelled bookings are removed from the active map.
  const activeServiceBookings = (serviceBookingsWithDetails ?? []).filter(
    (booking): booking is ServiceBookingWithDetails & { pin_lat: number; pin_lng: number } =>
      booking.pin_lat != null &&
      booking.pin_lng != null &&
      booking.status !== 'completed' &&
      booking.status !== 'cancelled',
  )

  const relevantServiceBookings = activeServiceBookings.filter((booking) => {
    if (statusFilter !== 'all' && booking.status !== statusFilter) return false
    return true
  })

  const selectedBooking = (serviceBookingsWithDetails ?? []).find((b) => b.id === selectedId)
  const isSelectedBookingOnMap = Boolean(selectedBooking && selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled')

  const servicePins: MapPin[] = relevantServiceBookings.map((booking) => {
    const isSelected = selectedId === booking.id
    const customer = getCustomerName(booking)
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

  const mapCenter = (isSelectedBookingOnMap && selectedBooking?.pin_lat != null && selectedBooking?.pin_lng != null)
    ? { lat: selectedBooking.pin_lat, lng: selectedBooking.pin_lng }
    : undefined

  const handleStatusChange = async (
    booking: VehicleBooking | ServiceBooking,
    nextStatus: BookingStatus,
  ) => {
    try {
      const isVehicle = 'vehicle_id' in booking || activeTab === 'vehicles'
      if (isVehicle) {
        await updateVehicleBookingStatus(booking.id, nextStatus)
      } else {
        await updateServiceBookingStatus(booking.id, nextStatus)
      }
      if (nextStatus === 'confirmed') {
        try {
          requireFunctionData(await supabase.functions.invoke('send-booking-confirmation', {
            body: { bookingId: booking.id, bookingType: isVehicle ? 'vehicle' : 'service' },
          }), 'Booking approved, but confirmation email could not be sent. Retry from booking details.')
          setAssignmentNotice({ type: 'success', text: 'Booking approved. Confirmation email accepted by the email provider.' })
        } catch (emailError) {
          setAssignmentNotice({ type: 'warning', text: getAdminErrorMessage(emailError, 'Booking approved; confirmation email failed.') })
        }
      }
      return true
    } catch (err) {
      console.error('[admin] failed to update booking status', err)
      alert(getAdminErrorMessage(err, 'Failed to update booking status'))
      return false
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

  const completeBooking = async () => {
    if (!completionBooking) return
    setCompleting(true)
    try {
      const success = await handleStatusChange(completionBooking, 'completed')
      if (success) closeCompletionModal()
    } catch (err) {
      console.error('[admin] failed to complete booking', err)
      alert(getAdminErrorMessage(err, 'Failed to complete booking'))
    } finally {
      setCompleting(false)
    }
  }

  const completeRental = completeBooking

  const recordViolationPayment = async () => {
    if (!completionBooking) return

    const amount = parseFloat(violationAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      alert('Please enter a valid violation payment amount greater than zero.')
      return
    }

    setCompleting(true)
    try {
      const isVehicle = 'vehicle_id' in completionBooking || activeTab === 'vehicles'
      const { error: paymentError } = await supabase.from('payments').insert({
        booking_type: isVehicle ? 'vehicle' : 'service',
        booking_id: completionBooking.id,
        customer_id: completionBooking.customer_id,
        amount,
        currency: 'PHP',
        provider: 'admin_violation',
        provider_reference: violationNotes.trim() || null,
        status: 'pending',
      })
      if (paymentError) throw paymentError
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
      if (!['pending', 'confirmed'].includes(probe.status)) {
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

      const { data: notification, error: notificationError } = await supabase.from('notifications')
        .select('id').eq('user_id', customerId).contains('metadata', { booking_id: bookingId, new_status: 'assigned' })
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      let smsStatusMsg = ' Assignment saved. SMS delivery is not yet verified.'
      if (!notificationError && notification) {
        try {
          const dispatch = requireFunctionData<{ channels: string[]; dispatched: boolean; simulated?: boolean; reason?: string }>(
            await supabase.functions.invoke('dispatch-notification', { body: { notification_id: notification.id } }),
            'SMS provider request failed.',
          )
          if (dispatch.dispatched && !dispatch.simulated && dispatch.channels.some(channel => channel.startsWith('sms_')))
            smsStatusMsg = ' SMS accepted by the provider; recipient delivery is not yet verified.'
          else if (dispatch.reason === 'in_progress') smsStatusMsg = ' Notification dispatch is in progress.'
          else smsStatusMsg = ' Assignment saved, but SMS was not accepted by a provider.'
        } catch (dispatchError) {
          smsStatusMsg = ' ' + getAdminErrorMessage(dispatchError, 'Assignment saved, but SMS dispatch failed.')
        }
      }

      setAssignOpenFor(null)
      setAssignmentNotice({
        type: smsStatusMsg.includes('accepted by the provider') ? 'success' : 'warning',
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
    const mechanicRelation = booking.mechanic_profiles as unknown as (MechanicProfile & { profiles?: Profile | Profile[] | null }) | (MechanicProfile & { profiles?: Profile | Profile[] | null })[] | null | undefined
    const mechanic = Array.isArray(mechanicRelation) ? mechanicRelation[0] : mechanicRelation
    const pRelation = mechanic?.profiles
    const prof = Array.isArray(pRelation) ? pRelation[0] : pRelation
    return prof?.full_name || 'Unassigned'
  }

  if (loading) {
    return (
      <div className="admin-main">
        <div className="admin-fleet-header">
          <div>
            <h1>Bookings Overview</h1>
            <p>All vehicle rentals and mechanic service bookings.</p>
          </div>
          <span className="admin-status-badge active" style={{ fontSize: 12 }}>
            Loading bookings…
          </span>
        </div>
        <div className="admin-card" style={{ marginTop: 20 }}>
          <AdminTableSkeleton rows={8} cols={6} />
        </div>
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

  const renderBookingDetailsModal = () => {
    if (!viewingBooking) return null

    const isVehicle = 'vehicle_id' in viewingBooking
    const name = getCustomerName(viewingBooking)
    const relation = viewingBooking.profiles as unknown as Profile | Profile[] | null | undefined
    const profile = Array.isArray(relation) ? relation[0] : relation
    const contactNum = profile?.phone || 'No contact number'
    const total = viewingBooking.total_price
    
    const amountPaid = paymentSummary
    const outstanding = amountPaid == null ? null : Math.max(0, total - amountPaid)

    let displayId = ''
    let dateStr = ''
    let timeStr = ''
    let timeLabel = 'Time:'
    let pickupStr = '—'
    let dropoffStr = '—'
    let addressStr = '—'
    let itemLabel = 'Item:'
    let itemStr = ''

    if (isVehicle) {
      const vb = viewingBooking as VehicleBookingWithDetails
      displayId = 'b' + vb.id.slice(0, 5)
      dateStr = `${vb.start_date} to ${vb.end_date}`
      timeStr = new Date(vb.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      timeLabel = 'Time of booking of rental:'
      pickupStr = vb.pickup_location || 'Showroom'
      dropoffStr = 'Showroom' // Default
      itemLabel = 'Item:'
      itemStr = getVehicleName(vb)
    } else {
      const sb = viewingBooking as ServiceBookingWithDetails
      displayId = 'S' + sb.id.slice(0, 5)
      const d = new Date(sb.scheduled_at)
      dateStr = d.toLocaleDateString()
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      timeLabel = 'Time:'
      if (sb.addresses?.[0]) {
        addressStr = `${sb.addresses[0].line1}, ${sb.addresses[0].city}`
      } else if (sb.notes) {
        const match = sb.notes.match(/Address:\s*([^|]+)/i)
        if (match && match[1]?.trim()) {
          addressStr = match[1].trim()
        } else {
          addressStr = 'Address not provided'
        }
      } else {
        addressStr = 'Address not provided'
      }
      itemLabel = 'Service Type:'
      itemStr = getServiceDetails(sb)
    }

    return (
      <div className="admin-modal-overlay" onClick={() => setViewingBooking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <style>{`
          @keyframes bookingModalPop {
            0% { opacity: 0; transform: scale(0.95); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', color: '#1e293b', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', animation: 'bookingModalPop 0.2s ease-out forwards' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Booking Details</h2>
            <button onClick={() => setViewingBooking(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 16px', fontSize: '14px', lineHeight: 1.5 }}>
            <span style={{ color: '#64748b' }}>ID:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{displayId}</span>
            
            <span style={{ color: '#64748b' }}>Customer:</span>
            <span style={{ fontWeight: 600 }}>{name}</span>
            
            <span style={{ color: '#64748b' }}>Contact Num:</span>
            <span style={{ fontWeight: 500 }}>{contactNum}</span>
            
            <span style={{ color: '#64748b' }}>{itemLabel}</span>
            <span style={{ color: '#334155', fontWeight: 500 }}>{itemStr}</span>

            <span style={{ color: '#64748b' }}>Date:</span>
            <span style={{ fontWeight: 500 }}>{dateStr}</span>
            
            <span style={{ color: '#64748b' }}>{timeLabel}</span>
            <span style={{ fontWeight: 500 }}>{timeStr}</span>

            {isVehicle ? (
              <>
                <span style={{ color: '#64748b' }}>Pickup:</span>
                <span style={{ fontWeight: 500 }}>{pickupStr}</span>
                <span style={{ color: '#64748b' }}>Dropoff:</span>
                <span style={{ fontWeight: 500 }}>{dropoffStr}</span>
              </>
            ) : (
              <>
                <span style={{ color: '#64748b' }}>Address:</span>
                <span style={{ fontWeight: 500 }}>{addressStr}</span>
              </>
            )}

            <div style={{ gridColumn: '1 / -1', height: '1px', background: '#e2e8f0', margin: '8px 0' }} />

            <span style={{ color: '#64748b' }}>Total Price:</span>
            <span style={{ fontWeight: 700, color: '#d97706' }}>₱{total.toLocaleString()}</span>
            
            <span style={{ color: '#64748b' }}>Amount Paid:</span>
            <span style={{ fontWeight: 700, color: '#059669' }}>₱{amountPaid == null ? (paymentSummaryError ? 'Unavailable' : 'Loading…') : amountPaid.toLocaleString()}</span>

            <span style={{ color: '#64748b' }}>Outstanding:</span>
            <span style={{ fontWeight: 700, color: '#0284c7' }}>₱{outstanding == null ? '—' : outstanding.toLocaleString()}</span>
            
            <span style={{ color: '#64748b' }}>Status:</span>
            <span style={{ textTransform: 'capitalize', color: statusColors[viewingBooking.status] || '#1e293b', fontWeight: 600 }}>
              {statusLabels[viewingBooking.status] || viewingBooking.status}
            </span>
          </div>

          {['confirmed', 'assigned', 'en_route', 'in_progress', 'completed'].includes(viewingBooking.status) && (
            <button onClick={async () => {
              try {
                requireFunctionData(await supabase.functions.invoke('send-booking-confirmation', { body: {
                  bookingId: viewingBooking.id, bookingType: isVehicle ? 'vehicle' : 'service',
                } }), 'Confirmation email could not be sent.')
                setAssignmentNotice({ type: 'success', text: 'Confirmation email accepted by the provider. This is not proof of payment.' })
              } catch (error) {
                setAssignmentNotice({ type: 'warning', text: error instanceof Error ? error.message : 'Confirmation email failed.' })
              }
              setViewingBooking(null)
            }}>Retry confirmation email</button>
          )}
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setViewingBooking(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>Close</button>
          </div>
        </div>
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
              display: 'inline-flex',
              alignItems: 'center',
            }}
            aria-label="Dismiss notification"
          >
            <IonIcon icon={closeOutline} style={{ fontSize: 16 }} />
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
            {isSelectedBookingOnMap && selectedBooking
              ? `Focused on Booking #${selectedBooking.id.slice(0, 8)} (${getCustomerName(selectedBooking)}) · ${statusLabels[selectedBooking.status] ?? selectedBooking.status}`
              : servicePins.length === 0
                ? 'No active service bookings with pinned customer locations.'
                : `${servicePins.length} active service customer${servicePins.length === 1 ? '' : 's'} on the map.`}
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
                  <th>Voucher / Promo</th>
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
                    <td>
                      {(() => {
                        const rawText = isServiceRow
                          ? (booking as ServiceBookingWithDetails).notes
                          : (booking as VehicleBooking).pickup_location
                        const promo = parsePromoFromText(rawText)
                        if (!promo) {
                          return <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
                        }
                        return (
                          <span
                            style={{
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              whiteSpace: 'nowrap',
                            }}
                            title={`Customer used voucher: ${promo.code} (${promo.discount})`}
                          >
                            <Ticket size={12} />
                            {promo.code}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ fontWeight: 600, color: '#e8a838' }}>
                      {booking.total_price.toLocaleString()}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <select
                        aria-label="Change booking status"
                        value={booking.status}
                        onChange={(e) => {
                          e.stopPropagation()
                          void handleStatusChange(booking, e.target.value as BookingStatus)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="admin-status-badge"
                        style={{
                          background: `${statusColors[booking.status]}15`,
                          color: statusColors[booking.status],
                          border: `1px solid ${statusColors[booking.status]}40`,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {(activeTab === 'vehicles' ? ['pending', 'confirmed', 'completed', 'cancelled'] : ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress', 'completed', 'cancelled']).map((s) => (
                          <option key={s} value={s} style={{ background: '#ffffff', color: '#1e293b', fontWeight: 500 }}>
                            {statusLabels[s as BookingStatus]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          title="View Details"
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewingBooking(booking)
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d4d9e6', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingBooking(booking)
                            setEditingText('vehicle_id' in booking ? booking.pickup_location ?? '' : booking.notes ?? '')
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d4d9e6', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}
                        >
                          <Edit size={14} />
                        </button>

                        {(['pending', 'confirmed', 'assigned', 'en_route', 'in_progress'] as BookingStatus[]).includes(booking.status) && (
                          <>
                            {booking.status !== 'completed' && (
                              <button
                                title="Complete"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openCompletionModal(booking)
                                }}
                                style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}
                              >
                                <Check size={14} />
                              </button>
                            )}
                            {booking.status !== 'cancelled' && (
                              <button
                                title="Cancel"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleStatusChange(booking, 'cancelled')
                                }}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}
                              >
                                <X size={14} />
                              </button>
                            )}
                            {['pending', 'confirmed'].includes(booking.status) && activeTab === 'services' && (
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                  title="Assign Mechanic"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setAssignOpenFor((cur) => (cur === booking.id ? null : booking.id))
                                  }}
                                  style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#3b82f6', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}
                                  disabled={assigning}
                                >
                                  <UserPlus size={14} />
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
                                        <span style={{ color: 'var(--admin-muted, #9ca3af)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                          {m.years_experience != null ? `${m.years_experience} yrs` : 'New'} ·{' '}
                                          {m.rating_avg != null ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                              <IonIcon icon={star} style={{ color: '#e8a838', fontSize: 11 }} />
                                              {m.rating_avg.toFixed(1)}
                                            </span>
                                          ) : (
                                            'unrated'
                                          )}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
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
                <h2>{'vehicle_id' in completionBooking || activeTab === 'vehicles' ? 'Complete rental' : 'Complete service'}</h2>
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
                <strong>{('vehicle_id' in completionBooking || activeTab === 'vehicles')
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
                <button type="button" className="admin-modal-btn primary" onClick={() => void completeBooking()} disabled={completing}>
                  {completing ? 'Completing...' : ('vehicle_id' in completionBooking || activeTab === 'vehicles' ? 'Complete rental' : 'Complete service')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
      
      {editingBooking && <div className="admin-modal-overlay"><form className="admin-modal" role="dialog" aria-label="Edit booking instructions" onSubmit={event => {
        event.preventDefault()
        if (savingEdit) return
        setSavingEdit(true)
        const rental = 'vehicle_id' in editingBooking
        void Promise.resolve(supabase.from(rental ? 'vehicle_bookings' : 'service_bookings')
          .update(rental ? { pickup_location: editingText.trim() } : { notes: editingText.trim() })
          .eq('id', editingBooking.id).select('id').single()).then(async ({ error }) => {
            if (error) { setAssignmentNotice({ type: 'warning', text: error.message }); return }
            setEditingBooking(null)
            await Promise.all([refetchVehicles(), refetchServices()])
          }).finally(() => setSavingEdit(false))
      }}>
        <h2>Edit booking instructions</h2>
        <label>{'vehicle_id' in editingBooking ? 'Pickup instructions' : 'Service notes'}
          <textarea aria-label="Booking instructions" value={editingText} onChange={event => setEditingText(event.target.value)} maxLength={2000} required />
        </label>
        <button type="button" disabled={savingEdit} onClick={() => setEditingBooking(null)}>Cancel</button>
        <button type="submit" disabled={savingEdit}>Save instructions</button>
      </form></div>}
      {renderBookingDetailsModal()}
    </div>
  )
}