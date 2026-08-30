/**
 * MechanicServices — service catalog with category tabs and emergency dispatch card.
 */
import { ChevronRight, Package, Clock3, Wrench, Plus } from 'lucide-react'
import { services } from '../../data/services'
import { PageHeading } from '../common/PageHeading'

interface MechanicServicesProps {
  cartCount: number
  onAdd: (name: string) => void
  onNotify: (message: string) => void
}

export function MechanicServices({ cartCount, onAdd, onNotify }: MechanicServicesProps) {
  return (
    <div className="page">
      <PageHeading
        eyebrow="MOBILE MECHANIC"
        title="Care that comes to you"
        detail="Select the required services. A certified mobile mechanic will be dispatched to your location."
        action={
          <button
            className="cart-button"
            onClick={() => onNotify(`${cartCount} service${cartCount > 1 ? 's' : ''} in your cart`)}
          >
            <Package size={17} /> Service cart <b>{cartCount}</b>
          </button>
        }
      />
      <div className="service-layout">
        <div className="service-list">
          <div className="category-tabs">
            <button className="active">All services</button>
            <button>Routine Fluid</button>
            <button>Tire & Wheel</button>
            <button>Electrical</button>
            <button>Diagnostics</button>
          </div>
          {services.map((service) => (
            <article className="service-row" key={service.name}>
              <div className="service-row-icon">{service.icon}</div>
              <div className="service-row-copy">
                <span className="eyebrow">{service.category}</span>
                <h3>{service.name}</h3>
                <p>Professional service performed at your location, with transparent pricing.</p>
                <small>
                  <Clock3 size={13} /> Est. {service.duration}
                </small>
              </div>
              <div className="service-row-price">
                <strong>{service.price}</strong>
                <button className="small-button" onClick={() => onAdd(service.name)}>
                  Add <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <aside className="dispatch-card">
          <div className="dispatch-icon">
            <Wrench size={20} />
          </div>
          <p className="eyebrow">NEED HELP NOW?</p>
          <h3>Emergency mechanic</h3>
          <p>Mike R. is available 3.2 mi away and can reach you in about 12 minutes.</p>
          <div className="mechanic-mini">
            <div className="avatar mechanic-avatar">MR</div>
            <div>
              <strong>Mike Reynolds</strong>
              <span>Master Technician · 4.9 ★</span>
            </div>
            <span className="online-dot" />
          </div>
          <button
            className="button dark-button full"
            onClick={() => onNotify('Emergency mechanic request started')}
          >
            Request dispatch <ChevronRight size={16} />
          </button>
        </aside>
      </div>
    </div>
  )
}
