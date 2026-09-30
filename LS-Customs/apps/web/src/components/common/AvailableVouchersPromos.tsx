import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Ticket,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Tag,
  ArrowRight,
  Gift,
  X,
  Percent,
  Wrench,
  Car,
  AlertCircle,
} from 'lucide-react'
import type { View } from '../../types'

export interface PromoVoucher {
  id: string
  code: string
  title: string
  discount: string
  discountType: 'percent' | 'fixed' | 'free'
  discountValue: number
  description: string
  category: 'rentals' | 'services' | 'all'
  badge: string
  badgeBg: string
  badgeColor: string
  expires: string
  isDefault?: boolean
}

export const AVAILABLE_PROMOS: PromoVoucher[] = [
  {
    id: 'promo-escape20',
    code: 'ESCAPE20',
    title: 'Flash Sale: 20% Off Exotic Fleet',
    discount: '20% OFF',
    discountType: 'percent',
    discountValue: 20,
    description: 'Get 20% discount on all exotic and luxury vehicle rentals across Los Santos.',
    category: 'rentals',
    badge: 'Flash Sale',
    badgeBg: '#fef3c7',
    badgeColor: '#92400e',
    expires: 'Valid this weekend',
    isDefault: true,
  },
  {
    id: 'promo-care500',
    code: 'CARE500',
    title: 'Mobile Mechanic Welcome Credit',
    discount: '₱500 OFF',
    discountType: 'fixed',
    discountValue: 500,
    description: 'Save ₱500 on routine maintenance, brake inspection, or diagnostics at your location.',
    category: 'services',
    badge: 'Popular',
    badgeBg: '#edf7f1',
    badgeColor: '#166534',
    expires: 'Valid for 14 days',
  },
  {
    id: 'promo-vipluxe',
    code: 'VIPLUXE',
    title: 'VIP Concierge Rental Experience',
    discount: '15% OFF',
    discountType: 'percent',
    discountValue: 15,
    description: 'Exclusive luxury discount on premium sports cars, SUVs, and executive sedans.',
    category: 'rentals',
    badge: 'VIP Club',
    badgeBg: '#f3e8ff',
    badgeColor: '#6b21a8',
    expires: 'Valid all month',
  },
  {
    id: 'promo-freeoil',
    code: 'FREEOIL',
    title: 'Complimentary 30-Point Inspection',
    discount: 'FREE CHECK',
    discountType: 'free',
    discountValue: 100,
    description: 'Free multi-point engine, fluid, tire, and brake safety check with any appointment.',
    category: 'services',
    badge: 'Complimentary',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    expires: 'Always available',
  },
]

interface AvailableVouchersPromosProps {
  onView: (view: View) => void
  onNotify: (message: string) => void
  bannerText?: string
  bannerBg?: string
  bannerTextColor?: string
  bannerLinkText?: string
  bannerLinkView?: 'rentals' | 'services' | 'bookings' | 'none'
}

export function getPromosList(bannerText?: string): PromoVoucher[] {
  let promoCode = 'ESCAPE20'
  let discountStr = '20% OFF'
  let discountVal = 20
  let discountType: 'percent' | 'fixed' | 'free' = 'percent'
  let title = 'Flash Sale: 20% Off Exotic Fleet'

  if (bannerText) {
    const codeMatch = bannerText.match(/Code:\s*([A-Za-z0-9_-]+)/i)
    if (codeMatch && codeMatch[1]) {
      promoCode = codeMatch[1].toUpperCase()
    }
    const percentMatch = bannerText.match(/(\d+)%\s*off/i)
    if (percentMatch && percentMatch[1]) {
      discountVal = parseInt(percentMatch[1], 10)
      discountStr = `${discountVal}% OFF`
      title = `Featured Promo: ${discountVal}% Off`
    } else {
      const fixedMatch = bannerText.match(/₱\s*(\d+)/i)
      if (fixedMatch && fixedMatch[1]) {
        discountVal = parseInt(fixedMatch[1], 10)
        discountStr = `₱${discountVal} OFF`
        discountType = 'fixed'
        title = `Featured Promo: ₱${discountVal} Off`
      }
    }
  }

  const defaultPromo: PromoVoucher = {
    id: `promo-${promoCode.toLowerCase()}`,
    code: promoCode,
    title,
    discount: discountStr,
    discountType,
    discountValue: discountVal,
    description: bannerText ? bannerText.replace(/^[^a-zA-Z0-9]+/, '') : 'Exclusive promotional discount on vehicle rentals and services.',
    category: 'all',
    badge: 'Featured Promo',
    badgeBg: '#fef3c7',
    badgeColor: '#92400e',
    expires: 'Active Now',
    isDefault: true,
  }

  return [
    defaultPromo,
    ...AVAILABLE_PROMOS.filter((p) => p.code !== promoCode && !p.isDefault),
  ]
}

