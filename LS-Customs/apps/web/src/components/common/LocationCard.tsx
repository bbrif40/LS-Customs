/**
 * LocationCard — geolocation picker with map embed.
 * Uses the geocode-address Edge Function for address-to-coordinate lookup
 * and renders the resolved pin on a Leaflet + OpenStreetMap map.
 */
import { useState } from 'react'
import { MapPin, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { MapView } from './map'

interface LocationCardProps {
  onNotify: (message: string) => void
  isExpanded?: boolean
  onToggleExpand?: (expanded: boolean) => void
}

export function LocationCard({ onNotify, isExpanded: isExpandedProp, onToggleExpand }: LocationCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded
  const setIsExpanded = (expanded: boolean) => {
    if (onToggleExpand) onToggleExpand(expanded)
    else setInternalExpanded(expanded)
  }

  const [address, setAddress] = useState('Los Santos International Airport')
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const toggleExpand = () => {
    const nextState = !isExpanded
    setIsExpanded(nextState)
    if (nextState && !coordinates) {
      setCoordinates({ lat: 34.0522, lng: -118.2437 })
      setAddress('Los Santos, San Andreas')
    }
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      onNotify('Location services are not available in this browser')
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setCoordinates({ lat: coords.latitude, lng: coords.longitude })
        setAddress('Current GPS location')
        setIsExpanded(true)
        setLoading(false)
      },
      () => {
        setLoading(false)
        onNotify('Location permission was not granted')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const geocodeAddress = async () => {
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { address, city: 'Los Santos' },
    })
    setLoading(false)
    const resultData = (data as { data?: { lat?: number; lng?: number; formatted_address?: string }; lat?: number; lng?: number; formatted_address?: string } | null)?.data ?? data
    if (error || !resultData?.lat || !resultData?.lng) {
      onNotify(error?.message || 'Unable to find that address')
      return
    }
    setCoordinates({ lat: resultData.lat, lng: resultData.lng })
    setAddress(resultData.formatted_address || address)
    setIsExpanded(true)
  }

  return (
    <article className={`location-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="card-top">
        <div>
          <p className="eyebrow">SHARE YOUR LOCATION</p>
          <h3>{coordinates ? address : isExpanded ? 'Los Santos Map' : 'Open your location'}</h3>
        </div>
        <div className="location-top-controls">
          <button
            type="button"
            className="location-expand-toggle"
            onClick={toggleExpand}
            aria-label={isExpanded ? 'Collapse location map' : 'Expand location map'}
            title={isExpanded ? 'Collapse location map' : 'Expand location map'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isExpanded ? 'Minimize' : 'Expand'}</span>
          </button>
          <MapPin className="pin" size={22} />
        </div>
      </div>
      
      <div className={`location-map-wrapper ${isExpanded ? 'is-expanded' : ''}`}>
        {coordinates ? (
          <MapView
            pins={[
              {
                id: 'me',
                lat: coordinates.lat,
                lng: coordinates.lng,
                title: address,
              },
            ]}
            center={coordinates}
            zoom={15}
            height="100%"
          />
        ) : (
          <div
            className="map-lines"
            onClick={toggleExpand}
            role="button"
            tabIndex={0}
            title="Click to view interactive map"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleExpand()
              }
            }}
          >
            <span />
            <span />
            <span />
            <div className="map-pin">
              <MapPin size={16} />
            </div>
            <div className="map-lines-hint">
              <span>Click to view map</span>
            </div>
          </div>
        )}
      </div>

      <p className="location-helper">Let mechanics see where to meet you for on-site service.</p>
      
      <div className="location-actions">
        <button className="text-button" onClick={useCurrentLocation} disabled={loading}>
          {loading ? 'Locating...' : 'Open my location'} <MapPin size={14} />
        </button>
        <button className="text-button" onClick={() => void geocodeAddress()} disabled={loading}>
          Find address <ChevronRight size={14} />
        </button>
      </div>
    </article>
  )
}
