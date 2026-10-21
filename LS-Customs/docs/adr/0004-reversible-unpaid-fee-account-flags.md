# Preserve customer access and records when flagging unpaid fees

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. An unpaid-fee account flag is a reversible admin marker, with changes recorded in the audit log. Preserve customer records and sign-in access so the customer can review and settle the balance. New rentals remain blocked until settlement; mechanic services and roadside assistance remain available under this restriction.

The existing flag-user action bans sign-in and deletes the profile, potentially cascading into booking history. That action must not be used for unpaid-fee flags: preserving the debt history and a way to pay outweighs removing account access. This decision applies to unpaid-fee flags only, not other moderation policies. Daily penalties continue until the entire outstanding late-fee balance, including accumulated daily penalties, is paid. Paying only the original late-return fee does not stop penalties or clear the flag. Once that full balance is settled, stop further daily penalties, automatically clear the unpaid-fee flag, and restore rental booking access under this restriction. Retain the flag and settlement audit history. Automatically apply the unpaid-fee account flag when a late-return fee has remained unpaid for 1 day (24 hours). Measure the 24 hours from when the late-return fee is finalized at vehicle return and posted to the customer account; show the exact payment deadline alongside the fee. A further unpaid-fee penalty of ₱1,000 per succeeding day is required. Apply the first ₱1,000 penalty 48 hours after the original late-return fee is posted, then another ₱1,000 for every additional completed 24-hour period while unpaid; do not charge for partial additional days. Example: posted Monday at 2 PM, flagged Tuesday at 2 PM, first ₱1,000 added Wednesday at 2 PM, next ₱1,000 Thursday at 2 PM.






Admins may waive or reduce late-return charges and daily penalties for mistakes or approved exceptions. Every adjustment requires a reason and an audit history. A balance fully covered by confirmed payments, approved waivers, or both counts as settled and stops daily penalties, clears the unpaid-fee flag, and restores rental access under this restriction. Partial reductions leave the remaining balance outstanding.


Clearing the unpaid late-fee flag removes only its own rental restriction. Restore rental access only if all other blocking balances, including finalized damage charges, are also settled.
