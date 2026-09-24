/**
 * AdminFleet — Fleet Management page with full CRUD.
 * Uses real Supabase data via useAdminVehicles hook.
 * Admins can see all vehicles (including inactive), create, edit, and deactivate.
 */
import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, X, Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { carSportOutline, checkmarkCircleOutline, warningOutline } from 'ionicons/icons'
import { useAdminVehicles, createVehicle, updateVehicle, deactivateVehicle } from '../../hooks/useAdminData'
import type { Vehicle } from '@ls-customs/shared-types'

export type RentalCategory =
  | 'hybrid_ev'
  | 'hatchbacks'
  | 'sedans'
  | 'minivans'
  | 'suvs'
  | 'van'
  | 'pickup_trucks'
  | string

export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'hybrid_ev', label: 'Hybrid EV' },
  { id: 'hatchbacks', label: 'Hatchbacks' },
  { id: 'sedans', label: 'Sedans' },
  { id: 'minivans', label: 'Minivans' },
  { id: 'suvs', label: 'SUVs' },
  { id: 'van', label: 'Van' },
  { id: 'pickup_trucks', label: 'Pick Up Trucks' },
]

export const getCategoryLabel = (cat?: string | null) => {
  if (!cat) return 'Uncategorized'
  const found = CATEGORIES.find((c) => c.id === cat)
  if (found) return found.label
  return String(cat).replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT'] as const
const FUEL_TYPES = ['Gasoline', 'Diesel', 'Electric', 'Hybrid'] as const

interface VehicleFormData {
  category: RentalCategory
  sub_category: string
  name: string
  description: string
  seats: number
  transmission: string
  fuel_type: string
  price_per_day: number
  image_url: string
  gallery_urls: string[]
  location: string
  host_name: string
  host_rating: number
  features: string[]
  rental_rules: string[]
  mileage_policy: string
  max_trip: string
  delivery_methods: string[]
  is_active: boolean
}

const initialFormData: VehicleFormData = {
  category: 'hybrid_ev',
  sub_category: '',
  name: '',
  description: '',
  seats: 5,
  transmission: 'Automatic',
  fuel_type: 'Gasoline',
  price_per_day: 0,
  image_url: '',
  gallery_urls: [],
  location: '',
  host_name: '',
  host_rating: 0,
  features: [],
  rental_rules: [],
  mileage_policy: '',
  max_trip: '',
  delivery_methods: [],
  is_active: true,
}

const listValue = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)
const listText = (value: string[]) => value.join('\n')

