/**
 * Profile — user profile with avatar, editable fields, and settings list.
 */
import { Bell, ShieldCheck, MapPin, Headset, ChevronRight } from 'lucide-react'
import { PageHeading } from '../common/PageHeading'
import { SettingsRow } from '../common/SettingsRow'

interface ProfileProps {
  displayName: string
  email: string
  initials: string
  onNotify: (message: string) => void
}

export function Profile({ displayName, email, initials, onNotify }: ProfileProps) {
  return (
    <div className="page">
      <PageHeading
        eyebrow="ACCOUNT"
        title="Profile & settings"
        detail="Keep your personal details and preferences up to date."
        action={
          <button className="button dark-button" onClick={() => onNotify('Profile saved')}>
            Save changes
          </button>
        }
      />
      <div className="profile-layout">
        <section className="profile-card">
          <div className="profile-cover" />
          <div className="profile-main">
            <div className="avatar profile-avatar">{initials}</div>
            <h2>{displayName}</h2>
            <p className="muted">{email}</p>
            <button className="outline-button" onClick={() => onNotify('Photo picker opened')}>
              Change photo
            </button>
          </div>
          <div className="profile-fields">
            <label>
              Full name
              <input defaultValue={displayName} />
            </label>
            <label>
              Email address
              <input defaultValue={email} readOnly />
            </label>
            <label>
              Phone number
              <input placeholder="Add phone number" />
            </label>
            <label>
              Default address
              <input placeholder="Add default address" />
            </label>
          </div>
        </section>
        <aside className="settings-list">
          <SettingsRow
            icon={<Bell size={18} />}
            title="Notification preferences"
            detail="Manage email, SMS, and push alerts"
            onClick={() => onNotify('Notification preferences opened')}
          />
          <SettingsRow
            icon={<ShieldCheck size={18} />}
            title="Security & password"
            detail="Update password and 2FA settings"
            onClick={() => onNotify('Security settings opened')}
          />
          <SettingsRow
            icon={<MapPin size={18} />}
            title="Saved addresses"
            detail="Home, office, and frequent locations"
            onClick={() => onNotify('Saved addresses opened')}
          />
          <SettingsRow
            icon={<Headset size={18} />}
            title="Help center"
            detail="FAQs, contact support, and documentation"
            onClick={() => onNotify('Help center opened')}
          />
        </aside>
      </div>
    </div>
  )
}
