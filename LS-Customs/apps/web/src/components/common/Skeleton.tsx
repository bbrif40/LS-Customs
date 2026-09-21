/**
 * Skeleton — shimmer loading placeholder.
 * Use in place of content while data is fetching.
 *
 * @example
 * <Skeleton width="100%" height={120} rounded={8} />
 */
interface SkeletonProps {
  width?: string | number
  height?: string | number
  rounded?: string | number
  className?: string
}

export function Skeleton({ width = '100%', height = 16, rounded = 6, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof rounded === 'number' ? `${rounded}px` : rounded,
      }}
      aria-hidden="true"
    />
  )
}

/** A preset skeleton card for vehicle/service grid items. */
export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <Skeleton height={190} rounded="12px 12px 0 0" />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton height={14} width="60%" />
        <Skeleton height={12} width="40%" />
        <Skeleton height={28} width="80%" rounded={6} />
      </div>
    </div>
  )
}

/** A preset skeleton for stat cards (admin dashboard). */
export function SkeletonStat() {
  return (
    <div className="skeleton-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={12} width="50%" />
        <Skeleton height={28} width={28} rounded="50%" />
      </div>
      <Skeleton height={32} width="60%" />
      <Skeleton height={11} width="45%" />
    </div>
  )
}
