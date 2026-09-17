/**
 * MechanicBookingFlow — orchestrator for the multi-step mechanic booking flow.
 *
 * Owns the form state, validates per step, and renders the active step.
 * Dynamically estimates the customer's distance from the assigned driver / mechanic
 * and calculates the total price by adding the distance travel fee (every 5km is 85 pesos).
 * On confirm, inserts a `service_bookings` row and shows the Confirmed step.
 */
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import { useProfile } from '../../../hooks/useProfile'
import { useServices } from '../../../hooks/useServices'
import { useMechanicDistance } from '../../../hooks/useMechanicDistance'
import { useScrollAnimation } from '../../../hooks/useScrollAnimation'
import { PageHeading } from '../../common/PageHeading'
import { BookingStepper } from './BookingStepper'
import { STEP_ORDER, type Step } from './steps'
import { StepCategory } from './StepCategory'
import { StepService } from './StepService'
import { StepSchedule } from './StepSchedule'
import { StepLocation } from './StepLocation'
import { StepReview } from './StepReview'
import { StepConfirmed } from './StepConfirmed'
import { StepPayment } from './StepPayment'
import { preloadMap } from '../../common/map/preload'
import type { Service, ServiceBooking } from '../../../types'

export interface ChosenAddress {
  id?: string
  line1: string
  city: string
  label?: string
  source: 'default' | 'custom'
  /** Set when the user drops a pin on the LocationPicker map. */
  pin_lat?: number | null
  /** Set when the user drops a pin on the LocationPicker map. */
  pin_lng?: number | null
}

interface MechanicBookingFlowProps {
  userId: string | undefined
  onNotify: (message: string) => void
  onBackToHome?: () => void
}

function generateLocalRef(): string {
  const tail = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')
  return `LSC-${tail}`
}

