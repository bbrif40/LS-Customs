import { useWebsiteText } from '../../../hooks/useWebsiteText'
/**
 * MapBoundary — shared error boundary for the map components.
 *
 * Without this, a React runtime error inside the map (e.g.
 * failure, a malformed pin) would bubble up to the nearest error
 * boundary (or none, in which case the whole page white-screens).
 * With it, the map shows a "Map unavailable" skeleton and, in dev
 * mode, logs the underlying error to the developer console.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  height: number | string
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

function MapUnavailableCopy() {
  const websiteText = useWebsiteText('Shared')
  return <div><div role="alert" style={{ fontWeight: 600, marginBottom: 4 }}>{websiteText('We couldn’t open the map')}</div><p>{websiteText('Please check your connection and reload to restore your route.')}</p><button type="button" className="outline-button" onClick={() => window.location.reload()}>{websiteText('Reload map')}</button></div>
}

export class MapBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[MapBoundary] runtime error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="map-skeleton map-unavailable"
          style={{
            height: this.props.height,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            textAlign: 'center',
          }}
        >
          <MapUnavailableCopy />
        </div>
      )
    }
    return this.props.children
  }
}
