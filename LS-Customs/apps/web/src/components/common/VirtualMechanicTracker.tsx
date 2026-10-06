import { Navigation, Phone } from 'lucide-react'
export interface VirtualMechanicTrackerProps {
  status: string; mechanicName?: string | null; mechanicPhone?: string | null
  customerLocation?: { lat: number; lng: number } | null; customerAddress?: string | null
  initialDistanceKm?: number; etaMinutes?: number; unitName?: string; isLightMode?: boolean
}
/** Show recorded status only. GPS speed, routes and ETA require real telemetry. */
export function VirtualMechanicTracker({ status, mechanicName, mechanicPhone, customerAddress, isLightMode }: VirtualMechanicTrackerProps) {
  return <section className={`virtual-gps-tracker-card ${isLightMode ? 'light-theme' : 'dark-theme'}`} aria-label="Mechanic booking status">
    <div className="gps-map-header"><Navigation size={18} /><strong>{status.replace(/_/g, ' ').toUpperCase()}</strong></div>
    <div style={{ padding: 20 }}>
      <p>{mechanicName || 'Awaiting mechanic assignment'}</p>
      {customerAddress && <p>Service destination: {customerAddress}</p>}
      <p>Live vehicle telemetry and an arrival estimate are currently unavailable. Check the booking status or contact your assigned mechanic.</p>
      {mechanicPhone && <a href={`tel:${mechanicPhone.replace(/[^+\d]/g, '')}`}><Phone size={14} /> Call mechanic</a>}
    </div>
  </section>
}
