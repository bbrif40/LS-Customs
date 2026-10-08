# Simulation remediation — 2026-10-08

## Verified changes

- Admin paid amounts and outstanding balance now use actual succeeded payment records; booking timestamps use `created_at`.
- Booking completion and revenue viewing no longer create payments or mark pending payments succeeded. Overview revenue also excludes unpaid completed bookings.
- Mechanic lookup uses the schema's `mechanic_profiles.id`, not nonexistent `user_id`.
- Confirmed service bookings can be assigned; existing notification rows are reused instead of duplicated.
- Edit saves rental pickup instructions/service notes.
- Saved addresses with unknown GPS require a confirmed pin; `(0,0)` placeholders become null, and changing address text clears old GPS.
- Review uses the same dispatch distance/fee as the location quote.
- Realtime topics are unique per hook instance; duplicate overview mount removed. Admin Auth callbacks defer profile reads.
- Refund success depends on the actual refund endpoint; receipt failure is a warning after a valid payment save.
- Approved unpaid bookings send a booking confirmation; a paid receipt still requires a succeeded payment. Admin detail has a confirmation retry action.
- Notification provider failures are honest, simulated success is removed, dispatch claims prevent concurrent duplicate sends, retries preserve accepted channels, and customer retries cannot spoof another recipient/message.
- Admin notification read policy and customer read-state-only update guard have SQL tests.
- Vehicle photo failures use a labelled illustration; real fleet photos still need operator uploads.
- A migration disables published seeded password matches and their admin role/sessions while preserving rotated private passwords. **Production application of this security migration awaits private admin access confirmation.** The admin password form is ready for the human to submit; no new password is entered by the agent.

## Checks

- Production web build and frontend TypeScript: passed. Vite warns about a large initial JavaScript chunk; performance tuning remains structural debt.
- Backend TypeScript: passed.
- Deno Edge contracts, provider/signature/template/OTP tests: 30 passed.
- PostgreSQL/PGlite booking, permissions, delivery, coordinates and phone recovery tests: 34 passed.
- Local isolated OTP browser regression: 8 scenarios passed, including existing Google email and profile-added phone; no real messages sent.
- Local isolated customer browser regression: 4 scenarios, 21 checkpoints passed, no browser exceptions.
- Local isolated admin regression: 7 checks passed: no duplicate-channel crash; real unpaid totals; persisted edit; confirmed assignment available; completion/revenue do not write payments; overview uses only succeeded payment data.

## Deployment record

Supabase delivery and coordinate migrations were applied successfully to `reyghhsjiwyabhgbgubt`. `dispatch-notification`, `send-booking-confirmation`, and `send-receipt` deployed successfully. Fix commit `5fdbef8967a89cfd3f9fb522011bf6740cbc3a7f` was pushed to Git `main`. Vercel deployment `ls-customs-dsf43obnv-ls-customs.vercel.app` is READY for that exact SHA and aliased to `https://ls-customs-web.vercel.app/`. All isolated production-bundle browser tests passed: 8 OTP scenarios, 21 customer checkpoints and 7 admin checks. A normal signed-in production admin reload loaded without the error screen; the actual simulation rental displayed amount paid 0 and outstanding 2,800, matching its unpaid database state. No resend/payment action was clicked. Seeded-admin revocation remains pending until the user confirms a private admin password is ready.

## Limits and data requiring review

No PayMongo charge or real refund was performed. Original SMS/email receipt was confirmed by the user; inbox/phone delivery was not directly inspected. Provider acceptance is not delivery confirmation. No newly built physical APK was tested; an existing APK needs rebuilding/syncing to receive frontend changes. Existing historical fake payment records cannot be distinguished safely from legitimate manual cash records solely by looking at a status; no financial history was deleted or rewritten. Historical bookings with invented/missing GPS require a customer-confirmed location. The live simulation's two bookings remain active.

An earlier supplemental unpaid-receipt diagnostic was rejected by automatic approval review because it could send real email/create delivery records. It was not retried; remediation verification uses isolated endpoint mocks and read-only/normal UI checks.

See `PROJECT-STRUCTURE-CODE-REVIEW-2026-10-08.md` for source locations, excerpts, runtime relationships, and run/deployment commands.