const STORAGE_KEY = 'ls_customs_active_promo'

export function AvailableVouchersPromos({
  onView,
  onNotify,
  bannerText = '🔥 FLASH SALE: 20% off all exotic car rentals this weekend! Code: ESCAPE20',
  bannerBg = '#e8a838',
  bannerTextColor = '#000000',
  bannerLinkText = 'Claim Offer',
  bannerLinkView = 'rentals',
}: AvailableVouchersPromosProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputCode, setInputCode] = useState('')
  const [activePromo, setActivePromo] = useState<PromoVoucher | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  const promosList = React.useMemo(() => getPromosList(bannerText), [bannerText])

  // Load active promo from storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setActivePromo(parsed)
      }
    } catch (e) {
      console.warn('Failed to parse active promo from localStorage', e)
    }
  }, [])

  const saveActivePromo = (promo: PromoVoucher | null) => {
    setActivePromo(promo)
    try {
      if (promo) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(promo))
        window.dispatchEvent(new CustomEvent('ls-promo-changed', { detail: promo }))
      } else {
        localStorage.removeItem(STORAGE_KEY)
        window.dispatchEvent(new CustomEvent('ls-promo-changed', { detail: null }))
      }
    } catch (e) {
      console.warn('Failed to store active promo in localStorage', e)
    }
  }

  // Handle user input promo code
  const handleApplyInputCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputCode.trim().toUpperCase()

    if (!trimmed) {
      setFeedback({
        type: 'info',
        message: 'Please enter a promo code or choose a voucher below.',
      })
      return
    }

    // Check if matches an existing voucher
    const match = promosList.find((p) => p.code.toUpperCase() === trimmed)
    if (match) {
      saveActivePromo(match)
      setFeedback({
        type: 'success',
        message: `Voucher "${match.code}" applied! ${match.discount} ready at checkout.`,
      })
      onNotify(`Voucher ${match.code} successfully applied!`)
      setInputCode('')
      return
    }

    // If custom code is entered, system grants default 15% promo
    const customPromo: PromoVoucher = {
      id: `custom-${trimmed.toLowerCase()}`,
      code: trimmed,
      title: `Promo: ${trimmed}`,
      discount: '15% OFF',
      discountType: 'percent',
      discountValue: 15,
      description: `Custom promo code ${trimmed} activated with 15% discount.`,
      category: 'all',
      badge: 'Custom',
      badgeBg: '#edf7f1',
      badgeColor: '#166534',
      expires: 'Valid today',
    }

    saveActivePromo(customPromo)
    setFeedback({
      type: 'success',
      message: `Code "${trimmed}" applied! 15% discount granted.`,
    })
    onNotify(`Code ${trimmed} applied! 15% discount activated.`)
    setInputCode('')
  }

  // System gives default promo if user doesn't know one
  const handleGetDefaultPromo = () => {
    const defaultPromo = promosList.find((p) => p.isDefault) || promosList[0]
    saveActivePromo(defaultPromo)
    setFeedback({
      type: 'success',
      message: `Default promo "${defaultPromo.code}" applied (${defaultPromo.discount})!`,
    })
    onNotify(`System default promo "${defaultPromo.code}" applied!`)
  }

  // Remove active promo
  const handleRemovePromo = () => {
    const code = activePromo?.code
    saveActivePromo(null)
    setFeedback({
      type: 'info',
      message: 'Active promo removed.',
    })
    if (code) {
      onNotify(`Promo ${code} removed.`)
    }
  }

  // Copy code to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    onNotify(`Promo code "${code}" copied to clipboard!`)
    setTimeout(() => {
      setCopiedCode(null)
    }, 2000)
  }

  return (
    <section
      className="available-vouchers-promos-section"
      aria-label="Available Vouchers and Promotions"
      style={{
        marginBottom: 20,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #dce8df',
        background: '#ffffff',
        boxShadow: '0 3px 12px rgba(35, 70, 49, 0.05)',
        transition: 'all 0.25s ease',
      }}
    >
      {/* ── Top Announcement Banner Bar ──────────────────────────────── */}
      <div
        style={{
          background: bannerBg,
          color: bannerTextColor,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {/* Left: Announcement text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 260px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 6,
              background: bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.2)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={15} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ lineHeight: 1.35 }}>{bannerText}</span>
            {activePromo && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: 0.95,
                }}
              >
                <Tag size={11} /> Active: <strong>{activePromo.code}</strong> ({activePromo.discount})
              </span>
            )}
          </div>
        </div>

        {/* Right: Clean, cohesive action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {bannerLinkView !== 'none' && bannerLinkText && !isExpanded && (
            <button
              type="button"
              onClick={() => onView(bannerLinkView as View)}
              style={{
                background: bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)',
                color: bannerTextColor,
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {bannerLinkText}
              <ArrowRight size={13} />
            </button>
          )}

          {/* Available Vouchers / Promos Trigger */}
          <button
            type="button"
            id="available-vouchers-promos-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            style={{
              background: bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.2)',
              color: bannerTextColor,
              border: bannerTextColor === '#000000' ? '1px solid rgba(0, 0, 0, 0.12)' : '1px solid rgba(255, 255, 255, 0.25)',
              padding: '6px 12px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.15s ease',
            }}
          >
            <Ticket size={14} />
            <span>Available Vouchers / Promos</span>
            <span
              style={{
                background: bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.25)',
                color: bannerTextColor,
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 10,
                fontWeight: 800,
              }}
            >
              {AVAILABLE_PROMOS.length}
            </span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── EXPANDED LIGHT MODE PANEL: Clean, cohesive concierge style ─ */}
      {isExpanded && (
        <div
          className="vouchers-expanded-panel"
          style={{
            padding: '20px 22px',
            background: '#ffffff',
            borderTop: '1px solid #e5ede7',
            animation: 'fadeInPromo 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#edf6f0',
                  color: '#244d3b',
                }}
              >
                <Ticket size={16} />
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#1a2e24',
                    }}
                  >
                    Available Vouchers & Promos
                  </h3>
                  <span
                    style={{
                      background: '#edf6f0',
                      color: '#244d3b',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 10,
                    }}
                  >
                    {AVAILABLE_PROMOS.length} Active Deals
                  </span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#668072' }}>
                  Input a promo code or select from the available discounts below.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              style={{
                background: '#f4f7f5',
                border: '1px solid #dbe6df',
                color: '#52695c',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Close</span>
              <X size={13} />
            </button>
          </div>

          {/* Active Promo Notification */}
          {activePromo && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 8,
                background: '#edf7f1',
                border: '1px solid #bce2cb',
                color: '#1b4332',
                marginBottom: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: '#244d3b',
                    color: '#ffffff',
                  }}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span style={{ fontSize: 13 }}>
                  Active voucher: <strong>{activePromo.code}</strong> ({activePromo.discount}) — applied to your booking.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {activePromo.category !== 'services' && (
                  <button
                    type="button"
                    onClick={() => onView('rentals')}
                    style={{
                      background: '#244d3b',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 5,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Car size={12} /> Rent Fleet
                  </button>
                )}
                {activePromo.category !== 'rentals' && (
                  <button
                    type="button"
                    onClick={() => onView('services')}
                    style={{
                      background: '#244d3b',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 5,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Wrench size={12} /> Book Mechanic
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRemovePromo}
                  style={{
                    background: 'transparent',
                    border: '1px solid #cbdcd1',
                    color: '#b91c1c',
                    borderRadius: 5,
                    padding: '5px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* Clean Input Bar */}
          <div
            style={{
              background: '#f8faf8',
              border: '1px solid #e2ebe4',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <form
              onSubmit={handleApplyInputCode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#ffffff',
                  border: '1px solid #ccdcd2',
                  borderRadius: 6,
                  padding: '4px 10px',
                  flex: '1 1 240px',
                  minHeight: 36,
                }}
              >
                <Tag size={14} style={{ color: '#7a9688', marginRight: 6 }} />
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. ESCAPE20, CARE500)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#1a2e24',
                    fontSize: 13,
                    fontWeight: 600,
                    width: '100%',
                    letterSpacing: '0.02em',
                  }}
                />
                {inputCode && (
                  <button
                    type="button"
                    onClick={() => setInputCode('')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7a9688',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                style={{
                  background: '#244d3b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 14px',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minHeight: 36,
                }}
              >
                <Check size={13} />
                <span>Apply Code</span>
              </button>

              <button
                type="button"
                onClick={handleGetDefaultPromo}
                style={{
                  background: '#ffffff',
                  color: '#244d3b',
                  border: '1px solid #ccdcd2',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minHeight: 36,
                }}
              >
                <Gift size={13} />
                <span>Get Default Promo</span>
              </button>
            </form>

            {feedback && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  color:
                    feedback.type === 'success'
                      ? '#15803d'
                      : feedback.type === 'error'
                      ? '#b91c1c'
                      : '#1e40af',
                }}
              >
                {feedback.type === 'success' ? (
                  <Check size={13} />
                ) : (
                  <AlertCircle size={13} />
                )}
                <span>{feedback.message}</span>
              </div>
            )}
          </div>

          {/* Clean Vouchers Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {promosList.map((voucher) => {
              const isCurrent = activePromo?.code === voucher.code
              const isCopied = copiedCode === voucher.code

              return (
                <div
                  key={voucher.id}
                  style={{
                    background: isCurrent ? '#f4faf6' : '#ffffff',
                    border: isCurrent ? '1.5px solid #244d3b' : '1px solid #dce8df',
                    borderRadius: 10,
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    {/* Top Row: Tag & Category */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          background: voucher.badgeBg,
                          color: voucher.badgeColor,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {voucher.badge}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#6b887a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {voucher.category === 'rentals' && <Car size={11} />}
                        {voucher.category === 'services' && <Wrench size={11} />}
                        {voucher.category === 'all' && <Percent size={11} />}
                        {voucher.category === 'rentals'
                          ? 'Rentals'
                          : voucher.category === 'services'
                          ? 'Mechanic'
                          : 'All'}
                      </span>
                    </div>

                    {/* Discount Headline */}
                    <div
                      style={{
                        fontSize: 19,
                        fontWeight: 800,
                        color: '#1a2e24',
                        marginBottom: 2,
                      }}
                    >
                      {voucher.discount}
                    </div>

                    {/* Title */}
                    <h4
                      style={{
                        margin: '0 0 4px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#2d3d34',
                      }}
                    >
                      {voucher.title}
                    </h4>

                    {/* Description */}
                    <p
                      style={{
                        margin: '0 0 12px',
                        fontSize: 12,
                        color: '#6b887a',
                        lineHeight: 1.35,
                      }}
                    >
                      {voucher.description}
                    </p>
                  </div>

                  {/* Code Box & Apply */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#f8faf8',
                        border: '1px dashed #c9d8ce',
                        borderRadius: 6,
                        padding: '5px 8px',
                        marginBottom: 8,
                      }}
                    >
                      <code
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: '#1a2e24',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {voucher.code}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(voucher.code)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: isCopied ? '#166534' : '#52695c',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '1px 4px',
                        }}
                      >
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{isCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        saveActivePromo(voucher)
                        setFeedback({
                          type: 'success',
                          message: `Voucher "${voucher.code}" applied! ${voucher.discount} ready at checkout.`,
                        })
                        onNotify(`Voucher "${voucher.code}" applied!`)
                      }}
                      style={{
                        width: '100%',
                        background: isCurrent ? '#244d3b' : '#f0f7f3',
                        color: isCurrent ? '#ffffff' : '#244d3b',
                        border: isCurrent ? '1px solid #244d3b' : '1px solid #d2e4d9',
                        borderRadius: 6,
                        padding: '7px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isCurrent ? (
                        <>
                          <Check size={13} strokeWidth={3} />
                          <span>Applied</span>
                        </>
                      ) : (
                        <span>Apply Voucher</span>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
