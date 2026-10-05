import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

interface AccountSetupProps {
  userId: string
  onComplete: () => void
}

export function AccountSetup({ userId, onComplete }: AccountSetupProps) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone) {
      setError('Phone number is required')
      return
    }
    setLoading(true)
    setError('')
    
    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ phone })
      .eq('id', userId)

    setLoading(false)
    
    if (updateError) {
      setError(updateError.message)
    } else {
      // Force a reload so the auth state re-fetches cleanly, or let onComplete handle it
      window.dispatchEvent(new CustomEvent('ls-profile-updated'))
      onComplete()
      window.location.reload()
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2 style={{ color: 'white', marginBottom: '1rem' }}>Complete Your Profile</h2>
        <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
          Please provide your phone number so our mechanics can contact you during dispatch.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label style={{ color: '#d1d5db', display: 'block', marginBottom: '0.5rem' }}>Phone Number</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              placeholder="+1 555-0123" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #4b5563', background: '#374151', color: 'white' }}
            />
          </div>
          {error && <div style={{ color: '#ef4444', marginTop: '1rem' }}>{error}</div>}
          <button type="submit" className="primary-btn" disabled={loading} style={{ width: '100%', marginTop: '2rem', padding: '0.75rem', background: '#d4af37', color: 'black', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
            {loading ? 'Saving...' : 'Save & Continue'}
          </button>
          <button type="button" onClick={() => supabase.auth.signOut()} style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', background: 'transparent', color: '#9ca3af', border: '1px solid #4b5563', borderRadius: '4px', cursor: 'pointer' }}>
            Sign Out
          </button>
        </form>
      </div>
    </div>
  )
}
