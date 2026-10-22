import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectPendingAccountQuoteAttempts } from '../../web/src/utils/adminTransactionProjection.ts'

const customer = 'customer-1'
const allocations = [{ charge_id: 'base', amount: 259.99 }, { charge_id: 'fee', amount: 215 }]
const quote = (id: string, settled_at: string | null = null) => ({ id, customer_id: customer, allocations, settled_at })
const attempt = (id: string, account_quote_id: string, created_at: string, status = 'pending') =>
  ({ id, customer_id: customer, account_quote_id, status, created_at })

test('retried checkouts for the same balance show as one pending transaction', () => {
  const quotes = [quote('q1'), quote('q2'), { ...quote('q3'), allocations: [...allocations].reverse() }]
  const rows = projectPendingAccountQuoteAttempts([
    attempt('p1', 'q1', '2026-10-22T00:31:00Z'),
    attempt('p2', 'q2', '2026-10-22T00:50:00Z'),
    attempt('p3', 'q3', '2026-10-22T01:10:00Z'),
  ], quotes)
  assert.deepEqual(rows.map((row) => row.id), ['p3'])
})

test('a settled quote hides stale pending attempts but keeps non-pending history', () => {
  const rows = projectPendingAccountQuoteAttempts([
    attempt('p1', 'q1', '2026-10-22T00:31:00Z'),
    attempt('p2', 'q2', '2026-10-22T00:50:00Z', 'succeeded'),
  ], [quote('q1'), quote('q2', '2026-10-22T00:51:00Z')])
  assert.deepEqual(rows.map((row) => row.id), ['p2'])
})
