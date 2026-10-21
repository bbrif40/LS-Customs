# Require terms and rules acceptance before transactions

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Before confirming a rental booking, scheduled mechanic booking, roadside request, or payment, show a Terms of Service and Rules modal and require explicit acceptance. This includes cash transactions. Show the rules relevant to the transaction; use a short, clear version for roadside requests. Save the accepted terms version with the transaction record so future changes do not obscure what the customer accepted.

For rentals, explicitly show the agreed return deadline, ₱250 per completed late hour, the 24-hour deadline to settle posted late-return fees, the account flag and rental restriction, and ₱1,000 for each completed succeeding unpaid day starting 48 hours after fee posting. Daily penalties continue until the full balance is paid or waived. The required acknowledgement must occur before rental confirmation.

The requirement covers the customer-facing transactions listed above. Treatment of later admin actions, automatic penalties, and repeated checkout attempts remains unresolved; this decision does not imply that an automatic charge should wait for a new modal acceptance.