function buildScheduledAt(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00`)
  return d.toISOString()
}

export function MechanicBookingFlow({ userId, onNotify, onBackToHome }: MechanicBookingFlowProps) {
  useEffect(() => {
    preloadMap()
  }, [])
  const { profile, defaultAddress, loading: profileLoading } = useProfile(userId)
  const { services, loading: servicesLoading, source: servicesSource } = useServices()
  const scrollRef = useScrollAnimation<HTMLDivElement>()

  const [step, setStep] = useState<Step>('category')
  const [category, setCategory] = useState<string | null>(null)
  const [service, setService] = useState<Service | null>(null)
  const [date, setDate] = useState<string | null>(null) // YYYY-MM-DD
  const [time, setTime] = useState<string | null>(null) // HH:MM
  const [address, setAddress] = useState<ChosenAddress | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState<ServiceBooking | null>(null)
  const [pendingPayment, setPendingPayment] = useState<{
    bookingId: string
    serviceName: string
    servicePrice: string
    baseServicePrice: string
    distanceFee: string
    distanceKm: string
    scheduledAt: string
    addressLabel: string
    addressCity: string
    customerName: string
    customerPhone: string
    mechanicName: string
    mechanicPhone: string
  } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Determine customer coordinates from dropped pin or saved default address
  const customerLat = address?.pin_lat ?? defaultAddress?.lat ?? 14.5995
  const customerLng = address?.pin_lng ?? defaultAddress?.lng ?? 120.9842

  // Live distance and travel fee estimation (every 5km is 85 pesos)
  const {
    assignedMechanic,
    distanceKm,
    distanceFeePesos,
    distanceFeeCents,
    formattedDistanceFee,
    formattedDistance,
  } = useMechanicDistance(customerLat, customerLng)

  const basePriceCents = service?.priceCents ?? 0
  const totalPriceCents = basePriceCents + distanceFeeCents
  const totalPricePesos = totalPriceCents / 100
  const formattedTotalPrice = `₱${totalPricePesos.toFixed(2)}`
  const formattedBasePrice = `₱${(basePriceCents / 100).toFixed(2)}`

  const goTo = useCallback((target: Step) => {
    setStep(target)
  }, [])

  const goNext = useCallback(() => {
    setStep((current) => {
      const i = STEP_ORDER.indexOf(current)
      if (i < STEP_ORDER.length - 1) return STEP_ORDER[i + 1]
      return current
    })
  }, [])

  const goBack = useCallback(() => {
    setStep((current) => {
      const i = STEP_ORDER.indexOf(current)
      if (i > 0) return STEP_ORDER[i - 1]
      return current
    })
  }, [])

  const reset = useCallback(() => {
    setStep('category')
    setCategory(null)
    setService(null)
    setDate(null)
    setTime(null)
    setAddress(null)
    setSubmitError(null)
    setConfirmedBooking(null)
    setPendingPayment(null)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!userId) {
      onNotify('You need to be signed in to book a service')
      return
    }
    if (!service || !date || !time || !address) return

    const looksLikeUuid = typeof service.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.id)
    if (!looksLikeUuid) {
      // eslint-disable-next-line no-console
      console.warn('[mechanic-booking] refusing to confirm: service has no DB id. useServices failed to load rows.')
      setSubmitError('Service catalog is loading. Please refresh and try again.')
      return
    }

    const hasPin = address.pin_lat != null && address.pin_lng != null
    const effectiveAddressId = address.id ?? (address.source === 'custom' && !hasPin ? defaultAddress?.id ?? null : null)
    if (!effectiveAddressId && !hasPin) {
      setSubmitError('Please pick a saved address or drop a pin on the map before confirming.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const scheduledAt = buildScheduledAt(date, time)
    const localRef = generateLocalRef()

    // Persist the booking and its selected service as one customer flow.
    let bookingId: string | null = null
    let status: ServiceBooking['status'] = 'pending'

    try {
      const { data, error: insertError } = await supabase
        .from('service_bookings')
        .insert({
          customer_id: userId,
          address_id: hasPin ? null : effectiveAddressId,
          mechanic_id: assignedMechanic?.id ?? null,
          scheduled_at: scheduledAt,
          status: 'pending',
          total_price: totalPricePesos,
          notes: `Address: ${address.line1}, ${address.city} | Base: ${formattedBasePrice} + Distance Fee: ${formattedDistanceFee} (${distanceKm.toFixed(1)} km from ${assignedMechanic?.full_name ?? 'driver'})`,
          pin_lat: hasPin ? address.pin_lat : null,
          pin_lng: hasPin ? address.pin_lng : null,
        })
        .select('id, status')
        .single()

      if (insertError) throw insertError
      if (data?.id) bookingId = data.id
      if (data?.status) status = data.status as ServiceBooking['status']
      if (!bookingId) throw new Error('Booking was not created')

      const { error: itemError } = await supabase.from('service_booking_items').insert({
        service_booking_id: bookingId,
        mechanic_service_id: service.id,
        quantity: 1,
        price_at_booking: basePriceCents / 100,
      })
      if (itemError) throw itemError
    } catch (err) {
      const e = err as { message?: string; hint?: string; details?: string } | null
      const raw = e?.message ?? (err instanceof Error ? err.message : String(err))
      const message = /one_location_only/i.test(raw)
        ? 'Please pick a saved address or drop a pin on the map before confirming.'
        : raw || 'Booking could not be saved'
      setSubmitError(message)
      setSubmitting(false)
      return
    }

    const addressLabel = effectiveAddressId === defaultAddress?.id ? (defaultAddress?.label ?? defaultAddress?.line1 ?? address.label ?? address.line1) : (address.label ?? address.line1)
    const addressCity = effectiveAddressId === defaultAddress?.id ? defaultAddress.city : address.city

    const custName = profile?.full_name?.trim() || 'Valued Customer'
    const custPhone = profile?.phone?.trim() || ''
    const mechName = assignedMechanic?.full_name || 'Rico Hernandez'
    const mechPhone = assignedMechanic?.phone || '+63 917 555 0192'

    setPendingPayment({
      bookingId: bookingId ?? localRef,
      serviceName: service.name,
      servicePrice: formattedTotalPrice,
      baseServicePrice: formattedBasePrice,
      distanceFee: formattedDistanceFee,
      distanceKm: formattedDistance,
      scheduledAt,
      addressLabel,
      addressCity,
      customerName: custName,
      customerPhone: custPhone,
      mechanicName: mechName,
      mechanicPhone: mechPhone,
    })
    setSubmitting(false)
    goTo('payment')
  }, [
    userId,
    profile,
    service,
    date,
    time,
    address,
    defaultAddress,
    goTo,
    onNotify,
    assignedMechanic,
    totalPricePesos,
    basePriceCents,
    distanceKm,
    formattedBasePrice,
    formattedDistanceFee,
    formattedDistance,
    formattedTotalPrice,
  ])

  // Once a booking is confirmed we render the Confirmed step regardless
  // of the current step value.
  if (confirmedBooking) {
    return (
      <div className={`page mechanic-flow ${scrollRef.className}`} ref={scrollRef.ref}>
        <PageHeading
          eyebrow="MOBILE MECHANIC"
          title="Service confirmed"
          detail="Your booking is in. We'll notify you once your mechanic is dispatched."
        />
        <StepConfirmed
          booking={confirmedBooking}
          onBookAnother={reset}
          onBackToHome={onBackToHome}
        />
      </div>
    )
  }

  return (
    <div className={`page mechanic-flow ${scrollRef.className}`} ref={scrollRef.ref}>
      <PageHeading
        eyebrow="MOBILE MECHANIC"
        title="Book a mechanic"
        detail="Choose a category, pick a service, set a schedule, select your location, and review estimated distance pricing."
      />
      <BookingStepper current={step} onJump={goTo} />

      {step === 'category' && (
        <StepCategory
          services={services}
          loading={servicesLoading}
          source={servicesSource}
          selected={category}
          onSelect={(c) => {
            setCategory(c)
            setService(null) // changing category resets the service
            goNext()
          }}
        />
      )}

      {step === 'service' && (
        <StepService
          services={services}
          loading={servicesLoading}
          category={category}
          selected={service}
          onSelect={(s) => {
            setService(s)
            goNext()
          }}
          onBack={goBack}
        />
      )}

      {step === 'schedule' && (
        <StepSchedule
          service={service}
          date={date}
          time={time}
          onChange={(d, t) => {
            setDate(d)
            setTime(t)
          }}
          onBack={goBack}
          onNext={goNext}
        />
      )}

      {step === 'location' && (
        <StepLocation
          defaultAddress={defaultAddress}
          loading={profileLoading}
          value={address}
          onChange={setAddress}
          onBack={goBack}
          onNext={goNext}
          assignedMechanic={assignedMechanic}
          distanceKm={distanceKm}
          distanceFeePesos={distanceFeePesos}
          formattedDistanceFee={formattedDistanceFee}
          service={service}
        />
      )}

      {step === 'review' && (
        <StepReview
          service={service}
          date={date}
          time={time}
          address={address}
          assignedMechanic={assignedMechanic}
          distanceKm={distanceKm}
          distanceFeePesos={distanceFeePesos}
          formattedDistanceFee={formattedDistanceFee}
          totalPricePesos={totalPricePesos}
          submitting={submitting}
          submitError={submitError}
          onBack={goBack}
          onConfirm={() => void handleConfirm()}
          onJumpTo={goTo}
        />
      )}

      {step === 'payment' && pendingPayment && (
        <StepPayment
          bookingId={pendingPayment.bookingId}
          serviceName={pendingPayment.serviceName}
          servicePrice={pendingPayment.servicePrice}
          baseServicePrice={pendingPayment.baseServicePrice}
          distanceFee={pendingPayment.distanceFee}
          distanceKm={pendingPayment.distanceKm}
          scheduledAt={pendingPayment.scheduledAt}
          addressLabel={pendingPayment.addressLabel}
          addressCity={pendingPayment.addressCity}
          customerName={pendingPayment.customerName}
          customerPhone={pendingPayment.customerPhone}
          mechanicName={pendingPayment.mechanicName}
          mechanicPhone={pendingPayment.mechanicPhone}
          userId={userId}
          onConfirm={(booking) => {
            setConfirmedBooking(booking)
            setPendingPayment(null)
          }}
          onBack={() => goTo('review')}
        />
      )}
    </div>
  )
}
