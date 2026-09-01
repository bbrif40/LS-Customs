/**
 * LocationCard — geolocation picker with map embed.
 * Uses the geocode-address Edge Function for address-to-coordinate lookup
 * and renders the resolved pin on a Leaflet + OpenStreetMap map.
 */
import { useState } from 'react'
import { MapPin, ChevronRight } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { MapView } from './map'

interface LocationCardProps {
  onNotify: (message: string) => void
}

export function LocationCard({ onNotify }: LocationCardProps) {
  const [address, setAddress] = useState('Los Santos International Airport')
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(false)

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
  }

  return (
    <article className="location-card">
      <div className="card-top">
        <div>
          <p className="eyebrow">SHARE YOUR LOCATION</p>
          <h3>{coordinates ? address : 'Open your location'}</h3>
        </div>
        <MapPin className="pin" size={24} />
      </div>
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
          height={300}
        />
      ) : (
        <div className="map-lines">
          <span />
          <span />
          <span />
          <div className="map-pin">
            <MapPin size={16} />
          </div>
        </div>
      )}
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
