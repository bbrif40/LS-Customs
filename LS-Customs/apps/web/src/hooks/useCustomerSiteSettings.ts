import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface CustomerSiteSettings {
  // Announcement / Promo Banner
  showBanner: boolean
  bannerText: string
  bannerBg: string
  bannerTextColor: string
  bannerLinkText: string
  bannerLinkView: 'rentals' | 'services' | 'bookings' | 'none'

  // Primary Promo/Voucher
  promoCode: string
  promoDiscount: string
  promoTitle: string

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

  promoCode: 'ESCAPE20',
  promoDiscount: '20%',
  promoTitle: 'Flash Sale: 20% Off Exotic Fleet',

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

// The hosted row is authoritative; local storage is only an offline cache.
const STORAGE_KEY = 'ls_customs_site_settings'
function loadStoredSettings(): CustomerSiteSettings {
  try { return { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } }
  catch { return DEFAULT_SITE_SETTINGS }
}
export function useCustomerSiteSettings() {
  const [settings, setSettings] = useState<CustomerSiteSettings>(loadStoredSettings)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const apply = useCallback((value: CustomerSiteSettings) => {
    setSettings(value)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* cache optional */ }
  }, [])
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('customer_site_settings').select('settings').eq('id', 1).single()
    if (error) { setError('Unable to load the latest website settings.'); return }
    apply({ ...DEFAULT_SITE_SETTINGS, ...data.settings })
    setError('')
  }, [apply])
  useEffect(() => {
    void refresh()
    const channel = supabase.channel('customer-site-settings-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_site_settings' }, () => { void refresh() })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh() })
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('online', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(onVisible, 30000)
    return () => { void supabase.removeChannel(channel); window.removeEventListener('online', onVisible); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer) }
  }, [refresh])
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-accent', settings.accentColor)
    document.documentElement.style.setProperty('--accent', settings.accentColor)
  }, [settings.accentColor])
  const saveSettings = useCallback(async (value: CustomerSiteSettings) => {
    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('customer_site_settings').update({ settings: value }).eq('id', 1).select('id').single()
      if (error) { setError('Settings could not be saved. Check your admin access and connection.'); return false }
      apply(value); return true
    } catch { setError('Settings could not be saved. Check your connection.'); return false }
    finally { setSaving(false) }
  }, [apply])
  const resetSettings = useCallback(() => saveSettings(DEFAULT_SITE_SETTINGS), [saveSettings])
  return { settings, saveSettings, resetSettings, error, saving }
}
