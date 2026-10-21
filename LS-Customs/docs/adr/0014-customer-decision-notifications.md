# Notify customers of admin decisions

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Send both an in-app notification and an email when an admin decision changes a customer's booking, payment, license verification, or dispute. Include the outcome, any relevant amount or deadline, and a direct link to the record. Keep license images out of email.

This makes admin decisions actionable without requiring the customer to repeatedly inspect individual records. An email failure does not block or roll back the decision. Keep the in-app notification available, retry email delivery, show delivery status separately, and surface the failure in the admin action queue. Retry timing and the treatment of deadlines when notification delivery fails remain unresolved.


For damage disputes, start the 48-hour response period only at the first successful email or in-app delivery. Record that timestamp and show the resulting exact deadline. Later retries do not restart the window.
