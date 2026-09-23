import { useState, useEffect, useCallback } from 'react'

export interface CustomerSiteSettings {
  // Announcement / Promo Banner
  showBanner: boolean
  bannerText: string
  bannerBg: string
  bannerTextColor: string
  bannerLinkText: string
  bannerLinkView: 'rentals' | 'services' | 'bookings' | 'none'

  // Welcome & Hero
  welcomeSubtitle: string
  heroEyebrow: string
  heroHeadline: string
  heroHeadlineEm: string
  heroSubtitle: string
  heroCtaRentalText: string
  heroCtaServiceText: string

  // Business Information
  companyName: string
  supportPhone: string
  supportEmail: string
  address: string
  workingHours: string

  // Theme Accent
  accentColor: string
}

export const DEFAULT_SITE_SETTINGS: CustomerSiteSettings = {
  showBanner: true,
  bannerText: '🔥 FLASH SALE: 20% off all exotic car rentals this weekend! Code: ESCAPE20',
  bannerBg: '#e8a838',
  bannerTextColor: '#000000',
  bannerLinkText: 'Claim Offer',
  bannerLinkView: 'rentals',

  welcomeSubtitle: 'Your garage is in good hands. What do you need today?',
  heroEyebrow: 'LS CUSTOMS CONCIERGE',
  heroHeadline: 'Premium vehicles.',
  heroHeadlineEm: 'Precision service.',
  heroSubtitle: 'Experience the perfect blend of high-end car rentals and on-demand, expert mobile mechanics.',
  heroCtaRentalText: 'Rent a vehicle',
  heroCtaServiceText: 'Book a mechanic',

  companyName: 'LS Customs',
  supportPhone: '+63 (02) 8888-5700',
  supportEmail: 'concierge@lscustoms.com',
  address: '100 Portola Drive, Rockford Hills',
  workingHours: 'Open 24/7 for Emergency Dispatch · Showroom 8AM - 9PM',

  accentColor: '#e8a838',
}

const STORAGE_KEY = 'ls_customs_site_settings'
const EVENT_KEY = 'ls-site-settings-changed'

function loadStoredSettings(): CustomerSiteSettings {
  if (typeof window === 'undefined') return DEFAULT_SITE_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SITE_SETTINGS
    return { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(raw) }
  } catch (err) {
    console.warn('[useCustomerSiteSettings] Error loading stored settings:', err)
    return DEFAULT_SITE_SETTINGS
  }
}

export function useCustomerSiteSettings() {
  const [settings, setSettings] = useState<CustomerSiteSettings>(loadStoredSettings)

  useEffect(() => {
    if (typeof document !== 'undefined' && settings.accentColor) {
      document.documentElement.style.setProperty('--brand-accent', settings.accentColor)
      document.documentElement.style.setProperty('--accent', settings.accentColor)
    }
  }, [settings.accentColor])

  useEffect(() => {
    const handleSync = () => {
      const updated = loadStoredSettings()
      setSettings(updated)
      if (typeof document !== 'undefined' && updated.accentColor) {
        document.documentElement.style.setProperty('--brand-accent', updated.accentColor)
        document.documentElement.style.setProperty('--accent', updated.accentColor)
      }
    }

    window.addEventListener(EVENT_KEY, handleSync)
    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener(EVENT_KEY, handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [])

  const saveSettings = useCallback((newSettings: CustomerSiteSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings))
      setSettings(newSettings)
      window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: newSettings }))
    } catch (err) {
      console.error('[useCustomerSiteSettings] Error saving settings:', err)
    }
  }, [])

  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      setSettings(DEFAULT_SITE_SETTINGS)
      window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: DEFAULT_SITE_SETTINGS }))
    } catch (err) {
      console.error('[useCustomerSiteSettings] Error resetting settings:', err)
    }
  }, [])

  return {
    settings,
    saveSettings,
    resetSettings,
  }
}
