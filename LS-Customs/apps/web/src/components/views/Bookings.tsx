/**
 * Bookings — active and completed booking cards with progress indicators.
 *
 * The "View live map" button on the mechanic service card opens a modal
 * with a small Leaflet map. The page itself is still mock data — when a
 * real `useCustomerServiceBookings` hook exists, swap the hard-coded pin
 * for the active booking's coordinates.
 */
import { useState } from 'react'
import { ChevronRight, CarFront, Wrench, Plus, X } from 'lucide-react'
import { PageHeading } from '../common/PageHeading'
import { MapView } from '../common/map'

interface BookingsProps {
  onNotify: (message: string) => void
}

export function Bookings({ onNotify }: BookingsProps) {
  const [liveMapOpen, setLiveMapOpen] = useState(false)

  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR ACTIVITY"
        title="Bookings & progress"
        detail="Keep an eye on your rentals and mobile service appointments."
        action={
          <button className="button dark-button" onClick={() => onNotify('New booking flow opened')}>
            <Plus size={16} /> New booking
          </button>
        }
      />
      <div className="booking-tabs">
        <button className="active">
          Active <b>2</b>
        </button>
        <button>Completed</button>
        <button>All history</button>
      </div>
      <div className="booking-grid">
        <article className="booking-card active-booking">
          <div className="booking-card-head">
            <div>
              <span className="status-pill green">EN ROUTE</span>
              <p>Booking #LSC-8892 · Oct 12 - Oct 15</p>
            </div>
            <CarFront size={22} />
          </div>
          <h3>Audi A4 Premium</h3>
          <p className="muted">Los Santos International Airport · Pickup 10:00 AM</p>
          <div className="booking-progress">
            <span className="done" />
            <span className="done" />
            <span className="current" />
            <span />
            <span />
          </div>
          <div className="progress-labels">
            <small>Confirmed</small>
            <small>Ready</small>
            <small>En route</small>
            <small>Returned</small>
          </div>
          <button className="text-button" onClick={() => onNotify('Opening rental details')}>
            Manage rental <ChevronRight size={15} />
          </button>
        </article>

        <article className="booking-card">
          <div className="booking-card-head">
            <div>
              <span className="status-pill amber">IN PROGRESS</span>
              <p>Service booking · Today</p>
            </div>
            <Wrench size={22} />
          </div>
          <h3>Brake pad replacement</h3>
          <p className="muted">Home driveway · 123 Main St</p>
          <div className="mechanic-mini">
            <div className="avatar mechanic-avatar">MR</div>
            <div>
              <strong>Mike Reynolds</strong>
              <span>ETA: 15 mins · 3.2 mi away</span>
            </div>
          </div>
          <div className="booking-actions">
            <button className="outline-button" onClick={() => onNotify('Calling Mike Reynolds')}>
              Call
            </button>
            <button className="button dark-button" onClick={() => setLiveMapOpen(true)}>
              View live map
            </button>
          </div>
        </article>

        <div className="recent-activity">
          <div>
            <p className="eyebrow">RECENT ACTIVITY</p>
            <h2>Rental return: Schafter V12</h2>
            <p className="muted">Vehicle returned successfully. Invoice #8849 generated.</p>
          </div>
          <button className="text-button" onClick={() => onNotify('Viewing invoice history')}>
            View all history <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {liveMapOpen && (
        <div className="map-modal-backdrop" onClick={() => setLiveMapOpen(false)}>
          <div className="map-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Live service tracking</h3>
              <button
                type="button"
                onClick={() => setLiveMapOpen(false)}
                aria-label="Close live map"
              >
                <X size={18} />
              </button>
            </header>
            {/* TODO: replace with useCustomerServiceBookings().activeBooking coords. */}
            <MapView
              pins={[
                {
                  id: 'active',
                  lat: 34.0407,
                  lng: -118.2468,
                  title: 'Brake pad replacement',
                  description: 'Mike Reynolds · 3.2 mi away',
                },
              ]}
              center={{ lat: 34.0407, lng: -118.2468 }}
              zoom={15}
              height={420}
            />
            <footer>
              <small>Pin updates every 30s once live tracking is enabled.</small>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
