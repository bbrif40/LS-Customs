/**
 * Edge Function: create-ticket
 *
 * Structured ticket submission endpoint used by the client chatbot form.
 * Replaces the old "free-text in chat" flow with an explicit form that
 * captures category, severity, and description up front, and returns
 * a human-readable tracking number (TKT-YYYYMMDD-XXXX).
 *
 * Auth: requires the caller's JWT (authenticated). customer_id is taken
 *       from auth.uid() — never trusted from the request body.
 *
 * Request body:
 *   { category, priority, description, subject? }
 *
 * Response:
 *   { data: { id, tracking_number, category, priority, status, created_at }, error: null }
 */

import {
  createServiceClient,
} from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Category = "general" | "rental" | "billing" | "bug" | "mechanic" | "other"
type Priority = "low" | "medium" | "high" | "critical"
type Status = "open" | "in_progress" | "resolved" | "closed"

const CATEGORIES: readonly Category[] = ["general", "rental", "billing", "bug", "mechanic", "other"] as const
const PRIORITIES: readonly Priority[] = ["low", "medium", "high", "critical"] as const

function badRequest(message: string, status = 400) {
  return new Response(
    JSON.stringify({ data: null, error: { message } }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  )
}

/**
 * Build a 4-char tracking suffix from a hash of customer+timestamp+description.
 * Not cryptographic — just stable enough that the same inputs collide (good
 * for the same human re-submitting) and distinct enough that the unique index
 * has room to breathe across real submissions.
 */
function trackingSuffix(customerId: string, ts: number, description: string): string {
  const seed = `${customerId}|${ts}|${description}`
  // FNV-1a 32-bit, base36 → upper 4 chars
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0")
  return hex.slice(0, 4).toUpperCase()
}

function buildTrackingNumber(customerId: string, ts: number, description: string): string {
  const d = new Date(ts)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `TKT-${yyyy}${mm}${dd}-${trackingSuffix(customerId, ts, description)}`
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return badRequest("Method not allowed", 405)
  }

  // Verify the caller. RLS will refuse inserts with a fake customer_id, but
  // we want a clean 401 instead of a database error.
  const authHeader = req.headers.get("Authorization") ?? ""
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return badRequest("Missing bearer token", 401)
  }

  const supabase = createServiceClient()
  const { data: userData, error: userErr } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  )
  if (userErr || !userData?.user?.id) {
    return badRequest("Invalid or expired session", 401)
  }
  const customerId = userData.user.id

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return badRequest("Body must be JSON")
  }

  const rawCategory = String(body.category ?? "").toLowerCase() as Category
  const rawPriority = String(body.priority ?? "").toLowerCase() as Priority
  const description = String(body.description ?? "").trim()
  const subject = String(body.subject ?? "").trim() || "Support Request"

  if (!CATEGORIES.includes(rawCategory)) {
    return badRequest(`Invalid category. Must be one of: ${CATEGORIES.join(", ")}`)
  }
  if (!PRIORITIES.includes(rawPriority)) {
    return badRequest(`Invalid priority. Must be one of: ${PRIORITIES.join(", ")}`)
  }
  if (description.length < 5) {
    return badRequest("Description must be at least 5 characters")
  }
  if (description.length > 4000) {
    return badRequest("Description must be at most 4000 characters")
  }

  const category: Category = rawCategory
  const priority: Priority = rawPriority
  const now = Date.now()
  const status: Status = "open"
  const trackingNumber = buildTrackingNumber(customerId, now, description)

  // Subject prefix to surface category at a glance in the admin list.
  // Keep the column short — admin pagination depends on it fitting.
  const prefixedSubject = `[${category.toUpperCase()}] ${subject}`.slice(0, 120)

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      customer_id: customerId,
      category,
      priority,
      status,
      subject: prefixedSubject,
      description,
      tracking_number: trackingNumber,
    })
    .select("id, tracking_number, category, priority, status, subject, created_at")
    .single()

  if (error) {
    // Unique tracking number collision — exceedingly rare with 4 hex chars
    // (~65k space per day), but worth handling cleanly. Retry once with a
    // fresh suffix by perturbing the timestamp.
    if (/support_tickets_tracking/i.test(error.message)) {
      const retry = buildTrackingNumber(customerId, now + 1, description + " ")
      const retryInsert = await supabase
        .from("support_tickets")
        .insert({
          customer_id: customerId,
          category,
          priority,
          status,
          subject: prefixedSubject,
          description,
          tracking_number: retry,
        })
        .select("id, tracking_number, category, priority, status, subject, created_at")
        .single()
      if (retryInsert.error) {
        return jsonResponse({ data: null, error: { message: retryInsert.error.message } }, null, 500)
      }
      return jsonResponse({ data: retryInsert.data, error: null }, null, 201)
    }
    return jsonResponse({ data: null, error: { message: error.message } }, null, 500)
  }

  return jsonResponse({ data, error: null }, null, 201)
})
