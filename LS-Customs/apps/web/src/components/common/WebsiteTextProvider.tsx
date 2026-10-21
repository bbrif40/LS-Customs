import type { ReactNode } from 'react'
import { useWebsiteTextSync } from '../../hooks/useWebsiteText'
export function WebsiteTextProvider({ children }: { children: ReactNode }) {
  useWebsiteTextSync()
  return <>{children}</>
}
