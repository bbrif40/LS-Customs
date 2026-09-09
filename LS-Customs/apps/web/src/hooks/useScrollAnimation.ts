import { useEffect, useRef, useState, type RefObject } from 'react'

type AnimationVariant =
  | ''           // default: fadeInUp
  | 'fade-down'
  | 'fade-left'
  | 'fade-right'
  | 'scale-in'

interface UseScrollAnimationOptions {
  threshold?: number
  rootMargin?: string
  stagger?: boolean  // wrap as stagger-children instead of animate-on-scroll
}

interface ScrollAnimationResult<T extends HTMLElement> {
  ref: RefObject<T>
  className: string
}

/**
 * useScrollAnimation — returns a ref and a className that gains
 * the `.visible` class when the element scrolls into view.
 *
 * Uses IntersectionObserver with a 0.12 threshold by default so
 * animations trigger just as elements enter the viewport.
 * Once triggered, the observer disconnects so the animation
 * doesn't re-fire on scroll-back.
 */
export function useScrollAnimation<T extends HTMLElement>(
  options: UseScrollAnimationOptions = {}
): ScrollAnimationResult<T> {
  const ref = useRef<T>(null)
  const [isVisible, setIsVisible] = useState(false)
  const { threshold = 0.12, rootMargin = '0px 0px -40px 0px', stagger = false } = options

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(element)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  const baseClass = stagger ? 'stagger-children' : 'animate-on-scroll'
  const variantClass = stagger ? '' : (options as any).variant ?? ''
  const className = [
    baseClass,
    isVisible ? 'visible' : '',
    !stagger ? (options as any).variant ?? '' : '',
  ].filter(Boolean).join(' ')

  return { ref, className }
}

/**
 * useStaggerAnimation — like useScrollAnimation but applies the
 * `.stagger-children` class so each direct child animates in
 * sequence with a built-in stagger delay.
 */
export function useStaggerAnimation<T extends HTMLElement>(
  options?: UseScrollAnimationOptions
): ScrollAnimationResult<T> {
  return useScrollAnimation<T>({ ...options, stagger: true })
}
