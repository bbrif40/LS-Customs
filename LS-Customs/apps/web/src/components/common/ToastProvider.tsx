/**
 * ToastProvider — global stacked toast notification system.
 *
 * Usage:
 *   1. Wrap your app (or a subtree) with <ToastProvider>.
 *   2. In any child component, call useToast() to get the `toast` helper.
 *   3. Call toast.success('Saved!'), toast.error('Failed'), toast.info('…'), toast.warning('…')
 *
 * Toasts auto-dismiss after 4 s and can be closed early.
 * They stack from the bottom-right with smooth slide-in/out.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  body?: string
}

interface ToastContextValue {
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
  warning: (title: string, body?: string) => void
  info: (title: string, body?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

const VARIANT_META: Record<ToastVariant, { icon: typeof CheckCircle2; label: string }> = {
  success: { icon: CheckCircle2, label: 'Success' },
  error:   { icon: XCircle,      label: 'Error' },
  warning: { icon: AlertTriangle, label: 'Warning' },
  info:    { icon: Info,         label: 'Info' },
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const { icon: Icon, label } = VARIANT_META[item.variant]
  return (
    <div className={`toast-item toast-${item.variant}`} role="alert" aria-live="polite">
      <span className="toast-item-icon" aria-label={label}>
        <Icon size={17} />
      </span>
      <div className="toast-item-body">
        <strong>{item.title}</strong>
        {item.body && <span>{item.body}</span>}
      </div>
      <button
        className="toast-item-close"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (variant: ToastVariant, title: string, body?: string) => {
      const id = genId()
      setToasts((prev) => [...prev.slice(-4), { id, variant, title, body }])
      window.setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  const ctx: ToastContextValue = {
    success: (t, b) => push('success', t, b),
    error:   (t, b) => push('error',   t, b),
    warning: (t, b) => push('warning', t, b),
    info:    (t, b) => push('info',    t, b),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack" aria-label="Notifications" role="region">
          {toasts.map((item) => (
            <ToastItem key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/** Call inside any component wrapped by ToastProvider to get toast helpers. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
