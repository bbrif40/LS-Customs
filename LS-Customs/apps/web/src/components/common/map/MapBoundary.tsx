/**
 * MapBoundary — shared error boundary for the map components.
 *
 * Without this, a runtime error inside Leaflet (e.g. a tile fetch
 * failure, a malformed pin) would bubble up to the nearest error
 * boundary (or none, in which case the whole page white-screens).
 * With it, the map shows a "Map unavailable" skeleton and, in dev
 * mode, surfaces the underlying error message on the page itself so
 * the cause is visible without opening DevTools.
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
          className="map-skeleton"
          style={{
            height: this.props.height,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Map unavailable</div>
            {import.meta.env.DEV && this.state.message && (
              <div style={{ fontSize: 11, color: '#666', maxWidth: 400 }}>
                {this.state.message}
              </div>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
