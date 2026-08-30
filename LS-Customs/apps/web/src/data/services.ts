/**
 * Service catalog data.
 * Static demo data for the MVP mechanic service catalog.
 * Uses Unicode glyphs for icons — matches the original design language.
 */
import type { Service } from '../types'

export const services: Service[] = [
  { name: 'Full Synthetic Oil Change', category: 'Routine Fluid', price: '$89.99', duration: '45 mins', icon: '◒' },
  { name: 'Coolant Flush', category: 'Routine Fluid', price: '$120.00', duration: '60 mins', icon: '◌' },
  { name: 'Tire Rotation', category: 'Tire & Wheel', price: '$35.00', duration: '30 mins', icon: '◉' },
  { name: 'Brake Pad Replacement', category: 'Brake Services', price: '$180.00', duration: '1.5 hrs', icon: '✦' },
  { name: 'Wheel Alignment', category: 'Tire & Wheel', price: '$95.00', duration: '60 mins', icon: '⊙' },
  { name: 'Battery Diagnostics', category: 'Electrical', price: '$45.00', duration: '30 mins', icon: '⚡' },
  { name: 'Alternator Check', category: 'Electrical', price: '$65.00', duration: '45 mins', icon: '⎔' },
  { name: 'Engine Diagnostics', category: 'Diagnostics', price: '$110.00', duration: '75 mins', icon: '⌁' },
  { name: 'Air Filter Replacement', category: 'Routine Fluid', price: '$40.00', duration: '25 mins', icon: '≋' },
  { name: 'Headlight Restoration', category: 'Lighting', price: '$75.00', duration: '60 mins', icon: '✧' },
  { name: 'Windshield Wiper Service', category: 'Quick Fixes', price: '$30.00', duration: '20 mins', icon: '⌒' },
  { name: 'Suspension Inspection', category: 'Tire & Wheel', price: '$85.00', duration: '50 mins', icon: '⌇' },
]

/** Convenience: first N services for landing page previews. */
export const featuredServices = services.slice(0, 3)
