/**
 * SignOutConfirmation — modal dialog to confirm user sign-out action.
 */
import { X } from 'lucide-react'

interface SignOutConfirmationProps {
  onCancel: () => void
  onConfirm: () => void
}

export function SignOutConfirmation({ onCancel, onConfirm }: SignOutConfirmationProps) {
  return (
    <div
      className="auth-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section className="signout-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-title">
        <div className="auth-logo">?</div>
        <h2 id="signout-title">Sign out?</h2>
        <p>You will need to sign in again to access your dashboard, bookings, and profile.</p>
        <div className="signout-dialog-actions">
          <button className="outline-button" onClick={onCancel}>Cancel</button>
          <button className="button dark-button" onClick={onConfirm}>Sign out</button>
        </div>
      </section>
    </div>
  )
}
