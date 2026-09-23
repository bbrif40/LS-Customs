/**
 * Skeleton — shimmer loading placeholders.
 * Replaces circular loading spinners with structured, content-shaped shimmer animations.
 */

interface SkeletonProps {
  width?: string | number
  height?: string | number
  rounded?: string | number
  className?: string
  dark?: boolean
  style?: React.CSSProperties
}

export function Skeleton({
  width = '100%',
  height = 16,
  rounded = 6,
  className = '',
  dark = false,
  style = {},
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${dark ? 'dark' : ''} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof rounded === 'number' ? `${rounded}px` : rounded,
        ...style,
      }}
      aria-hidden="true"
    />
  )
}

/** Preset skeleton card for vehicle grid items in customer showroom. */
export function VehicleCardSkeleton({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`skeleton-card ${dark ? 'dark' : ''}`} style={{ padding: 0 }} aria-hidden="true">
      <Skeleton height={180} rounded="12px 12px 0 0" dark={dark} />
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton height={13} width="35%" rounded={4} dark={dark} />
          <Skeleton height={13} width="20%" rounded={4} dark={dark} />
        </div>
        <Skeleton height={18} width="65%" rounded={6} dark={dark} />
        <Skeleton height={13} width="50%" rounded={4} dark={dark} />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <Skeleton height={22} width={50} rounded={12} dark={dark} />
          <Skeleton height={22} width={50} rounded={12} dark={dark} />
          <Skeleton height={22} width={50} rounded={12} dark={dark} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <Skeleton height={22} width="40%" rounded={4} dark={dark} />
          <Skeleton height={32} width={90} rounded={8} dark={dark} />
        </div>
      </div>
    </div>
  )
}

/** Preset skeleton card for booking cards (Bookings view). */
export function BookingCardSkeleton() {
  return (
    <div
      className="booking-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#ffffff',
        border: '1px solid var(--line, #e2e8f0)',
        borderRadius: 'var(--radius, 14px)',
        padding: 23,
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '70%' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Skeleton height={20} width={75} rounded={12} />
            <Skeleton height={20} width={50} rounded={12} />
          </div>
          <Skeleton height={12} width="55%" />
        </div>
        <Skeleton height={28} width={28} rounded={6} />
      </div>

      <Skeleton height={20} width="65%" rounded={6} style={{ margin: '14px 0 2px' }} />
      <Skeleton height={13} width="45%" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
        <Skeleton height={22} width="35%" rounded={6} />
        <Skeleton height={14} width="25%" />
      </div>
    </div>
  )
}

/** Preset skeleton grid for Bookings view. */
export function BookingGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="booking-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <BookingCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Preset skeleton for Booking Calendar view. */
export function CalendarSkeleton() {
  return (
    <div
      style={{
        marginTop: 12,
        background: '#ffffff',
        border: '1px solid var(--line, #e2e8f0)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {/* Calendar Header Bar Skeleton */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Skeleton height={42} width={42} rounded={10} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton height={20} width={140} rounded={6} />
            <Skeleton height={12} width={180} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton height={30} width={65} rounded={20} />
          <Skeleton height={30} width={70} rounded={20} />
        </div>
      </div>

      {/* Grid + Inspector Skeleton */}
      <div className="booking-calendar-container">
        <div className="booking-calendar-left-pane">
          <div className="booking-calendar-weekdays" style={{ marginBottom: 12 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} height={14} width="60%" style={{ margin: '0 auto' }} />
            ))}
          </div>
          <div className="booking-calendar-days-grid">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="booking-calendar-day-cell" style={{ padding: 8, background: '#f8fafc', gap: 6 }}>
                <Skeleton height={16} width={16} rounded="50%" />
                {i % 3 === 0 && <Skeleton height={14} width="90%" rounded={4} />}
                {i % 4 === 0 && <Skeleton height={14} width="70%" rounded={4} />}
              </div>
            ))}
          </div>
        </div>

        {/* Right pane skeleton */}
        <div className="booking-calendar-right-pane">
          <Skeleton height={12} width="30%" />
          <Skeleton height={20} width="60%" rounded={6} />
          <Skeleton height={13} width="40%" style={{ marginBottom: 10 }} />
          <div style={{ padding: 16, background: '#ffffff', borderRadius: 12, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton height={14} width="40%" />
              <Skeleton height={18} width={60} rounded={10} />
            </div>
            <Skeleton height={18} width="75%" rounded={6} />
            <Skeleton height={12} width="50%" />
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f8fafc' }}>
              <Skeleton height={18} width="35%" />
              <Skeleton height={14} width="30%" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Preset skeleton for stat cards (Admin Revenue / Overview). */
export function AdminStatSkeleton() {
  return (
    <div
      className="admin-stat-card"
      style={{
        background: 'var(--admin-card, #1a1f2e)',
        border: '1px solid var(--admin-border, #2d3748)',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={13} width="45%" dark />
        <Skeleton height={32} width={32} rounded={8} dark />
      </div>
      <Skeleton height={30} width="55%" rounded={6} dark />
      <Skeleton height={12} width="35%" dark />
    </div>
  )
}

/** Preset skeleton for Admin Revenue Trend Chart. */
export function AdminChartSkeleton() {
  return (
    <div
      style={{
        height: 220,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '10px 0',
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={12} width="10%" dark />
        <Skeleton height={1} width="88%" dark />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={12} width="10%" dark />
        <Skeleton height={1} width="88%" dark />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={12} width="10%" dark />
        <Skeleton height={1} width="88%" dark />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={12} width="10%" dark />
        <Skeleton height={1} width="88%" dark />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12%' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={11} width={35} dark />
        ))}
      </div>
    </div>
  )
}

/** Preset skeleton for Table Rows (Admin). */
export function AdminTableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 16,
            padding: '14px 16px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.05)',
            alignItems: 'center',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '70%' : c === 1 ? '90%' : '50%'} dark />
          ))}
        </div>
      ))}
    </div>
  )
}