export function AdminFleet() {
  const { data: vehicles, loading, error, refetch } = useAdminVehicles()
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [formData, setFormData] = useState<VehicleFormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Filter vehicles client-side
  const filteredVehicles = vehicles?.filter((v) => {
    if (activeFilter === 'active' && !v.is_active) return false
    if (activeFilter === 'inactive' && v.is_active) return false
    if (selectedCategory !== 'all' && v.category !== selectedCategory) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!v.name.toLowerCase().includes(q) && !(v.sub_category || '').toLowerCase().includes(q)) return false
    }
    return true
  }) || []

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedVehicles = filteredVehicles.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Stats calculation
  const totalVehicles = vehicles?.length || 0
  const activeVehicles = vehicles?.filter(v => v.is_active).length || 0
  const inactiveVehicles = totalVehicles - activeVehicles

  const openCreateModal = () => {
    setEditingVehicle(null)
    setFormData(initialFormData)
    setSubmitError(null)
    setShowModal(true)
  }

  const openEditModal = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle)
    setFormData({
      category: vehicle.category,
      sub_category: vehicle.sub_category,
      name: vehicle.name,
      description: vehicle.description || '',
      seats: vehicle.seats || 5,
      transmission: vehicle.transmission || 'Automatic',
      fuel_type: vehicle.fuel_type || 'Gasoline',
      price_per_day: vehicle.price_per_day,
      image_url: vehicle.image_url || '',
      gallery_urls: vehicle.gallery_urls || [],
      location: vehicle.location || '',
      host_name: vehicle.host_name || '',
      host_rating: vehicle.host_rating || 0,
      features: vehicle.features || [],
      rental_rules: vehicle.rental_rules || [],
      mileage_policy: vehicle.mileage_policy || '',
      max_trip: vehicle.max_trip || '',
      delivery_methods: vehicle.delivery_methods || [],
      is_active: vehicle.is_active,
    })
    setSubmitError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingVehicle(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, formData)
      } else {
        await createVehicle(formData)
      }
      await refetch()
      closeModal()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save vehicle')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (vehicle: Vehicle) => {
    if (!window.confirm(`Deactivate "${vehicle.name}"? This will hide it from the public catalog but preserve existing bookings.`)) {
      return
    }
    try {
      await deactivateVehicle(vehicle.id)
      await refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate vehicle')
    }
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading fleet data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load vehicles</div>
        <p style={{ color: 'var(--admin-muted)', marginTop: 8 }}>{error}</p>
        <button onClick={refetch} className="admin-add-btn" style={{ marginTop: 16 }}>
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
          <h1>Fleet Management</h1>
          <p>Oversee and manage the complete vehicle roster.</p>
        </div>
        <button className="admin-add-btn" onClick={openCreateModal}>
          <Plus size={16} /> Add New Vehicle
        </button>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="admin-stats-row three">
        {[
          { label: 'Total Vehicles', value: totalVehicles, icon: 'total' },
          { label: 'Active', value: activeVehicles, icon: 'active' },
          { label: 'Inactive', value: inactiveVehicles, icon: 'inactive' },
        ].map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'total' && <IonIcon icon={carSportOutline} style={{ fontSize: 20 }} />}
                {stat.icon === 'active' && <IonIcon icon={checkmarkCircleOutline} style={{ fontSize: 20 }} />}
                {stat.icon === 'inactive' && <IonIcon icon={warningOutline} style={{ fontSize: 20 }} />}
              </div>
            </div>
            <div className="admin-stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Row ───────────────────────────────────────── */}
      <div className="admin-filter-row">
        {['all', 'active', 'inactive'].map((f) => (
          <button
            key={f}
            className={`admin-filter-btn ${activeFilter === f ? 'active' : ''}`}
            onClick={() => {
              setActiveFilter(f as 'all' | 'active' | 'inactive')
              setCurrentPage(1)
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} Vehicles
          </button>
        ))}
        <div className="admin-fleet-search">
          <Search size={14} style={{ color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search fleet..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>
      </div>

      {/* ── Category Filter Pills ────────────────────────────── */}
      <div className="admin-filter-row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap', borderTop: '1px solid #2d3748', paddingTop: 10 }}>
        <button
          className={`admin-filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => {
            setSelectedCategory('all')
            setCurrentPage(1)
          }}
          style={{ fontSize: 12, padding: '4px 10px' }}
        >
          All Categories ({totalVehicles})
        </button>
        {CATEGORIES.map((c) => {
          const count = vehicles?.filter((v) => v.category === c.id).length || 0
          return (
            <button
              key={c.id}
              className={`admin-filter-btn ${selectedCategory === c.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory(c.id)
                setCurrentPage(1)
              }}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {c.label} ({count})
            </button>
          )
        })}
      </div>

      {/* ── Vehicle Cards ────────────────────────────────────── */}
      <div className="admin-vehicle-grid">
        {filteredVehicles.length === 0 ? (
          <div className="admin-empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}>
            No vehicles found. <button onClick={openCreateModal} style={{ color: '#e8a838', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add the first vehicle</button>
          </div>
        ) : (
          paginatedVehicles.map((vehicle) => (
            <div className="admin-vehicle-card" key={vehicle.id}>
              {/* Vehicle Image */}
              <div className="admin-vehicle-image">
                {vehicle.image_url ? (
                  <img src={vehicle.image_url} alt={vehicle.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px 8px 0 0' }} />
                ) : (
                  <div className="admin-vehicle-image-bg" style={{ background: '#1a1f2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IonIcon icon={carSportOutline} style={{ fontSize: 44, color: 'var(--admin-muted, #9ca3af)' }} />
                  </div>
                )}
                {!vehicle.is_active && (
                  <span className="admin-vehicle-status-badge inactive" style={{ background: '#ef4444' }}>
                    Inactive
                  </span>
                )}
              </div>

              {/* Vehicle Info */}
              <div className="admin-vehicle-info">
                <div className="admin-vehicle-name-row">
                  <span className="admin-vehicle-name">{vehicle.name}</span>
                  <span className="admin-vehicle-plate">{getCategoryLabel(vehicle.category)} • {vehicle.sub_category}</span>
                </div>
                <div className="admin-vehicle-type">
                  {vehicle.seats} seats • {vehicle.transmission} • {vehicle.fuel_type}
                </div>

                <div className="admin-vehicle-details">
                  <div className="admin-vehicle-detail">
                    <label>Price/Day</label>
                    <span>₱{vehicle.price_per_day.toLocaleString()}</span>
                  </div>
                  <div className="admin-vehicle-detail">
                    <label>Status</label>
                    <span style={{ color: vehicle.is_active ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {vehicle.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="admin-vehicle-detail">
                    <label>Rating</label>
                    <span>{vehicle.rating_avg} ({vehicle.rating_count} reviews)</span>
                  </div>
                </div>

                <div className="admin-vehicle-actions">
                  <button className="admin-vehicle-btn primary" onClick={() => openEditModal(vehicle)}>
                    <Edit size={13} /> Edit
                  </button>
                  <button
                    className="admin-vehicle-btn secondary"
                    onClick={() => handleDeactivate(vehicle)}
                    disabled={!vehicle.is_active}
                    style={{ opacity: vehicle.is_active ? 1 : 0.5 }}
                  >
                    <Trash2 size={13} /> Deactivate
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Pagination Bar ───────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="admin-transactions-pagination" style={{ marginTop: 20 }}>
          <span>
            Showing {((safePage - 1) * pageSize) + 1} to {Math.min(safePage * pageSize, filteredVehicles.length)} of {filteredVehicles.length} vehicles
          </span>
          <div className="admin-pagination-btns">
            <button
              className="admin-pagination-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--admin-muted)', fontSize: 13, fontWeight: 500 }}>
              Page {safePage} of {totalPages}
            </span>
            <button
              className="admin-pagination-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal ────────────────────────────────── */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>{editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</h2>
              <button className="admin-modal-close" onClick={closeModal}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {submitError && (
                <div className="admin-modal-error">{submitError}</div>
              )}
              <div className="admin-modal-body">
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as RentalCategory })}
                      required
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-form-field">
                    <label>Sub-Category</label>
                    <input
                      type="text"
                      value={formData.sub_category}
                      onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                      placeholder="e.g., Luxury Sedan"
                      required
                    />
                  </div>
                </div>
                <div className="admin-form-field">
                  <label>Gallery Image URLs</label>
                  <textarea value={listText(formData.gallery_urls)} onChange={(e) => setFormData({ ...formData, gallery_urls: listValue(e.target.value) })} placeholder="One image URL per line" rows={3} />
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Location</label>
                    <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Imus, Cavite" />
                  </div>
                  <div className="admin-form-field">
                    <label>Host Name</label>
                    <input type="text" value={formData.host_name} onChange={(e) => setFormData({ ...formData, host_name: e.target.value })} placeholder="LS Customs" />
                  </div>
                  <div className="admin-form-field">
                    <label>Host Rating</label>
                    <input type="number" value={formData.host_rating} onChange={(e) => setFormData({ ...formData, host_rating: parseFloat(e.target.value) || 0 })} min={0} max={5} step={0.1} />
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Features</label>
                    <textarea value={listText(formData.features)} onChange={(e) => setFormData({ ...formData, features: listValue(e.target.value) })} placeholder="Bluetooth\nBackup camera" rows={3} />
                  </div>
                  <div className="admin-form-field">
                    <label>Rental Rules</label>
                    <textarea value={listText(formData.rental_rules)} onChange={(e) => setFormData({ ...formData, rental_rules: listValue(e.target.value) })} placeholder="No off-roading\nNo littering" rows={3} />
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Mileage Policy</label>
                    <input type="text" value={formData.mileage_policy} onChange={(e) => setFormData({ ...formData, mileage_policy: e.target.value })} placeholder="Unlimited mileage" />
                  </div>
                  <div className="admin-form-field">
                    <label>Maximum Trip</label>
                    <input type="text" value={formData.max_trip} onChange={(e) => setFormData({ ...formData, max_trip: e.target.value })} placeholder="1 month maximum trip" />
                  </div>
                </div>
                <div className="admin-form-field">
                  <label>Delivery Methods</label>
                  <textarea value={listText(formData.delivery_methods)} onChange={(e) => setFormData({ ...formData, delivery_methods: listValue(e.target.value) })} placeholder="Pickup\nHome delivery" rows={2} />
                </div>
                <div className="admin-form-field">
                  <label>Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Enus Deity"
                    required
                  />
                </div>
                <div className="admin-form-field">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Vehicle description..."
                    rows={3}
                  />
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Seats</label>
                    <input
                      type="number"
                      value={formData.seats}
                      onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) || 0 })}
                      min={1}
                      max={10}
                      required
                    />
                  </div>
                  <div className="admin-form-field">
                    <label>Transmission</label>
                    <select
                      value={formData.transmission}
                      onChange={(e) => setFormData({ ...formData, transmission: e.target.value })}
                    >
                      {TRANSMISSIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="admin-form-field">
                    <label>Fuel Type</label>
                    <select
                      value={formData.fuel_type}
                      onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                    >
                      {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Price Per Day (₱)</label>
                    <input
                      type="number"
                      value={formData.price_per_day}
                      onChange={(e) => setFormData({ ...formData, price_per_day: parseFloat(e.target.value) || 0 })}
                      min={0}
                      step={0.01}
                      required
                    />
                  </div>
                  <div className="admin-form-field">
                    <label>Image URL</label>
                    <input
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      placeholder="https://..."
                    />
                    {formData.image_url && (
                      <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', maxHeight: 120, background: '#f1f5f9' }}>
                        <img
                          src={formData.image_url}
                          alt="Preview"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'block' }}
                          style={{ display: 'none', width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="admin-form-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    Active (visible in public catalog)
                  </label>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-modal-btn secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="admin-modal-btn primary" disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="spin" /> : editingVehicle ? 'Update Vehicle' : 'Create Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}