# Guided AI planner

The assistant has two entry modes: trip/rental planning and car-problem guidance.
Both use the configured OpenRouter model to interpret the conversation and ask
adaptive follow-up questions. The backend requests structured recommendations;
the model does not execute booking or payment operations.

## Live data and handoffs

Each request reads active `vehicles` and `mechanic_services` from Supabase. Card
IDs, names, and PHP prices come from those records. Vehicle candidates are checked
against verified passenger, budget, and preference evidence. With validated dates,
the backend checks `unavailable_vehicles`; a failed check suppresses dated cards.
Availability is a snapshot and is checked again by the booking flow.

A trip itinerary can appear independently of a vehicle match. Suggested stops
require the traveler to verify access, opening hours, conditions, and costs.
Itineraries do not reserve activities or accommodation.

Selecting a vehicle opens its live details and carries supported pickup/return
dates into Rentals. The user must choose **Book these dates** to create a rental
booking through the existing booking RPC. Selecting a service opens its live
description in the Mechanic tab, then the user chooses a schedule and completes
the existing review flow. Guests must sign in before either booking flow.

## Guardrails

- JWT identity controls private booking context; a request-body user ID cannot
  grant access. Trip and symptom modes do not fetch private booking history.
- Client-supplied system messages are discarded. Transcript and catalog content
  are treated as untrusted data in the system instructions.
- Recommendations are validated against active catalog records. The AI cannot
  supply a price or arbitrary navigation URL for a card.
- Dates, passenger counts, and budget scope are validated before applying them.
  Ambiguous dates or budgets need clarification instead of a guessed booking.
- Urgent symptoms take a server-controlled safety path without sales cards.
  Chat guidance does not confirm a mechanical diagnosis or give repair clearance.
- Ticket requests open the support form. Prose alone does not create a ticket.
- Input size, history length, provider timeouts, and requests per runtime instance
  are bounded. The in-memory rate limit is not a distributed abuse-control system;
  use provider spend limits and an upstream durable rate limit for larger traffic.
- AI-provider failures return an explicit unavailable response with no invented
  prices or recommendations.

## Configuration and verification

Set `OPENROUTER_API_KEY` on the Edge Function runtime. `OPENROUTER_MODEL` selects
the primary model; the implementation includes bounded fallback attempts. The
chosen provider must support the structured function-call contract. Optional
`CHATBOT_CONVERSATION_SECRET` controls signed conversation identifiers; otherwise
the server-side service-role secret is used for signing. Never expose either
secret in the frontend.

`[functions.chatbot] verify_jwt = false` permits guest planning. The function
verifies caller JWTs itself before using account-owned information. Deployment
must include the chatbot and shared planner module. The frontend uses its existing
configured Supabase project; local Vite does not automatically select local data.

Conversation history is held in the current chat widget and sent in a bounded
window. It is not a durable cross-device memory store. Resetting or changing the
guide starts a new conversation and ignores results from earlier in-flight requests.

Relevant primary references:

- [OpenRouter structured-output support and provider limitations](https://openrouter.ai/docs/guides/features/structured-outputs)
- [AA dashboard warning-light guidance](https://www.theaa.com/breakdown-cover/advice/dashboard-warning-lights)
- [AAA overheating guidance](https://cluballiance.aaa.com/the-extra-mile/advice/car/signs-your-engine-is-overheating)

These references inform implementation constraints; they do not replace a
vehicle inspection, the vehicle's manual, or local emergency assistance.
