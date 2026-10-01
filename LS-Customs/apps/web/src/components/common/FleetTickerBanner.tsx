/**
 * FleetTickerBanner — continuous infinite moving carousel banner
 * showcasing the available car brand & model logos offered by LS Customs.
 * Pure monochromatic gray with outline only (no color fill, no text).
 */
import { useMemo } from 'react'
import type { Vehicle } from '../../types'

interface FleetTickerBannerProps {
  vehicles?: Vehicle[]
}

// Brand SVG Outline Icons (pure monochromatic gray, outline only, fill=none)
function ToyotaLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Toyota">
      {/* Outer horizontal ellipse */}
      <ellipse cx="26" cy="17" rx="24" ry="15" />
      {/* Inner vertical ellipse (T stem/loop) */}
      <ellipse cx="26" cy="17" rx="8" ry="13.2" />
      {/* Inner top horizontal ellipse (T crossbar) */}
      <ellipse cx="26" cy="11.5" rx="15" ry="6" />
    </svg>
  )
}

function HondaLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Honda">
      {/* Outer trapezoidal badge with rounded corners */}
      <path d="M 10 5.5 C 7.5 5.5 5.8 7.2 6.2 9.8 L 9.8 24.5 C 10.2 26.8 12 28.5 14.5 28.5 L 37.5 28.5 C 40 28.5 41.8 26.8 42.2 24.5 L 45.8 9.8 C 46.2 7.2 44.5 5.5 42 5.5 Z" />
      {/* Stylized 'H' outline */}
      <path d="M 13.5 8 L 19 8 L 19 16.5 L 33 16.5 L 33 8 L 38.5 8 M 16 11 L 16 23.5 C 16 25 18 26 21 26 M 36 11 L 36 23.5 C 36 25 34 26 31 26" />
    </svg>
  )
}

function NissanLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Nissan">
      {/* Modern Nissan circular ring badge outline */}
      <path d="M 8.5 15.5 A 17.5 17.5 0 0 1 43.5 15.5" />
      <path d="M 43.5 18.5 A 17.5 17.5 0 0 1 8.5 18.5" />
      {/* Center bar lines */}
      <line x1="5" y1="15.5" x2="14" y2="15.5" />
      <line x1="38" y1="15.5" x2="47" y2="15.5" />
      <line x1="5" y1="18.5" x2="14" y2="18.5" />
      <line x1="38" y1="18.5" x2="47" y2="18.5" />
      {/* Center brand outline bar */}
      <rect x="13.5" y="14" width="25" height="6" rx="2" />
    </svg>
  )
}

function MitsubishiLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Mitsubishi">
      {/* Top Diamond */}
      <path d="M 26 17 L 21.2 8.7 L 26 0.4 L 30.8 8.7 Z" />
      {/* Bottom Left Diamond */}
      <path d="M 26 17 L 16.4 17 L 11.6 25.3 L 21.2 25.3 Z" />
      {/* Bottom Right Diamond */}
      <path d="M 26 17 L 35.6 17 L 40.4 25.3 L 30.8 25.3 Z" />
    </svg>
  )
}

function FordLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Ford">
      {/* Outer oval */}
      <ellipse cx="26" cy="17" rx="23" ry="13.5" />
      {/* Inner Ford cursive outline */}
      <path d="M 12 20.5 C 14 13.5 17.5 11 21 11 C 23.5 11 23 13 21 15.5 C 19 18 15.5 19 14 19 M 16.5 15 C 23 14.5 28 14.5 35 14 M 27 11.5 C 26 15.5 25 19.5 24 22.5 M 31 16 C 32 14 34.5 14 36.5 16 C 37.5 17 37 19 35 20 C 33 21 31 20 31 18 Z" />
    </svg>
  )
}

function HyundaiLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Hyundai">
      {/* Slanted oval */}
      <ellipse cx="26" cy="17" rx="22.5" ry="13.5" transform="rotate(-6 26 17)" />
      {/* Slanted H outline with sweeping curved crossbar */}
      <path d="M 17 23 L 20.5 10 M 31.5 24 L 35 11" />
      <path d="M 18.5 17.5 C 23 14.5 29 19.5 33.5 16.5" />
    </svg>
  )
}

function SuzukiLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Suzuki">
      {/* Geometric sharp faceted 'S' emblem */}
      <path d="M 17 6.5 L 36 6.5 L 29.5 13 L 22 13 L 27 17 L 35.5 17 L 29 27.5 L 10 27.5 L 16.5 21 L 24 21 L 19 17 L 10.5 17 Z" />
    </svg>
  )
}

function IsuzuLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Isuzu">
      {/* Isuzu classic twin-pillar emblem outline */}
      <polygon points="15,6.5 22,6.5 19.5,27.5 12.5,27.5" />
      <polygon points="29.5,6.5 36.5,6.5 34,27.5 27,27.5" />
    </svg>
  )
}

function BYDLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="BYD">
      {/* Sleek outer pill / capsule badge */}
      <rect x="5" y="8" width="42" height="18" rx="9" />
      {/* B */}
      <path d="M 14 12 L 18 12 C 19.5 12 20.2 12.8 20 14 C 19.8 15 19 15.5 17.5 15.5 L 14 15.5 M 14 15.5 L 18.5 15.5 C 20.2 15.5 21 16.3 20.8 17.5 C 20.5 19 19.5 20 17.5 20 L 14 20 L 14 12" />
      {/* Y */}
      <path d="M 23 12 L 26 16 L 29 12 M 26 16 L 26 20" />
      {/* D */}
      <path d="M 32 12 L 35.5 12 C 38.5 12 40 13.8 39.8 16 C 39.5 18.5 37.8 20 35 20 L 32 20 L 32 12" />
    </svg>
  )
}

function MazdaLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Mazda">
      {/* Outer oval */}
      <ellipse cx="26" cy="17" rx="23" ry="13.5" />
      {/* Inner winged V / M */}
      <path d="M 13.5 13.5 C 18.5 20.5 22.5 22 26 18 C 29.5 22 33.5 20.5 38.5 13.5 C 33.5 18 29.5 17 26 14 C 22.5 17 18.5 18 13.5 13.5 Z" />
    </svg>
  )
}

function MercedesLogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="Mercedes-Benz">
      <circle cx="26" cy="17" r="14" />
      <line x1="26" y1="17" x2="26" y2="3.5" />
      <line x1="26" y1="17" x2="13.8" y2="24" />
      <line x1="26" y1="17" x2="38.2" y2="24" />
    </svg>
  )
}

function BMWElogo() {
  return (
    <svg viewBox="0 0 52 34" className="fleet-ticker-logo-svg" aria-label="BMW">
      <circle cx="26" cy="17" r="14" />
      <circle cx="26" cy="17" r="10.5" />
      <line x1="26" y1="6.5" x2="26" y2="27.5" />
      <line x1="15.5" y1="17" x2="36.5" y2="17" />
    </svg>
  )
}

interface BrandItem {
  id: string
  name: string
  Component: React.ComponentType
}

const ALL_OFFERED_BRANDS: BrandItem[] = [
  { id: 'toyota', name: 'Toyota', Component: ToyotaLogo },
  { id: 'honda', name: 'Honda', Component: HondaLogo },
  { id: 'nissan', name: 'Nissan', Component: NissanLogo },
  { id: 'mitsubishi', name: 'Mitsubishi', Component: MitsubishiLogo },
  { id: 'ford', name: 'Ford', Component: FordLogo },
  { id: 'hyundai', name: 'Hyundai', Component: HyundaiLogo },
  { id: 'isuzu', name: 'Isuzu', Component: IsuzuLogo },
  { id: 'suzuki', name: 'Suzuki', Component: SuzukiLogo },
  { id: 'byd', name: 'BYD', Component: BYDLogo },
  { id: 'mazda', name: 'Mazda', Component: MazdaLogo },
  { id: 'mercedes', name: 'Mercedes-Benz', Component: MercedesLogo },
  { id: 'bmw', name: 'BMW', Component: BMWElogo },
]

export function FleetTickerBanner({ vehicles }: FleetTickerBannerProps) {
  // Determine available brands from the system's vehicles
  const brandList = useMemo(() => {
    if (vehicles && vehicles.length > 0) {
      const detectedKeys = new Set<string>()
      vehicles.forEach((v) => {
        const lower = v.name.toLowerCase()
        if (lower.includes('toyota')) detectedKeys.add('toyota')
        else if (lower.includes('nissan')) detectedKeys.add('nissan')
        else if (lower.includes('honda')) detectedKeys.add('honda')
        else if (lower.includes('mitsubishi')) detectedKeys.add('mitsubishi')
        else if (lower.includes('ford')) detectedKeys.add('ford')
        else if (lower.includes('hyundai')) detectedKeys.add('hyundai')
        else if (lower.includes('isuzu')) detectedKeys.add('isuzu')
        else if (lower.includes('suzuki')) detectedKeys.add('suzuki')
        else if (lower.includes('byd')) detectedKeys.add('byd')
        else if (lower.includes('mazda')) detectedKeys.add('mazda')
        else if (lower.includes('mercedes')) detectedKeys.add('mercedes')
        else if (lower.includes('bmw')) detectedKeys.add('bmw')
      })

      const matched = ALL_OFFERED_BRANDS.filter((b) => detectedKeys.has(b.id))
      if (matched.length >= 4) return matched
    }
    // Default to the full suite of vehicles offered in the LS Customs catalog
    return ALL_OFFERED_BRANDS
  }, [vehicles])

  // Duplicate the brand list to create a seamless infinite CSS marquee loop
  const seamlessMarqueeItems = useMemo(() => {
    // 4 passes ensures wide screens have a seamless 50% translation without gaps
    return [...brandList, ...brandList, ...brandList, ...brandList]
  }, [brandList])

  return (
    <div
      className="fleet-ticker-banner"
      role="region"
      aria-label="Available Car Brands & Models Catalog"
    >
      <div className="fleet-ticker-track" aria-hidden="false">
        {seamlessMarqueeItems.map((brand, index) => {
          const Logo = brand.Component
          return (
            <span
              key={`${brand.id}-${index}`}
              className="fleet-ticker-segment"
              title={brand.name}
            >
              <div className="fleet-ticker-logo-item">
                <Logo />
              </div>
              <span className="fleet-ticker-sep" aria-hidden="true">•</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
