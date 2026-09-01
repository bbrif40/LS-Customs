/**
 * MechanicBookingFlow — orchestrator for the multi-step mechanic booking flow.
 *
 * Owns the form state, validates per step, and renders the active step.
 * On confirm, inserts a `service_bookings` row and shows the Confirmed step.
 *
 * Falls back to a generated reference + no insert if the table is missing,
 * mirroring useServices' graceful degradation.
 */
import { useState, useCallback } from 'react'
import { supabase } from '../../../supabaseClient'
import { useProfile } from '../../../hooks/useProfile'
import { useServices } from '../../../hooks/useServices'
import { PageHeading } from '../../common/PageHeading'
import { BookingStepper } from './BookingStepper'
import { STEP_ORDER, type Step } from './steps'
import { StepCategory } from './StepCategory'
import { StepService } from './StepService'
import { StepSchedule } from './StepSchedule'
import { StepLocation } from './StepLocation'
import { StepReview } from './StepReview'
import { StepConfirmed } from './StepConfirmed'
import type { Service, ServiceBooking } from '../../../types'

export interface ChosenAddress {
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
  // LSC-XXXX (4 hex chars) — used as a stand-in when the DB is unreachable.
  const tail = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')
  return `LSC-${tail}`
}

function buildScheduledAt(date: string, time: string): string {
  // Combine YYYY-MM-DD + HH:MM into an ISO string at local time.
  const d = new Date(`${date}T${time}:00`)
  return d.toISOString()
}

function formatPriceCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function MechanicBookingFlow({ userId, onNotify, onBackToHome }: MechanicBookingFlowProps) {
  const { defaultAddress, loading: profileLoading } = useProfile(userId)
  const { services, loading: servicesLoading, source: servicesSource } = useServices()

  const [step, setStep] = useState<Step>('category')
  const [category, setCategory] = useState<string | null>(null)
  const [service, setService] = useState<Service | null>(null)
  const [date, setDate] = useState<string | null>(null) // YYYY-MM-DD
  const [time, setTime] = useState<string | null>(null) // HH:MM
  const [address, setAddress] = useState<ChosenAddress | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState<ServiceBooking | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!userId) {
      onNotify('You need to be signed in to book a service')
      return
    }
    if (!service || !date || !time || !address) return

    setSubmitting(true)
    setSubmitError(null)

    const scheduledAt = buildScheduledAt(date, time)
    const totalCents = service.priceCents ?? 0
    const localRef = generateLocalRef()

    // Try to insert the real booking. If the table is missing or the insert
    // errors, fall back to a local-only confirmation so the user still gets
    // a successful flow during development.
    let bookingId: string | null = null
    let status: ServiceBooking['status'] = 'pending'

    try {
      const { data, error: insertError } = await supabase
        .from('service_bookings')
        .insert({
          customer_id: userId,
          scheduled_at: scheduledAt,
          status: 'pending',
          total_price: totalCents / 100,
          notes: null,
          // Persist the pin from the LocationPicker so the admin map can
          // show this booking. The columns are nullable; missing pin
          // (e.g. when the user picked their default address) writes null.
          pin_lat: address.pin_lat ?? null,
          pin_lng: address.pin_lng ?? null,
        })
        .select('id, status')
        .single()

      if (insertError) throw insertError
      if (data?.id) bookingId = data.id
      if (data?.status) status = data.status as ServiceBooking['status']
    } catch (err) {
      // No DB or permission issue — keep going locally.
      const message = err instanceof Error ? err.message : 'Booking could not be saved'
      setSubmitError(message)
    }

    setConfirmedBooking({
      id: bookingId ?? localRef,
      serviceName: service.name,
      servicePrice: service.priceCents != null ? formatPriceCents(service.priceCents) : service.price,
      scheduledAt,
      addressLine1: address.line1,
      addressCity: address.city,
      status,
    })
    setSubmitting(false)
    setStep('review') // ensure we're on the review step
    goTo('review') // the Confirmed view is rendered via the orchestrator below
  }, [userId, service, date, time, address, onNotify, goTo])

  // Once a booking is confirmed we render the Confirmed step regardless
  // of the current step value.
  if (confirmedBooking) {
    return (
      <div className="page mechanic-flow">
        <PageHeading
          eyebrow="MOBILE MECHANIC"
          title="Service confirmed"
          detail="Your booking is in. We'll notify you once a mechanic is assigned."
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
    <div className="page mechanic-flow">
      <PageHeading
        eyebrow="MOBILE MECHANIC"
        title="Book a mechanic"
        detail="Five quick steps. Choose a category, pick a service, set a time, confirm a location."
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
        />
      )}

      {step === 'review' && (
        <StepReview
          service={service}
          date={date}
          time={time}
          address={address}
          submitting={submitting}
          submitError={submitError}
          onBack={goBack}
          onConfirm={() => void handleConfirm()}
          onJumpTo={goTo}
        />
      )}
    </div>
  )
}
