# Keep one admin role

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Use one admin role with equal administrative permissions; do not introduce senior-admin tiers or separate financial approver roles. All admins may perform the authorized booking, collection, refund, waiver, and payment-correction actions. Retain required reasons for adjustments and audit trails identifying the admin responsible.

This favors a simple admin workflow over separation of financial duties. It does not remove the distinction between customers, mechanics, and admins, and it does not make admin actions anonymous.

Every financial admin action must record the responsible admin, timestamp, amount, reason where required, and before/after values. Audit entries cannot be edited or deleted through the admin interface. Correct a financial record with a new audited adjustment rather than rewriting its history.
