import { useEffect, useRef } from 'react'

/** Keyboard containment and focus restoration for modal dialogs. */
export function useDialog(onClose: () => void, open = true) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0)
    ;(focusable()[0] ?? ref.current)?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const index = elements.indexOf(document.activeElement as HTMLElement)
      if (!elements.length) { event.preventDefault(); ref.current?.focus(); return }
      if (event.shiftKey ? index <= 0 : index < 0 || index === elements.length - 1) {
        event.preventDefault()
        elements[event.shiftKey ? elements.length - 1 : 0]?.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus() }
  }, [open])
  return ref
}
