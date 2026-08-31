/**
 * Shared step definitions for the mechanic booking flow.
 * Imported by BookingStepper and MechanicBookingFlow so they cannot drift.
 */
export type Step = 'category' | 'service' | 'schedule' | 'location' | 'review'

export const STEP_ORDER: Step[] = ['category', 'service', 'schedule', 'location', 'review']

export const STEP_LABEL: Record<Step, string> = {
  category: 'Category',
  service: 'Service',
  schedule: 'Schedule',
  location: 'Location',
  review: 'Review',
}
