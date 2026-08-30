/**
 * AdminServices — Mechanic Services Catalog with full CRUD.
 * Uses real Supabase data via useAdminMechanicServices hook.
 * Admins can create, edit, and deactivate services.
 */
import { useState } from 'react'
import { Plus, Search, Edit, Trash2, X, Loader2 } from 'lucide-react'
import {
  useAdminMechanicServices,
  createMechanicService,
  updateMechanicService,
  deactivateMechanicService,
} from '../../hooks/useAdminData'
import type { MechanicService } from '@ls-customs/shared-types'

type ServiceMainCategory =
  | 'routine_fluid_service'
  | 'tire_wheel_care'
  | 'electrical_battery_care'
  | 'diagnostic_repair'
  | 'lighting_visibility'
  | 'quick_fixes'

const CATEGORIES: ServiceMainCategory[] = [
  'routine_fluid_service',
  'tire_wheel_care',
  'electrical_battery_care',
  'diagnostic_repair',
  'lighting_visibility',
  'quick_fixes',
]

const categoryLabels: Record<ServiceMainCategory, string> = {
  routine_fluid_service: 'Routine & Fluid Service',
  tire_wheel_care: 'Tire & Wheel Care',
  electrical_battery_care: 'Electrical & Battery Care',
  diagnostic_repair: 'Diagnostic & Repair',
  lighting_visibility: 'Lighting & Visibility',
  quick_fixes: 'Quick Fixes',
}

interface ServiceFormData {
  main_category: ServiceMainCategory
  name: string
  description: string
  base_price: number
  estimated_duration_minutes: number
  is_active: boolean
}

const initialFormData: ServiceFormData = {
  main_category: 'routine_fluid_service',
  name: '',
  description: '',
  base_price: 0,
  estimated_duration_minutes: 30,
  is_active: true,
}

export function AdminServices() {
  const { data: services, loading, error, refetch } = useAdminMechanicServices()
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState<MechanicService | null>(null)
  const [formData, setFormData] = useState<ServiceFormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Filter services client-side
  const filteredServices = services?.filter((s) => {
    if (activeFilter === 'active' && !s.is_active) return false
    if (activeFilter === 'inactive' && s.is_active) return false
    if (categoryFilter !== 'all' && s.main_category !== categoryFilter) return false
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  }) || []

  const openCreateModal = () => {
    setEditingService(null)
    setFormData(initialFormData)
    setSubmitError(null)
    setShowModal(true)
  }

  const openEditModal = (service: MechanicService) => {
    setEditingService(service)
    setFormData({
      main_category: service.main_category,
      name: service.name,
      description: service.description || '',
      base_price: service.base_price,
      estimated_duration_minutes: service.estimated_duration_minutes,
      is_active: service.is_active,
    })
    setSubmitError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingService(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    try {
      if (editingService) {
        await updateMechanicService(editingService.id, formData)
      } else {
        await createMechanicService(formData)
      }
      await refetch()
      closeModal()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save service')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (service: MechanicService) => {
    if (!window.confirm(`Deactivate "${service.name}"? This will hide it from the catalog but preserve existing bookings.`)) {
      return
    }
    try {
      await deactivateMechanicService(service.id)
      await refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate service')
    }
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading services...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load services</div>
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
          <h1>Mechanic Services Catalog</h1>
          <p>Manage all mechanic service offerings.</p>
        </div>
        <button className="admin-add-btn" onClick={openCreateModal}>
          <Plus size={16} /> Add New Service
        </button>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="admin-stats-row three">
        {[
          { label: 'Total Services', value: services?.length || 0, icon: 'total' },
          { label: 'Active', value: services?.filter(s => s.is_active).length || 0, icon: 'active' },
          { label: 'Inactive', value: services?.filter(s => !s.is_active).length || 0, icon: 'inactive' },
        ].map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'total' && '🔧'}
                {stat.icon === 'active' && '✅'}
                {stat.icon === 'inactive' && '⚠'}
              </div>
            </div>
            <div className="admin-stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Row ───────────────────────────────────────── */}
      <div className="admin-filter-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        {['all', 'active', 'inactive'].map((f) => (
          <button
            key={f}
            className={`admin-filter-btn ${activeFilter === f ? 'active' : ''}`}
            onClick={() => setActiveFilter(f as 'all' | 'active' | 'inactive')}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select
          className="admin-filter-btn"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: '8px 16px', background: '#1a1f2e', color: '#fff', border: '1px solid #374151', borderRadius: 6 }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabels[c]}</option>
          ))}
        </select>
        <div className="admin-fleet-search" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Services List ────────────────────────────────────── */}
      <div className="admin-vehicle-grid" style={{ gridTemplateColumns: '1fr' }}>
        {filteredServices.length === 0 ? (
          <div className="admin-empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}>
            No services found. <button onClick={openCreateModal} style={{ color: '#e8a838', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add the first service</button>
          </div>
        ) : (
          filteredServices.map((service) => (
            <div className="admin-vehicle-card" key={service.id} style={{ display: 'grid', gridTemplateColumns: '1fr', padding: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{service.name}</h3>
                      <span className={`admin-status-badge ${service.is_active ? 'active' : 'inactive'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                        {service.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="admin-filter-btn" style={{ background: '#374151', fontSize: 11, padding: '2px 8px', cursor: 'default' }}>
                        {categoryLabels[service.main_category] || service.main_category}
                      </span>
                    </div>
                    {service.description && (
                      <p style={{ margin: '4px 0 0', color: 'var(--admin-muted)', fontSize: 13 }}>{service.description}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 120 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#e8a838' }}>
                      ₱{service.base_price.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--admin-muted)', marginTop: 2 }}>
                      ~{service.estimated_duration_minutes} min
                    </div>
                  </div>
                </div>
                <div className="admin-vehicle-actions" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="admin-vehicle-btn primary" onClick={() => openEditModal(service)} style={{ padding: '8px 16px' }}>
                    <Edit size={13} /> Edit
                  </button>
                  <button
                    className="admin-vehicle-btn secondary"
                    onClick={() => handleDeactivate(service)}
                    disabled={!service.is_active}
                    style={{ opacity: service.is_active ? 1 : 0.5, padding: '8px 16px' }}
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
              <h2>{editingService ? 'Edit Service' : 'Add New Service'}</h2>
              <button className="admin-modal-close" onClick={closeModal}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {submitError && (
                <div className="admin-modal-error">{submitError}</div>
              )}
              <div className="admin-modal-body">
                <div className="admin-form-field">
                  <label>Category</label>
                  <select
                    value={formData.main_category}
                    onChange={(e) => setFormData({ ...formData, main_category: e.target.value as ServiceMainCategory })}
                    required
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{categoryLabels[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-form-field">
                  <label>Service Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Full Synthetic Oil Change"
                    required
                  />
                </div>
                <div className="admin-form-field">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Service description..."
                    rows={3}
                  />
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-field">
                    <label>Base Price (₱)</label>
                    <input
                      type="number"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: parseFloat(e.target.value) || 0 })}
                      min={0}
                      step={0.01}
                      required
                    />
                  </div>
                  <div className="admin-form-field">
                    <label>Estimated Duration (minutes)</label>
                    <input
                      type="number"
                      value={formData.estimated_duration_minutes}
                      onChange={(e) => setFormData({ ...formData, estimated_duration_minutes: parseInt(e.target.value) || 0 })}
                      min={5}
                      max={480}
                      required
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
                    Active (visible to customers)
                  </label>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-modal-btn secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="admin-modal-btn primary" disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="spin" /> : editingService ? 'Update Service' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}