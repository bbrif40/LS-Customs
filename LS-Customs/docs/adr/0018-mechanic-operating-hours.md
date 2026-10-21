# Configure scheduled and roadside operating hours separately

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Limit scheduled mechanic appointments to admin-configured working hours and show only bookable appointment times. Configure roadside assistance availability separately; do not present it as available 24/7 unless staffing supports that coverage.

Operating hours describe when the service is offered; individual mechanic capacity must still be secured under the agreed confirmation rules. At launch, scheduled mechanic appointments operate daily from 8 AM to 6 PM, Philippine time (Asia/Manila). The last appointment must start early enough for its estimated service duration to finish by 6 PM. At launch, roadside assistance uses the same daily 8 AM to 6 PM Philippine-time hours. Outside those hours, show roadside assistance as unavailable and do not accept a new request. Admins may configure roadside hours separately when staffing supports extended coverage.



Before confirming a roadside request, require an available mechanic whose estimated travel time plus service duration permits arrival and completion before the configured roadside closing time (6 PM at launch). Requests near closing must not promise coverage beyond supported hours.

If an accepted job unexpectedly runs past closing, allow the mechanic to continue; do not automatically terminate the job at closing. Alert admins and keep the customer updated. Extra work or charges still require the agreed customer approval. Closing limits new booking commitments rather than abandoning active work.
