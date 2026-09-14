/**
 * Profile — user profile with avatar, editable fields, and settings list.
 *
 * Backed by Supabase via useProfile:
 *   - "Save contact" updates profiles.full_name and profiles.phone.
 *   - "Save address" upserts the customer's default addresses row.
 *
 * The two saves are independent so a contact change does not require
 * re-submitting the address, and vice versa.
 *
 * Settings rows:
 *   - Notification preferences — expandable panel with toggle switches
 *     persisted to localStorage (email/SMS for bookings, tickets, payments,
 *     plus promotional emails).
 *   - Saved addresses — smooth-scrolls to the Address form above.
 *   - Help center — navigates to the public /help page.
 */
import { useRef, useState, useEffect } from 'react'
import { Bell, MapPin, Headset, Loader2 } from 'lucide-react'
import { PageHeading } from '../common/PageHeading'
import { SettingsRow } from '../common/SettingsRow'
import { useProfile } from '../../hooks/useProfile'

/** Storage key for customer notification preference toggles. */
const NOTIFICATION_PREFS_KEY = 'ls-customs-notification-preferences'

interface NotificationPrefs {
  bookingUpdates: boolean
  ticketReplies: boolean
  paymentUpdates: boolean
  promotions: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  bookingUpdates: true,
  ticketReplies: true,
  paymentUpdates: true,
  promotions: false,
}

/**
 * ToggleSwitch — a simple on/off toggle with localStorage persistence
 * handled by the parent. Renders a styled checkbox for accessibility.
 */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={onChange} readOnly />
      <span className="toggle-track" />
    </label>
  )
}

interface ProfileProps {
  userId: string | undefined
  displayName: string
  email: string
  initials: string
  onNotify: (message: string) => void
}

