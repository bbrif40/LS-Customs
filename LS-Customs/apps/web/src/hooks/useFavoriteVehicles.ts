import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'ls-customs.favorite-vehicles'

function readFavorites(): string[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function useFavoriteVehicles() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(readFavorites)

  const toggleFavorite = useCallback((vehicleId: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(vehicleId)
        ? current.filter((id) => id !== vehicleId)
        : [...current, vehicleId]
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  useEffect(() => {
    const syncFavorites = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setFavoriteIds(readFavorites())
    }
    window.addEventListener('storage', syncFavorites)
    return () => window.removeEventListener('storage', syncFavorites)
  }, [])

  return {
    favoriteIds,
    isFavorite: (vehicleId: string) => favoriteIds.includes(vehicleId),
    toggleFavorite,
  }
}
