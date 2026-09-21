import React from 'react'

interface PaymentMethodBadgesProps {
  /** Optional title override. Defaults to "Available Payment Methods". Pass null to hide. */
  title?: string | null
  /** Compact style for tighter embedding (e.g., inside checkout forms). */
  compact?: boolean
  className?: string
}

/**
 * Clean SVG Brand Icons for Philippine Payment Methods
 */
function GCashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
      aria-label="GCash logo"
    >
      <circle cx="12" cy="12" r="11" fill="#005CE6" />
      <path
        d="M12 4.5A7.5 7.5 0 1 0 19.5 12h-3.3A4.2 4.2 0 1 1 12 7.8c1.3 0 2.4.6 3.1 1.5l2.4-2.2A7.4 7.4 0 0 0 12 4.5Z"
        fill="#FFFFFF"
      />
      <path
        d="M13.5 10.5H18V13.5H13.5V10.5Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

function MayaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
      aria-label="Maya logo"
    >
      <rect width="24" height="24" rx="6" fill="#111827" />
      <path
        d="M5 15.5V8.5h2.8l2.2 4.2 2.2-4.2H15v7h-2.2v-4.1l-1.9 3.5h-1.6l-1.9-3.5v4.1H5Z"
        fill="#00D664"
      />
      <circle cx="18.5" cy="14.5" r="1.5" fill="#00D664" />
    </svg>
  )
}

function VisaIcon({ height = 13 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 36 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
      aria-label="Visa logo"
    >
      <path
        d="M14.08 0.3L9.24 11.7H6.07L3.71 2.5C3.57 1.93 3.42 1.72 2.97 1.48C2.26 1.09 1.06 0.73 0 0.5L0.06 0.3H5.16C5.83 0.3 6.42 0.74 6.57 1.51L7.82 8.16L10.98 0.3H14.08ZM26.4 7.9C26.43 4.88 22.23 4.71 22.26 3.37C22.28 2.96 22.66 2.52 23.54 2.4C23.97 2.34 25.17 2.29 26.45 2.88L26.97 0.47C26.25 0.21 25.33 0 24.18 0C21.24 0 19.17 1.56 19.15 3.79C19.12 5.44 20.63 6.36 21.75 6.91C22.91 7.48 23.3 7.84 23.3 8.35C23.28 9.13 22.36 9.47 21.51 9.49C20.01 9.51 19.13 9.08 18.43 8.76L17.89 11.28C18.67 11.64 20.12 11.95 21.61 11.97C24.73 11.97 26.78 10.43 26.8 8.08L26.4 7.9ZM34.29 11.7H37L34.63 0.3H32.18C31.57 0.3 31.06 0.65 30.84 1.18L26.34 11.7H29.53L30.17 9.94H34.07L34.29 11.7ZM30.98 7.64L32.29 4.04L33.05 7.64H30.98ZM18.49 0.3L16 11.7H13.06L15.55 0.3H18.49Z"
        fill="#1A1F71"
      />
    </svg>
  )
}

function MastercardIcon({ height = 15 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 24 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
      aria-label="Mastercard logo"
    >
      <circle cx="7" cy="8" r="7" fill="#EB001B" />
      <circle cx="17" cy="8" r="7" fill="#F79E1B" />
      <path
        d="M12 2.76A6.98 6.98 0 0 0 9.8 8c0 2.14.96 4.05 2.2 5.24A6.98 6.98 0 0 0 14.2 8a6.98 6.98 0 0 0-2.2-5.24Z"
        fill="#FF5F00"
      />
    </svg>
  )
}

function QRPhIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
      aria-label="QR Ph logo"
    >
      <rect width="24" height="24" rx="5" fill="#0038A8" />
      <path d="M0 12L12 24H24L12 12H0Z" fill="#CE1126" />
      <path d="M12 3L21 12L12 21L3 12L12 3Z" fill="#FFFFFF" />
      <rect x="7.5" y="7.5" width="3" height="3" fill="#0038A8" />
      <rect x="13.5" y="7.5" width="3" height="3" fill="#CE1126" />
      <rect x="7.5" y="13.5" width="3" height="3" fill="#FCD116" />
      <rect x="13.5" y="13.5" width="3" height="3" fill="#111827" />
    </svg>
  )
}

export function PaymentMethodBadges({
  title = 'AVAILABLE PAYMENT METHODS',
  compact = false,
  className = '',
}: PaymentMethodBadgesProps) {
  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: compact ? '4px 8px' : '5px 9px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid rgba(0, 0, 0, 0.10)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    color: '#1f2937',
    fontSize: compact ? '11px' : '12px',
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  }

  return (
    <div
      className={`payment-methods-card ${className}`}
      style={{
        background: 'rgba(249, 250, 251, 0.9)',
        border: '1px solid rgba(229, 231, 235, 0.9)',
        borderRadius: '8px',
        padding: compact ? '8px 10px' : '10px 12px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {title && (
        <p
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 7px 0',
          }}
        >
          {title}
        </p>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: compact ? '6px' : '7px',
          alignItems: 'center',
        }}
      >
        {/* GCash */}
        <div style={badgeStyle} title="GCash E-Wallet">
          <GCashIcon size={compact ? 16 : 18} />
          <span>GCash</span>
        </div>

        {/* Maya */}
        <div style={badgeStyle} title="Maya E-Wallet">
          <MayaIcon size={compact ? 16 : 18} />
          <span>Maya</span>
        </div>

        {/* Visa & Mastercard */}
        <div style={badgeStyle} title="Credit / Debit Card (Visa, Mastercard)">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <VisaIcon height={compact ? 11 : 13} />
            <MastercardIcon height={compact ? 13 : 15} />
          </div>
          <span style={{ color: '#4b5563', fontSize: compact ? '10.5px' : '11px' }}>Cards</span>
        </div>

        {/* QR Ph */}
        <div style={badgeStyle} title="QR Ph - Any Bank or E-Wallet">
          <QRPhIcon size={compact ? 16 : 18} />
          <span>QR Ph</span>
        </div>
      </div>
    </div>
  )
}
