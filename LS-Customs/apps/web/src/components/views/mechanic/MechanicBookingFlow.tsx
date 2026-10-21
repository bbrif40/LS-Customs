import { useWebsiteText } from "../../../hooks/useWebsiteText"
import { PaymentMethodChoice } from '../../common/PaymentMethodChoice'
import { clearBookingDraft, readBookingDraft, saveBookingDraft } from '../../../utils/bookingDraft'
/**
 * MechanicBookingFlow — orchestrator for the multi-step mechanic booking flow.
 *
 * Owns the form state, validates per step, and renders the active step.
 * Dynamically estimates the customer's distance from the assigned driver / mechanic
 * and calculates the total price by adding the distance travel fee (every 5km is 85 pesos).
 * On confirm, inserts a `service_bookings` row and shows the Confirmed step.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useTransactionTerms } from '../../common/TransactionTerms'
import { verifyServiceLocation } from '../../../utils/serviceLocation'
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
import { getActivePromo, calculatePromoDiscount } from '../../../utils/promoHelper'
import type { PromoVoucher } from '../../common/AvailableVouchersPromos'
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
  initialDate?: string | null
  initialServiceId?: string | null
  initialServicePreview?: boolean
}

function generateLocalRef(): string {
  const tail = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')
  return `LSC-${tail}`
}

function buildScheduledAt(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00+08:00`)
  return d.toISOString()
}

type PendingPayment = {
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
    mechanicName?: string | null
    mechanicPhone?: string | null
    promo?: PromoVoucher | null
    promoDiscount?: string
}
interface MechanicDraft { requestId: string; step: Step; category: string | null; serviceId: string | null; date: string | null; time: string | null; address: ChosenAddress | null; paymentMethod: 'online' | 'cash'; pendingPayment: PendingPayment | null }
export function MechanicBookingFlow({ userId, onNotify, onBackToHome, initialDate, initialServiceId, initialServicePreview = false }: MechanicBookingFlowProps) {
  const websiteText = useWebsiteText("Mechanic")

  const [draft] = useState(() => readBookingDraft<MechanicDraft>(userId, 'mechanic'))
  const reviewTerms = useTransactionTerms()
  useEffect(() => {
    preloadMap()
  }, [])
  const { profile, defaultAddress, loading: profileLoading } = useProfile(userId)
  const { services, loading: servicesLoading, source: servicesSource, error: catalogError, refetch: reloadCatalog } = useServices()
  const scrollRef = useScrollAnimation<HTMLDivElement>()

  const [requestId, setRequestId] = useState(() => draft?.requestId ?? crypto.randomUUID())
  const [step, setStep] = useState<Step>(() => draft && STEP_ORDER.includes(draft.step) ? draft.step : 'category')
  const [category, setCategory] = useState<string | null>(draft?.category ?? null)
  const [service, setService] = useState<Service | null>(null)
  const [showRecommendedService, setShowRecommendedService] = useState(initialServicePreview)
  const appliedInitialService = useRef<string | null>(null)
  const [date, setDate] = useState<string | null>(initialDate ?? draft?.date ?? null) // YYYY-MM-DD
  const [time, setTime] = useState<string | null>(draft?.time ?? null) // HH:MM

  useEffect(() => {
    if (initialDate) {
      setDate(initialDate)
    }
  }, [initialDate])

  useEffect(() => {
    if (initialServiceId && services.length > 0 && appliedInitialService.current !== initialServiceId) {
      const found = services.find(s => s.id === initialServiceId)
      if (found) {
        appliedInitialService.current = initialServiceId
        setCategory(found.category)
        setService(found)
        setStep('schedule')
      }
    }
  }, [initialServiceId, services])
  const [address, setAddress] = useState<ChosenAddress | null>(draft?.address ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>(draft?.paymentMethod === 'cash' ? 'cash' : 'online')
  const [confirmedBooking, setConfirmedBooking] = useState<ServiceBooking | null>(null)
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(draft?.pendingPayment ?? null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const restoredService = useRef(false)
  useEffect(() => {
    if (restoredService.current || servicesLoading || catalogError) return
    restoredService.current = true
    if (draft?.serviceId && !initialServiceId) {
      const current = services.find(item => item.id === draft.serviceId)
      if (current) setService(current)
      else { setStep('service'); setSubmitError('Your previous service is no longer available. Choose another service.') }
    }
  }, [servicesLoading, services, draft, initialServiceId, catalogError])
  useEffect(() => {
    if (!restoredService.current || servicesLoading) return
    if (confirmedBooking) { clearBookingDraft(userId, 'mechanic'); return }
    saveBookingDraft(userId, 'mechanic', { requestId, step,
      category, serviceId: service?.id ?? null, date, time, address, paymentMethod,
      pendingPayment: confirmedBooking ? null : pendingPayment } satisfies MechanicDraft)
  }, [userId, requestId, step, category, service, date, time, address, paymentMethod, pendingPayment, confirmedBooking, servicesLoading])
  useEffect(() => {
    const id = draft?.pendingPayment?.bookingId
    if (!id) return
    let active = true
    void supabase.from('service_bookings').select('id,total_price,payment_method,status').eq('id', id).eq('customer_id', userId!).single().then(({ data, error }) => {
      if (!active) return
      if (error || !data) { setPendingPayment(null); setStep('review'); setSubmitError('The saved checkout could not be restored. Check your bookings before submitting again.'); return }
      setPaymentMethod(data.payment_method === 'cash' ? 'cash' : 'online')
      setPendingPayment(previous => previous ? { ...previous, servicePrice: new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(data.total_price)) } : null)
    })
    return () => { active = false }
  }, [draft, userId])
  // Determine customer coordinates from dropped pin or saved default address
  const customerLat = address?.pin_lat ?? (address?.id === defaultAddress?.id ? defaultAddress?.lat : null) ?? null
  const customerLng = address?.pin_lng ?? (address?.id === defaultAddress?.id ? defaultAddress?.lng : null) ?? null

  // Live distance and travel fee estimation (every 5km is 85 pesos)
  const {
    assignedMechanic,
    distanceKm,
    distanceFeePesos,
    distanceFeeCents,
    formattedDistanceFee,
    formattedDistance,
    loading: quoteLoading,
    error: quoteError,
  } = useMechanicDistance(customerLat, customerLng)

  const activePromo = getActivePromo()
  const basePriceCents = service?.priceCents ?? 0
  const grossPricePesos = (basePriceCents + distanceFeeCents) / 100
  const { discountAmount: promoDiscountPesos, finalTotal: totalPricePesos } = calculatePromoDiscount(grossPricePesos, activePromo, 'services')
  const formattedTotalPrice = `₱${totalPricePesos.toFixed(2)}`
  const formattedBasePrice = `₱${(basePriceCents / 100).toFixed(2)}`
  const promoNote = activePromo && promoDiscountPesos > 0 ? ` | Promo Voucher: ${activePromo.code} (${activePromo.discount})` : ''

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
    setRequestId(crypto.randomUUID())
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
    if (submitting) return
    if (pendingPayment) { setStep('payment'); return }
    if (!service || !date || !time || !address) return

    const looksLikeUuid = typeof service.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.id)
    if (!looksLikeUuid) {
      // eslint-disable-next-line no-console
      console.warn('[mechanic-booking] refusing to confirm: service has no DB id. useServices failed to load rows.')
      setSubmitError('Service catalog is loading. Please refresh and try again.')
      return
    }

    const hasPin = address.pin_lat != null && address.pin_lng != null
    const effectiveAddressId = address.id ?? null
    if (!effectiveAddressId && !hasPin) {
      setSubmitError('Please pick a saved address or drop a pin on the map before confirming.')
      return
    }
    if (quoteLoading || quoteError || customerLat == null || customerLng == null) {
      setSubmitError(quoteError ?? 'Confirm a location and wait for travel pricing before continuing.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const scheduledAt = buildScheduledAt(date, time)
    const localRef = generateLocalRef()

    // Persist the booking and its selected service as one customer flow.
    let bookingId: string | null = null
    let status: ServiceBooking['status'] = 'pending'
    let serverTotal = totalPricePesos

    try {
      if (!await reviewTerms(requestId, 'service')) { setSubmitting(false); return }
      const locationCheck = await verifyServiceLocation(customerLat!, customerLng!)
      const { data, error: insertError } = await supabase.rpc('create_service_booking', {
        p_request_id: requestId, p_service_id: service.id, p_scheduled_at: scheduledAt,
        p_address_id: address.source === 'default' ? effectiveAddressId : null,
        p_lat: address.source !== 'default' && hasPin ? address.pin_lat : null, p_lng: address.source !== 'default' && hasPin ? address.pin_lng : null,
        p_notes: 'Address: ' + address.line1 + ', ' + address.city,
        p_promo_code: activePromo?.code ?? null,
        p_payment_method: paymentMethod,
        p_location_check: locationCheck,
      })
      if (insertError) throw insertError
      if (!data?.id) throw new Error('Booking was not created')
      bookingId = data.id
      status = data.status as ServiceBooking['status']
      serverTotal = Number(data.total_price)
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
    const mechName = assignedMechanic?.full_name ?? null
    const mechPhone = assignedMechanic?.phone ?? null

    setPendingPayment({
      bookingId: bookingId ?? localRef,
      serviceName: service.name,
      servicePrice: `₱${serverTotal.toFixed(2)}`,
      baseServicePrice: formattedBasePrice,
      distanceFee: formattedDistanceFee,
      distanceKm: formattedDistance,
      scheduledAt,
      addressLabel,
      addressCity,
      customerName: custName,
      customerPhone: custPhone,
      mechanicName: null,
      mechanicPhone: null,
      promo: promoDiscountPesos > 0 ? activePromo : null,
      promoDiscount: promoDiscountPesos > 0 ? `-₱${promoDiscountPesos.toFixed(2)}` : undefined,
    })
    setSubmitting(false)
    goTo('payment')
  }, [
    requestId, submitting, pendingPayment, activePromo, quoteLoading, quoteError, customerLat, customerLng, paymentMethod, reviewTerms,
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
          eyebrow={websiteText("MOBILE MECHANIC")}
          title={websiteText("Service confirmed")}
          detail={websiteText("Your booking is in. We'll notify you once your mechanic is dispatched.")}
        />
        <StepConfirmed
          booking={confirmedBooking}
          promoCode={activePromo?.code ?? null}
          promoDiscount={activePromo?.discount ?? null}
          onBookAnother={reset}
          onBackToHome={onBackToHome}
        />
      </div>
    )
  }

  if (showRecommendedService) {
    const recommended = services.find(item => item.id === initialServiceId)
    return (
      <div className={`page mechanic-flow ${scrollRef.className}`} ref={scrollRef.ref}>
        <section className="page-heading"><div><h1>{recommended?.name || websiteText("Recommended mechanic service")}</h1><p className="muted">{websiteText("Review the service before choosing a schedule. AI guidance is not a confirmed diagnosis.")}</p></div></section>
        {servicesLoading ? <p role="status">{websiteText("Loading current service details…")}</p> : catalogError ? (
          <p role="alert">{websiteText("We couldn’t load this service.")} <button type="button" onClick={() => void reloadCatalog()}>{websiteText("Retry")}</button></p>
        ) : recommended ? (
          <section className="assistant-service-preview" aria-label={websiteText("Service details")}>
            <p>{recommended.description || websiteText("A mobile mechanic will inspect your vehicle and explain the work needed. Confirm the scope with your mechanic before repairs.")}</p>
            <dl><div><dt>{websiteText("Base service price")}</dt><dd>{recommended.price}</dd></div><div><dt>{websiteText("Estimated duration")}</dt><dd>{recommended.duration}</dd></div></dl>
            <p>{websiteText("Travel fees and any additional work are reviewed separately. This recommendation has not created a booking.")}</p>
            <div className="assistant-service-actions">
              <button type="button" className="outline-button" onClick={() => { setShowRecommendedService(false); setStep('category'); setService(null); setCategory(null) }}>{websiteText("Browse other services")}</button>
              <button type="button" className="button dark-button" onClick={() => { setService(recommended); setCategory(recommended.category); setShowRecommendedService(false); setStep('schedule') }}>{websiteText("Choose a schedule")}</button>
            </div>
          </section>
        ) : <p role="alert">{websiteText("This service is no longer available.")} <button type="button" onClick={() => { setShowRecommendedService(false); setStep('category') }}>{websiteText("Browse current services")}</button></p>}
      </div>
    )
  }

  return (
    <div className={`page mechanic-flow ${scrollRef.className}`} ref={scrollRef.ref}>
      {catalogError && <p role="alert">{websiteText("The service catalog could not be loaded.")} <button type="button" onClick={() => void reloadCatalog()}>{websiteText("Retry")}</button></p>}
      <PageHeading
        eyebrow={websiteText("MOBILE MECHANIC")}
        title={websiteText("Book a mechanic")}
        detail={websiteText("Choose a category, pick a service, set a schedule, select your location, and review estimated distance pricing.")}
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
        <PaymentMethodChoice value={paymentMethod} onChange={setPaymentMethod} />
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
          promo={activePromo}
          promoDiscountPesos={promoDiscountPesos}
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
          promo={pendingPayment.promo}
          promoDiscount={pendingPayment.promoDiscount}
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
          onRestart={() => { setPendingPayment(null); setRequestId(crypto.randomUUID()); goTo('review') }}
          onBack={() => goTo('review')}
        />
      )}
    </div>
  )
}
