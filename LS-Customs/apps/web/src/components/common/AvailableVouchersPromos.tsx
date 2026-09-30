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
    badge: 'FLASH SALE',
    badgeBg: '#e8a838',
    badgeColor: '#000000',
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
    badge: 'POPULAR SERVICE',
    badgeBg: '#10b981',
    badgeColor: '#ffffff',
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
    badge: 'VIP EXCLUSIVE',
    badgeBg: '#8b5cf6',
    badgeColor: '#ffffff',
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
    badge: 'COMPLIMENTARY',
    badgeBg: '#06b6d4',
    badgeColor: '#000000',
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
        message: 'Please enter a promo code, or click "Get Default Promo" below!',
      })
      return
    }

    // Check if matches an existing voucher
    const match = AVAILABLE_PROMOS.find((p) => p.code.toUpperCase() === trimmed)
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

    // If custom code is entered that doesn't match default list,
    // give a default system bonus promo as requested by the prompt!
    const customPromo: PromoVoucher = {
      id: `custom-${trimmed.toLowerCase()}`,
      code: trimmed,
      title: `Special Promo: ${trimmed}`,
      discount: '15% OFF',
      discountType: 'percent',
      discountValue: 15,
      description: `Custom promo code ${trimmed} activated! System granted 15% VIP discount.`,
      category: 'all',
      badge: 'CUSTOM PROMO',
      badgeBg: '#10b981',
      badgeColor: '#ffffff',
      expires: 'Valid today',
    }

    saveActivePromo(customPromo)
    setFeedback({
      type: 'success',
      message: `Code "${trimmed}" applied! The system granted 15% off for this promo.`,
    })
    onNotify(`Code ${trimmed} applied! 15% discount activated.`)
    setInputCode('')
  }

  // System gives default promo if user doesn't know one
  const handleGetDefaultPromo = () => {
    // Pick system default promo (ESCAPE20)
    const defaultPromo = AVAILABLE_PROMOS.find((p) => p.isDefault) || AVAILABLE_PROMOS[0]
    saveActivePromo(defaultPromo)
    setFeedback({
      type: 'success',
      message: `System default promo "${defaultPromo.code}" applied! ${defaultPromo.discount} active.`,
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
        marginBottom: 24,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(232, 168, 56, 0.25)',
        background: '#131b19',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* ── Promos Section Top Bar / Trigger ───────────────────────────── */}
      <div
        style={{
          background: bannerBg,
          color: bannerTextColor,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {/* Left: Banner Announcement text & active status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 280px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.2)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ lineHeight: 1.3 }}>{bannerText}</span>
            {activePromo && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: 0.9,
                }}
              >
                <Tag size={12} /> Active Voucher: <strong>{activePromo.code}</strong> ({activePromo.discount})
              </span>
            )}
          </div>
        </div>

        {/* Right: The prominent "Available Vouchers / Promos" Clickable Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {bannerLinkView !== 'none' && bannerLinkText && !isExpanded && (
            <button
              type="button"
              onClick={() => onView(bannerLinkView as View)}
              style={{
                background: bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)',
                color: bannerTextColor,
                border: 'none',
                padding: '7px 12px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                transition: 'opacity 0.2s',
              }}
            >
              {bannerLinkText}
              <ArrowRight size={13} />
            </button>
          )}

          {/* MAIN TARGET: Button explicitly labeled "Available Vouchers/Promos" */}
          <button
            type="button"
            id="available-vouchers-promos-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            style={{
              background: bannerTextColor === '#000000' ? '#0d1613' : '#ffffff',
              color: bannerTextColor === '#000000' ? '#e8a838' : '#0d1613',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <Ticket size={15} style={{ color: '#e8a838' }} />
            <span>Available Vouchers / Promos</span>
            <span
              style={{
                background: '#e8a838',
                color: '#0d1613',
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 10,
                fontWeight: 900,
              }}
            >
              {AVAILABLE_PROMOS.length}
            </span>
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* ── EXPANDED SECTION: Promos & Vouchers Displayed ─────────────── */}
      {isExpanded && (
        <div
          className="vouchers-expanded-panel"
          style={{
            padding: '22px 20px',
            background: 'linear-gradient(180deg, #131b19 0%, #0d1412 100%)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            animation: 'fadeInPromo 0.25s ease-out',
          }}
        >
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 18,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ticket size={20} style={{ color: '#e8a838' }} />
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Available Vouchers & Promos
                </h3>
                <span
                  style={{
                    background: 'rgba(232, 168, 56, 0.15)',
                    color: '#e8a838',
                    border: '1px solid rgba(232, 168, 56, 0.3)',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                >
                  Exclusive Perks
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#9ba8a2', maxWidth: 640 }}>
                Input your promo code below, or let the system assign a default promo to instantly save on car rentals and mobile mechanic services.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#9ba8a2',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Close</span>
              <X size={14} />
            </button>
          </div>

          {/* ── Active Promo Banner (if one is currently applied) ───────── */}
          {activePromo && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#d1fae5',
                marginBottom: 20,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: '#10b981',
                    color: '#064e3b',
                  }}
                >
                  <Check size={16} strokeWidth={3} />
                </span>
                <div>
                  <strong style={{ color: '#fff', fontSize: 13 }}>
                    Active Promo: {activePromo.code} ({activePromo.discount})
                  </strong>
                  <div style={{ fontSize: 12, color: '#a7f3d0' }}>
                    {activePromo.title} — ready to apply on checkout!
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {activePromo.category !== 'services' && (
                  <button
                    type="button"
                    onClick={() => onView('rentals')}
                    style={{
                      background: '#10b981',
                      color: '#064e3b',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Car size={13} /> Rent Fleet
                  </button>
                )}
                {activePromo.category !== 'rentals' && (
                  <button
                    type="button"
                    onClick={() => onView('services')}
                    style={{
                      background: '#10b981',
                      color: '#064e3b',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Wrench size={13} /> Book Mechanic
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRemovePromo}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    borderRadius: 6,
                    padding: '5px 10px',
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

          {/* ── Input Promo Code & Default Promo Generator ──────────────── */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '16px 18px',
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag size={14} style={{ color: '#e8a838' }} />
              <span>Input a Promo Code or Let the System Give a Default Promo:</span>
            </div>

            <form
              onSubmit={handleApplyInputCode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  borderRadius: 8,
                  padding: '2px 12px',
                  flex: '1 1 260px',
                  minHeight: 40,
                }}
              >
                <Tag size={15} style={{ color: '#9ba8a2', marginRight: 8 }} />
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. ESCAPE20, CARE500)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    width: '100%',
                    letterSpacing: '0.04em',
                  }}
                />
                {inputCode && (
                  <button
                    type="button"
                    onClick={() => setInputCode('')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#9ba8a2',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Apply Inputted Code button */}
              <button
                type="submit"
                style={{
                  background: '#e8a838',
                  color: '#0d1613',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'opacity 0.2s',
                  minHeight: 40,
                }}
              >
                <Check size={14} />
                <span>Apply Code</span>
              </button>

              {/* System Gives Default Promo button */}
              <button
                type="button"
                onClick={handleGetDefaultPromo}
                style={{
                  background: 'rgba(232, 168, 56, 0.12)',
                  color: '#e8a838',
                  border: '1px solid rgba(232, 168, 56, 0.4)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'background 0.2s',
                  minHeight: 40,
                }}
                title="Don't have a code? Click here to let the system give you our top default promo!"
              >
                <Gift size={14} />
                <span>⚡ Get Default Promo</span>
              </button>
            </form>

            {/* Feedback alert if any */}
            {feedback && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color:
                    feedback.type === 'success'
                      ? '#34d399'
                      : feedback.type === 'error'
                      ? '#f87171'
                      : '#93c5fd',
                }}
              >
                {feedback.type === 'success' ? (
                  <Check size={14} />
                ) : (
                  <AlertCircle size={14} />
                )}
                <span>{feedback.message}</span>
              </div>
            )}
          </div>

          {/* ── Vouchers & Promos Grid ─────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {AVAILABLE_PROMOS.map((voucher) => {
              const isCurrent = activePromo?.code === voucher.code
              const isCopied = copiedCode === voucher.code

              return (
                <div
                  key={voucher.id}
                  style={{
                    background: isCurrent
                      ? 'linear-gradient(135deg, rgba(232, 168, 56, 0.14) 0%, rgba(16, 185, 129, 0.08) 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: isCurrent
                      ? '1px solid #e8a838'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    boxShadow: isCurrent ? '0 4px 20px rgba(232, 168, 56, 0.15)' : 'none',
                  }}
                >
                  <div>
                    {/* Top Row: Badge & Category */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          background: voucher.badgeBg,
                          color: voucher.badgeColor,
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 4,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {voucher.badge}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#9ba8a2',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {voucher.category === 'rentals' && <Car size={12} />}
                        {voucher.category === 'services' && <Wrench size={12} />}
                        {voucher.category === 'all' && <Percent size={12} />}
                        {voucher.category === 'rentals'
                          ? 'Rentals'
                          : voucher.category === 'services'
                          ? 'Mechanic'
                          : 'All Services'}
                      </span>
                    </div>

                    {/* Discount Headline */}
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 900,
                        color: isCurrent ? '#e8a838' : '#ffffff',
                        letterSpacing: '-0.02em',
                        marginBottom: 4,
                      }}
                    >
                      {voucher.discount}
                    </div>

                    {/* Voucher Title */}
                    <h4
                      style={{
                        margin: '0 0 6px',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#f3f4f6',
                      }}
                    >
                      {voucher.title}
                    </h4>

                    {/* Description */}
                    <p
                      style={{
                        margin: '0 0 14px',
                        fontSize: 12,
                        color: '#9ca3af',
                        lineHeight: 1.4,
                      }}
                    >
                      {voucher.description}
                    </p>
                  </div>

                  {/* Bottom: Code Pill + Action Buttons */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px dashed rgba(255, 255, 255, 0.18)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Ticket size={14} style={{ color: '#e8a838' }} />
                        <code
                          style={{
                            fontWeight: 800,
                            fontSize: 13,
                            color: '#ffffff',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {voucher.code}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(voucher.code)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: isCopied ? '#34d399' : '#9ba8a2',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                        title="Copy promo code"
                      >
                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                        <span>{isCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Apply / Applied Button */}
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
                        background: isCurrent ? '#10b981' : 'rgba(232, 168, 56, 0.15)',
                        color: isCurrent ? '#042f2e' : '#e8a838',
                        border: isCurrent
                          ? '1px solid #10b981'
                          : '1px solid rgba(232, 168, 56, 0.4)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isCurrent ? (
                        <>
                          <Check size={14} strokeWidth={3} />
                          <span>Applied ✓</span>
                        </>
                      ) : (
                        <>
                          <span>Apply Voucher</span>
                          <ArrowRight size={13} />
                        </>
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
