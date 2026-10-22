export interface AccountQuoteProjection {
  id: string
  customer_id: string
  allocations: unknown
  settled_at: string | null
}

export interface AccountQuoteAttemptProjection {
  id: string
  customer_id: string
  account_quote_id: string | null
  status: string
  created_at: string
}

interface AccountAllocation {
  charge_id: string
  amount: number | string
}

function getAllocations(value: unknown): AccountAllocation[] | null {
  if (!Array.isArray(value)) return null
  const byCharge = new Map<string, number>()

  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const allocation = item as Partial<AccountAllocation>
    if (typeof allocation.charge_id !== 'string' || !allocation.charge_id) return null
    const amount = Number(allocation.amount)
    if (!Number.isFinite(amount) || amount < 0) return null
    byCharge.set(allocation.charge_id, (byCharge.get(allocation.charge_id) ?? 0) + Math.round(amount * 100))
  }

  return Array.from(byCharge, ([charge_id, cents]) => ({ charge_id, amount: cents }))
}

export function accountQuoteChargeIds(quote: AccountQuoteProjection): string[] {
  return getAllocations(quote.allocations)?.map(({ charge_id }) => charge_id) ?? []
}

/** Identifies a quote by the exact charge allocations it covers, independent of booking order. */
export function accountQuoteAllocationIdentity(quote: AccountQuoteProjection): string | null {
  const allocations = getAllocations(quote.allocations)
  if (!allocations?.length) return null
  allocations.sort((left, right) => left.charge_id.localeCompare(right.charge_id))
  return `${quote.customer_id}:${allocations.map(({ charge_id, amount }) => `${charge_id}:${amount}`).join('|')}`
}

/** Keeps one newest pending attempt per customer and allocation set. Settled allocations hide stale attempts. */
export function projectPendingAccountQuoteAttempts<T extends AccountQuoteAttemptProjection>(
  attempts: T[],
  quotes: AccountQuoteProjection[],
): T[] {
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]))
  const settledIdentities = new Set<string>()
  for (const quote of quotes) {
    if (!quote.settled_at) continue
    const identity = accountQuoteAllocationIdentity(quote)
    if (identity) settledIdentities.add(identity)
  }

  const latestPendingByIdentity = new Map<string, T>()
  const passthrough: T[] = []

  for (const attempt of attempts) {
    if (attempt.status !== 'pending' || !attempt.account_quote_id) {
      passthrough.push(attempt)
      continue
    }

    const quote = quoteById.get(attempt.account_quote_id)
    const identity = quote && accountQuoteAllocationIdentity(quote)
    if (!quote || !identity) {
      passthrough.push(attempt)
      continue
    }
    if (settledIdentities.has(identity)) continue

    const key = `${attempt.customer_id}:${identity}`
    const previous = latestPendingByIdentity.get(key)
    if (!previous
      || new Date(attempt.created_at).getTime() > new Date(previous.created_at).getTime()
      || (attempt.created_at === previous.created_at && attempt.id.localeCompare(previous.id) > 0)) {
      latestPendingByIdentity.set(key, attempt)
    }
  }

  return [...passthrough, ...latestPendingByIdentity.values()]
}