export function Profile({ userId, displayName, email, initials, onNotify }: ProfileProps) {
  const {
    profile,
    defaultAddress,
    loading,
    saving,
    error,
    updateProfile,
    upsertDefaultAddress,
  } = useProfile(userId)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const addressSectionRef = useRef<HTMLDivElement>(null)

  // Notification preference toggles — persisted to localStorage so they
  // survive page reloads until a backend preferences table is wired up.
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [prefsExpanded, setPrefsExpanded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_PREFS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<NotificationPrefs>
        setNotificationPrefs({ ...DEFAULT_PREFS, ...parsed })
      }
    } catch {
      // Ignore corrupt localStorage entries — fall back to defaults.
    }
  }, [])

  const togglePref = (key: keyof NotificationPrefs) => {
    setNotificationPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next))
      } catch {
        // Ignore write errors (e.g. private mode).
      }
      return next
    })
  }

  const handleSavedAddresses = () => {
    addressSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onNotify('Saved addresses')
  }

  const handleHelpCenter = () => {
    window.location.href = '/help'
  }

  // Local form state — initialized once the profile loads.
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressCity, setAddressCity] = useState('')
  // Per-section dirty state. A change in one section only dirties that section.
  const [contactDirty, setContactDirty] = useState(false)
  const [addressDirty, setAddressDirty] = useState(false)

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onNotify('Please choose an image file')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      onNotify('Profile images must be smaller than 2 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      void updateProfile({ avatar_url: reader.result })
        .then(() => onNotify('Profile photo saved'))
        .catch((error: unknown) => onNotify(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed'))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name || '')
    setPhone(profile.phone || '')
  }, [profile])

  useEffect(() => {
    if (!defaultAddress) return
    setAddressLine1(defaultAddress.line1 || '')
    setAddressCity(defaultAddress.city || '')
  }, [defaultAddress])

  // Re-clear the dirty flags whenever the underlying record updates
  // (i.e. after a successful save or a refetch).
  useEffect(() => {
    setContactDirty(false)
  }, [profile?.full_name, profile?.phone])
  useEffect(() => {
    setAddressDirty(false)
  }, [defaultAddress?.line1, defaultAddress?.city])

  const handleSaveContact = async () => {
    if (!userId) {
      onNotify('Please sign in to save changes')
      return
    }
    const fullNameChanged = profile && fullName.trim() !== (profile.full_name || '')
    const phoneChanged = profile && (phone.trim() || null) !== (profile.phone || null)
    if (!fullNameChanged && !phoneChanged) {
      onNotify('Nothing to save')
      return
    }
    try {
      await updateProfile({
        ...(fullNameChanged ? { full_name: fullName.trim() } : {}),
        ...(phoneChanged ? { phone: phone.trim() || null } : {}),
      })
      onNotify('Contact saved')
    } catch (err) {
      onNotify(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed')
    }
  }

  const handleSaveAddress = async () => {
    if (!userId) {
      onNotify('Please sign in to save changes')
      return
    }
    const line1 = addressLine1.trim()
    const city = addressCity.trim()
    if (!line1 || !city) {
      onNotify('Both street address and city are required')
      return
    }
    const addressChanged =
      defaultAddress &&
      (line1 !== (defaultAddress.line1 || '') || city !== (defaultAddress.city || ''))
    if (!addressChanged && defaultAddress) {
      onNotify('Nothing to save')
      return
    }
    try {
      await upsertDefaultAddress({ line1, city, label: 'Home' })
      onNotify('Address saved')
    } catch (err) {
      onNotify(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed')
    }
  }

  if (loading) {
    return (
      <div
        className="page"
        style={{ display: 'grid', placeItems: 'center', minHeight: '50vh', color: 'var(--muted, #6b7280)' }}
      >
        <Loader2 size={24} className="spin" /> <span style={{ marginLeft: 10 }}>Loading profile…</span>
      </div>
    )
  }

  return (
    <div className="page profile-page">
      <PageHeading
        eyebrow="ACCOUNT"
        title="Profile & settings"
        detail="Keep your personal details and preferences up to date."
      />

      {error && (
        <div
          role="alert"
          style={{
            color: '#b91c1c',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div className="profile-layout stagger-children visible">
        <section className="profile-card">
          <div className="profile-cover" />
          <div className="profile-main">
            <div className="avatar profile-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profile" /> : initials}
            </div>
            <h2>{displayName}</h2>
            <p className="muted">{email}</p>
            <input ref={photoInputRef} className="profile-photo-input" type="file" accept="image/*" onChange={handlePhotoChange} />
            <button className="outline-button" onClick={() => photoInputRef.current?.click()} disabled={saving}>
              Change photo
            </button>
          </div>

          <div className="profile-fields">
            {/* ── Contact section ──────────────────────────── */}
            <div className="profile-section">
              <h3 className="profile-section-title">Contact</h3>
              <label>
                Full name
                <input
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value)
                    setContactDirty(true)
                  }}
                  placeholder="Your full name"
                />
              </label>
              <label>
                Email address
                <input value={email} readOnly />
              </label>
              <label>
                Phone number
                <input
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value)
                    setContactDirty(true)
                  }}
                  placeholder="Add phone number"
                  inputMode="tel"
                />
              </label>
              <div className="profile-section-actions">
                <button
                  className="button dark-button"
                  onClick={() => void handleSaveContact()}
                  disabled={saving || !contactDirty}
                  style={{
                    opacity: saving || !contactDirty ? 0.6 : 1,
                    cursor: saving || !contactDirty ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="spin" /> Saving…
                    </>
                  ) : (
                    'Save contact'
                  )}
                </button>
              </div>
            </div>

            {/* ── Address section ──────────────────────────── */}
            <div className="profile-section" ref={addressSectionRef}>
              <h3 className="profile-section-title">Address</h3>
              <label>
                Street address
                <input
                  value={addressLine1}
                  onChange={(event) => {
                    setAddressLine1(event.target.value)
                    setAddressDirty(true)
                  }}
                  placeholder="Street, building, unit"
                />
              </label>
              <label>
                City
                <input
                  value={addressCity}
                  onChange={(event) => {
                    setAddressCity(event.target.value)
                    setAddressDirty(true)
                  }}
                  placeholder="City"
                />
              </label>
              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Address is shared with the operations team so on-demand mechanics can find you.
              </p>
              <div className="profile-section-actions">
                <button
                  className="button dark-button"
                  onClick={() => void handleSaveAddress()}
                  disabled={saving || !addressDirty}
                  style={{
                    opacity: saving || !addressDirty ? 0.6 : 1,
                    cursor: saving || !addressDirty ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="spin" /> Saving…
                    </>
                  ) : (
                    'Save address'
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="settings-list">
          <SettingsRow
            icon={<Bell size={18} />}
            title="Notification preferences"
            detail="Manage email, SMS, and push alerts"
            onClick={() => {
              setPrefsExpanded((open) => !open)
              onNotify('Notification preferences')
            }}
          />
          <SettingsRow
            icon={<MapPin size={18} />}
            title="Saved addresses"
            detail="Home, office, and frequent locations"
            onClick={handleSavedAddresses}
          />
          <SettingsRow
            icon={<Headset size={18} />}
            title="Help center"
            detail="FAQs, contact support, and documentation"
            onClick={handleHelpCenter}
          />

          {/* ── Notification preferences panel ───────────────────── */}
          <div className={`notification-prefs${prefsExpanded ? ' expanded' : ''}`}>
            <div className="notification-pref-group">
              <span>
                <strong>Booking updates</strong>
                <small>Status changes for your rentals and services</small>
              </span>
              <ToggleSwitch
                checked={notificationPrefs.bookingUpdates}
                onChange={() => togglePref('bookingUpdates')}
              />
            </div>
            <div className="notification-pref-group">
              <span>
                <strong>Ticket replies</strong>
                <small>When support responds to your tickets</small>
              </span>
              <ToggleSwitch
                checked={notificationPrefs.ticketReplies}
                onChange={() => togglePref('ticketReplies')}
              />
            </div>
            <div className="notification-pref-group">
              <span>
                <strong>Payment updates</strong>
                <small>Confirmations, failures, and refunds</small>
              </span>
              <ToggleSwitch
                checked={notificationPrefs.paymentUpdates}
                onChange={() => togglePref('paymentUpdates')}
              />
            </div>
            <div className="notification-pref-group">
              <span>
                <strong>Promotions</strong>
                <small>Special offers and new service announcements</small>
              </span>
              <ToggleSwitch
                checked={notificationPrefs.promotions}
                onChange={() => togglePref('promotions')}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
