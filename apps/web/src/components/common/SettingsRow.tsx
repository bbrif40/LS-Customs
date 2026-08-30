/**
 * SettingsRow — clickable settings item with icon, title, and detail description.
 */
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface SettingsRowProps {
  icon: ReactNode
  title: string
  detail: string
  onClick: () => void
}

export function SettingsRow({ icon, title, detail, onClick }: SettingsRowProps) {
  return (
    <button className="settings-row" onClick={onClick}>
      <span className="settings-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={17} />
    </button>
  )
}
