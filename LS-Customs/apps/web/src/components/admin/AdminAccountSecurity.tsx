import { useState } from 'react'
import { supabase } from '../../supabaseClient'

/** Passwords are entered by the account owner; no shared/default credential exists. */
export function AdminAccountSecurity() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <section style={{ padding: '12px 24px' }}>
    <button type="button" onClick={() => setOpen(true)}>Account security</button>
    {open && <form role="dialog" aria-label="Admin account security" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      if (password !== confirmation) { setMessage('Passwords do not match.'); return }
      setBusy(true)
      try {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) { setMessage(error.message); return }
        setPassword(''); setConfirmation('')
        setMessage('Password changed. Keep it private and use it for your next sign-in.')
      } catch { setMessage('Password change failed. Please retry.'); }
      finally { setBusy(false) }
    }}>
      <h2>Change your admin password</h2>
      <p>Use a private password of at least 15 characters.</p>
      <label>New password<input type="password" autoComplete="new-password" minLength={15} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={15} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      {message && <p role="status">{message}</p>}
      <button type="submit" disabled={busy}>Change password</button>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setMessage('') }}>Close</button>
    </form>}
  </section>
}
