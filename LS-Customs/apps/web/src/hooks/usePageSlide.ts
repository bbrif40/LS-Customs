import { useLayoutEffect, useRef } from 'react'

/** Animate navigation without remounting pages or clearing their local state. */
export function usePageSlide(pageIndex: number, selector: string) {
  const ref = useRef<HTMLDivElement>(null)
  const previousIndex = useRef(pageIndex)

  useLayoutEffect(() => {
    const previous = previousIndex.current
    previousIndex.current = pageIndex
    if (previous === pageIndex || !ref.current) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const animations: Animation[] = []
    const cancel = () => animations.forEach(animation => animation.cancel())

    ref.current.querySelectorAll<HTMLElement>(selector).forEach(element => {
      if (typeof element.animate !== 'function') return
      const offset = pageIndex > previous ? -20 : 20
      animations.push(element.animate(
        reducedMotion.matches
          ? [{ opacity: 0.65 }, { opacity: 1 }]
          : [{ opacity: 0.65, transform: `translateY(${offset}px)` }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: reducedMotion.matches ? 100 : 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      ))
    })

    reducedMotion.addEventListener('change', cancel)
    return () => {
      cancel()
      reducedMotion.removeEventListener('change', cancel)
    }
  }, [pageIndex, selector])

  return ref
}
