import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useEffect, useRef, useState } from 'react'
import { Quote, Star } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './SidebarTestimonials.css'

interface SidebarTestimonial {
  review_id: string
  rating: number
  comment: string
  acquired_label: string
}

function isSidebarTestimonial(value: unknown): value is SidebarTestimonial {
  if (!value || typeof value !== 'object') return false
  const review = value as Record<string, unknown>
  return typeof review.review_id === 'string'
    && typeof review.rating === 'number'
    && Number.isInteger(review.rating)
    && review.rating >= 1
    && review.rating <= 5
    && typeof review.comment === 'string'
    && Boolean(review.comment.trim())
    && typeof review.acquired_label === 'string'
    && Boolean(review.acquired_label.trim())
}

const ROTATE_INTERVAL_MS = 8_000
const SAMPLE_REVIEWS: SidebarTestimonial[] = [
  { review_id: 'sample-rental', rating: 5, comment: 'The car was clean and comfortable for our weekend trip. Pickup was straightforward, and there was plenty of room for our bags.', acquired_label: 'Vehicle rental · Weekend trip' },
  { review_id: 'sample-battery', rating: 5, comment: 'The mechanic explained the battery checks clearly and walked me through the recommended next step. Having someone come to me made the visit convenient.', acquired_label: 'Mobile mechanic · Battery inspection' },
  { review_id: 'sample-diagnostics', rating: 4, comment: 'I appreciated the clear explanation of the warning light and the options for further checks. Booking the visit was easy.', acquired_label: 'Mobile mechanic · Vehicle diagnostics' },
]

export function SidebarTestimonials() {
  const websiteText = useWebsiteText("Navigation")

  const [reviews, setReviews] = useState<SidebarTestimonial[]>(import.meta.env.DEV ? SAMPLE_REVIEWS : [])
  const [loading, setLoading] = useState(!import.meta.env.DEV)
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const [inViewport, setInViewport] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_sidebar_testimonials')
        if (!active) return
        if (error) {
          setReviews([])
          setLoading(false)
          return
        }

        const validReviews = ((data ?? []) as unknown[]).filter(isSidebarTestimonial)
        setReviews(validReviews.slice(0, 10))
        setLoading(false)
      } catch {
        if (!active) return
        setReviews([])
        setLoading(false)
      }
    })()

    return () => { active = false }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) setPaused(true)
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setPaused(true)
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    if (!('IntersectionObserver' in window)) {
      setInViewport(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting))
    observer.observe(section)
    return () => observer.disconnect()
  }, [reviews.length])

  const isAutoPlaying = reviews.length > 1 && !paused && !hovered && !focused && pageVisible && inViewport

  useEffect(() => {
    if (!isAutoPlaying) return
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % reviews.length)
    }, ROTATE_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [isAutoPlaying, reviews.length])

  if (loading || reviews.length === 0) return null

const visibleReviews = reviews.length > 1 ? [reviews[activeIndex], reviews[(activeIndex + 1) % reviews.length]] : [reviews[activeIndex]]

  return (
    <section
      ref={sectionRef}
      className="sidebar-testimonials"
      aria-label={websiteText("Customer reviews")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <header className="sidebar-testimonials-heading">
        <h2>{import.meta.env.DEV ? websiteText("Customer reviews · Sample preview") : websiteText("From our customers")}</h2>
        <Quote size={17} aria-hidden="true" />
      </header>

      <div className="workspace-review-grid">{visibleReviews.map((current) => (<article key={current.review_id} className="sidebar-testimonial-content" aria-live={isAutoPlaying ? 'off' : 'polite'} aria-atomic="true">
        <div className="sidebar-testimonial-stars" role="img" aria-label={websiteText("{value1} out of 5 stars", { value1: String(current.rating) })}>
          {Array.from({ length: 5 }, (_, index) => (
            <Star
              key={index}
              size={13}
              aria-hidden="true"
              fill={index < current.rating ? 'currentColor' : 'none'}
            />
          ))}
        </div>
        <blockquote>{current.comment}</blockquote>
        <div className="sidebar-testimonial-attribution">
          <strong>{import.meta.env.DEV ? websiteText("Sample review · For demonstration") : websiteText("Verified customer")}</strong>
          <span>{current.acquired_label}</span>
        </div>
      </article>))}</div>
    </section>
  )
}
