import { useWebsiteText } from "../../hooks/useWebsiteText"
import { Banknote, CreditCard, Check } from 'lucide-react'
import { useId } from 'react'

export function PaymentMethodChoice({ value, onChange, rental = false }: {
  value: 'online' | 'cash'; onChange: (value: 'online' | 'cash') => void; rental?: boolean
}) {
  const websiteText = useWebsiteText("Shared")

  const name = useId()
  return <fieldset className="payment-method-choice"><legend>{websiteText("Payment method")}</legend>
    <div className="payment-method-options">
      {(['online', 'cash'] as const).map(method => {
        const Icon = method === 'online' ? CreditCard : Banknote
        return <label className={`payment-method-option${value === method ? ' is-selected' : ''}`} key={method}>
          <input type="radio" name={name} value={method} checked={value === method} onChange={() => onChange(method)} />
          <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
          <span><strong>{method === 'online' ? websiteText("Pay online") : rental ? websiteText("Cash at pickup") : websiteText("Cash after service")}</strong>
            <small>{method === 'online' ? rental ? websiteText("After license approval") : websiteText("After mechanic acceptance") : rental ? websiteText("Pay before vehicle handover") : websiteText("Pay when the work is complete")}</small></span>
          <span className="payment-choice-mark" aria-hidden="true">{value === method && <Check size={12} strokeWidth={2.5} />}</span>
        </label>
      })}
    </div>
    {rental && value === 'cash' && <p className="payment-method-note">{websiteText("Confirmed cash reservations cannot be cancelled by customers.")}</p>}
  </fieldset>
}
