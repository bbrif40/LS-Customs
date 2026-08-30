/**
 * AdminFleet — Fleet Management page with full CRUD.
 * Uses real Supabase data via useAdminVehicles hook.
 * Admins can see all vehicles (including inactive), create, edit, and deactivate.
 */
import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, X, Check, Loader2 } from 'lucide-react'
import { useAdminVehicles, createVehicle, updateVehicle, deactivateVehicle } from '../../hooks/useAdminData'
import type { Vehicle } from '@ls-customs/shared-types'

type RentalCategory = 'short_term' | 'extended' | 'premium'

const CATEGORIES: RentalCategory[] = ['short_term', 'extended', 'premium']
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
  is_active: boolean
}

const initialFormData: VehicleFormData = {
  category: 'short_term',
  sub_category: '',
  name: '',
  description: '',
  seats: 5,
  transmission: 'Automatic',
  fuel_type: 'Gasoline',
  price_per_day: 0,
  image_url: '',
  is_active: true,
}

export function AdminFleet() {
  const { data: vehicles, loading, error, refetch } = useAdminVehicles()
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [formData, setFormData] = useState<VehicleFormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Filter vehicles client-side
  const filteredVehicles = vehicles?.filter((v) => {
    if (activeFilter === 'active' && !v.is_active) return false
    if (activeFilter === 'inactive' && v.is_active) return false
    if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  }) || []

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
                {stat.icon === 'total' && '🚙'}
                {stat.icon === 'active' && '✅'}
                {stat.icon === 'inactive' && '⚠'}
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
            onClick={() => setActiveFilter(f as 'all' | 'active' | 'inactive')}
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
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Vehicle Cards ────────────────────────────────────── */}
      <div className="admin-vehicle-grid">
        {filteredVehicles.length === 0 ? (
          <div className="admin-empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}>
            No vehicles found. <button onClick={openCreateModal} style={{ color: '#e8a838', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add the first vehicle</button>
          </div>
        ) : (
          filteredVehicles.map((vehicle) => (
            <div className="admin-vehicle-card" key={vehicle.id}>
              {/* Vehicle Image */}
              <div className="admin-vehicle-image">
                {vehicle.image_url ? (
                  <img src={vehicle.image_url} alt={vehicle.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px 8px 0 0' }} />
                ) : (
                  <div className="admin-vehicle-image-bg" style={{ background: '#1a1f2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    🚗
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
                  <span className="admin-vehicle-plate">{vehicle.category} • {vehicle.sub_category}</span>
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
                        <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
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