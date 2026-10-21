# Link booking support requests to their transaction context

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Support requests started from a booking automatically include its reference and relevant transaction history. Link the ticket to the booking so customers do not need to repeat details and admins can inspect the relevant context while handling the request.

The link does not grant customers access to internal admin notes or another customer's records. Existing customer-visible booking and payment access boundaries still apply.

Customers may reopen a resolved ticket for the same unresolved issue within 7 days of resolution. Preserve the conversation history and return the ticket to the admin action queue. After that window, offer a new ticket linked to the original so the prior context remains accessible.
