import type { Profile } from '@ls-customs/shared-types'
import { X } from 'lucide-react'
import { useDialog } from '../../hooks/useDialog'
import type { AdminUserAddress } from '../../hooks/useAdminData'
import { RecordAuditTrail } from './RecordAuditTrail'

interface UserDetailsModalProps {
  user: Profile
  address?: AdminUserAddress
  addressesLoading: boolean
  addressesError: string | null
  onRetryAddresses: () => Promise<void>
  onClose: () => void
}

export function UserDetailsModal({ user, address, addressesLoading, addressesError, onRetryAddresses, onClose }: UserDetailsModalProps) {
  const dialogRef = useDialog(onClose)
  const role = { admin: 'Administrator', mechanic: 'Mechanic', customer: 'Customer' }[user.role]
  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString()
  }
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div ref={dialogRef} className="admin-modal admin-user-details" role="dialog" aria-modal="true" aria-labelledby="user-details-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
        <div className="admin-modal-header">
          <h2 id="user-details-title">User details</h2>
          <button type="button" className="admin-modal-close" aria-label="Close user details" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="admin-modal-body">
          <div className="admin-user-details-identity">
            {user.avatar_url ? <img src={user.avatar_url} alt="User avatar" /> : <div className="admin-tech-avatar">{user.full_name?.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?'}</div>}
            <div><h3>{user.full_name || 'Unnamed user'}</h3><p>{role}</p></div>
          </div>
          <dl className="admin-user-details-fields">
            <div><dt>Full name</dt><dd>{user.full_name || 'Not provided'}</dd></div>
            <div><dt>Role</dt><dd>{role}</dd></div>
            <div><dt>Phone number</dt><dd>{user.phone || 'Not provided'}</dd></div>
            <div><dt>Account ID</dt><dd>{user.id}</dd></div>
            <div><dt>Account created</dt><dd>{formatDate(user.created_at)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(user.updated_at)}</dd></div>
            <div className="admin-user-details-address"><dt>Default address</dt><dd>{addressesLoading ? 'Loading address…' : addressesError ? <span role="alert">Address unavailable. <button type="button" className="text-button" onClick={() => void onRetryAddresses()}>Retry address</button></span> : address ? <>{address.label && <strong>{address.label}<br /></strong>}{address.line1}{address.city ? `, ${address.city}` : ''}</> : 'No address on file'}</dd></div>
          </dl>
          <RecordAuditTrail recordType="user" recordId={user.id} recordTitle={`User details: ${user.full_name || user.id}`} />
        </div>
        <div className="admin-modal-footer"><button type="button" className="admin-modal-btn secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}
