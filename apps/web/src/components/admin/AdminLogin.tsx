/**
 * AdminLogin — standalone login page for admin access.
 * Features a split layout with branding hero and login form.
 * Only admin role can sign in — uses standard Supabase Auth (email + password).
 */
import { useState } from 'react'
import { useAdminAuth } from '../../hooks/useAdminAuth'
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertTriangle,
  BarChart3,
  Users,
  Car,
  ArrowRight,
} from 'lucide-react'

interface AdminLoginProps {
  onAuthenticated: () => void
  onNavigateHome?: () => void
}

export function AdminLogin({ onAuthenticated, onNavigateHome }: AdminLoginProps) {
  const { signIn, isLoading, error } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await signIn(email, password)
    if (success) {
      onAuthenticated()
    }
  }

  return (
    <div className="admin-login-page">
      {/* ── Left: Branding Hero ─────────────────────────────── */}
      <div className="admin-login-hero">
        <div className="admin-login-brand" style={{ cursor: 'pointer' }} onClick={onNavigateHome}>
          <div className="admin-login-brand-icon">LS</div>
          <div>
            <h1>LS Customs</h1>
            <span>Command Center</span>
          </div>
        </div>

        <h2>
          Fleet operations.
          <br />
          <em>Total control.</em>
        </h2>
        <p>
          Manage your entire fleet, monitor technicians in real-time, dispatch emergency mechanics,
          and track revenue analytics from a single powerful dashboard.
        </p>

        <div className="admin-login-features">
          <div className="admin-login-feature">
            <div className="admin-login-feature-icon">
              <Car size={16} />
            </div>
            Fleet Tracking
          </div>
          <div className="admin-login-feature">
            <div className="admin-login-feature-icon">
              <Users size={16} />
            </div>
            Technician Management
          </div>
          <div className="admin-login-feature">
            <div className="admin-login-feature-icon">
              <BarChart3 size={16} />
            </div>
            Revenue Analytics
          </div>
        </div>

        {onNavigateHome && (
          <div style={{ marginTop: 'auto', paddingTop: 40 }}>
            <button
              type="button"
              onClick={onNavigateHome}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#e5e7eb',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              ← Back to Customer Workspace
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Login Form ───────────────────────────────── */}
      <div className="admin-login-form-container">
        <div className="admin-login-form-wrapper">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h2>Internal Portal</h2>
            <span style={{
              background: '#fef3c7',
              color: '#92400e',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Shield size={12} /> Restricted Access
            </span>
          </div>
          <p>Sign in with your admin credentials to access the dashboard</p>

          {error && (
            <div className="admin-login-error">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="admin-login-field">
              <label htmlFor="admin-email">
                <Mail size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="admin-login-field">
              <label htmlFor="admin-password">
                <Lock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 0,
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="admin-login-remember">
              <label>
                <input type="checkbox" defaultChecked /> Remember session
              </label>
              <button type="button" className="admin-login-forgot">
                Contact Ops Lead
              </button>
            </div>

            <button
              type="submit"
              className="admin-login-submit"
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : (
                <>
                  <span>Sign In as Admin</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="admin-login-footer">
            <p>
              This portal is restricted to authorized admin personnel only.
              <br />
              © 2024 LS Customs • Professional Automotive Solutions
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
