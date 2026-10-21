# Collect roadside cash after service

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. For roadside assistance paid in cash, confirm the request once a mechanic has been secured and show “Cash due after service.” The mechanic records cash collection after service, following the scheduled mechanic service cash rules: completed work may remain unpaid, unpaid completed work is flagged for admin follow-up, and admin corrections require an audit trail. Require the short roadside Terms of Service and Rules acceptance before confirming the request.

This commits mechanic capacity before collecting payment so roadside customers can receive assistance. The rental-specific late-return charges, daily penalties, and account flag policy do not automatically apply to unpaid mechanic or roadside service charges.
