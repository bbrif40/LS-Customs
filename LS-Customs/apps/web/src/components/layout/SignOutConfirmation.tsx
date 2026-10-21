import { useWebsiteText } from "../../hooks/useWebsiteText"
/**
 * SignOutConfirmation — modal dialog to confirm user sign-out action.
 */
import { X } from 'lucide-react'

interface SignOutConfirmationProps {
  onCancel: () => void
  onConfirm: () => void
}

export function SignOutConfirmation({ onCancel, onConfirm }: SignOutConfirmationProps) {
  const websiteText = useWebsiteText("Shared")

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
        <h2 id="signout-title">{websiteText("Sign out?")}</h2>
        <p>{websiteText("You will need to sign in again to access your dashboard, bookings, and profile.")}</p>
        <div className="signout-dialog-actions">
          <button className="outline-button" onClick={onCancel}>{websiteText("Cancel")}</button>
          <button className="button dark-button" onClick={onConfirm}>{websiteText("Sign out")}</button>
        </div>
      </section>
    </div>
  )
}
