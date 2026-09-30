import type { PromoVoucher } from '../components/common/AvailableVouchersPromos'

const STORAGE_KEY = 'ls_customs_active_promo'

export function getActivePromo(): PromoVoucher | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PromoVoucher
  } catch {
    return null
  }
}

export function calculatePromoDiscount(
  baseTotal: number,
  promo: PromoVoucher | null,
  category: 'rentals' | 'services'
): { discountAmount: number; finalTotal: number } {
  if (!promo) return { discountAmount: 0, finalTotal: baseTotal }
  if (promo.category !== 'all' && promo.category !== category) {
    return { discountAmount: 0, finalTotal: baseTotal }
  }

  let discountAmount = 0
  if (promo.discountType === 'percent') {
    discountAmount = Math.round((baseTotal * promo.discountValue) / 100)
  } else if (promo.discountType === 'fixed') {
    discountAmount = Math.min(baseTotal, promo.discountValue)
  } else if (promo.discountType === 'free') {
    // Complimentary inspection / check - symbolic or base discount
    discountAmount = Math.min(baseTotal, 350)
  }

  const finalTotal = Math.max(0, baseTotal - discountAmount)
  return { discountAmount, finalTotal }
}

export function formatPromoNote(promo: PromoVoucher | null): string {
  if (!promo) return ''
  return `Voucher: ${promo.code} (${promo.discount})`
}

export interface ParsedPromo {
  code: string
  discount: string
}

export function parsePromoFromText(text?: string | null): ParsedPromo | null {
  if (!text) return null

  // Matches "Promo Voucher: CODE (DISCOUNT)" or "Voucher: CODE (DISCOUNT)" or "Voucher: CODE"
  const match = text.match(/(?:Promo\s+)?Voucher:\s*([A-Z0-9_\-]+)(?:\s*\(([^)]+)\))?/i)
  if (match && match[1]) {
    return {
      code: match[1].trim().toUpperCase(),
      discount: match[2]?.trim() || 'Applied',
    }
  }

  // Fallback pattern matching "[CODE: ESCAPE20]" or similar
  const codeMatch = text.match(/Code:\s*([A-Z0-9_\-]+)/i)
  if (codeMatch && codeMatch[1]) {
    return {
      code: codeMatch[1].trim().toUpperCase(),
      discount: 'Active',
    }
  }

  return null
}
