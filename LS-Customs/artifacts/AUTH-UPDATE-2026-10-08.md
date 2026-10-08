# Registration and existing-account OTP report — 2026-10-08

## Findings and fixes

1. **Login could create an unintended account.** The previous OTP flow allowed automatic user creation. Login now sets `shouldCreateUser: false`; only the explicit create-account flow permits new users. Email addresses are trimmed and normalized. [Supabase OTP documentation](https://supabase.com/docs/reference/javascript/auth-signinwithotp).
2. **Google account phone was only in the profile.** A phone added later in Profile was not an SMS identity in Supabase Auth. The new service-only SMS challenge resolves a unique customer profile, verifies possession of its phone, and issues a session for the original Google account UUID. Existing bookings remain attached to that UUID. Ambiguous contacts require email/Google login; accounts are never blindly merged.
3. **Profile loading could briefly resemble a new account.** Authentication now waits for the current profile result before deciding whether account setup is needed. Missing profiles are backfilled with their existing Auth UUID; existing profiles are preserved.
4. **Registration looked like login.** Registration now has a distinct green header, new-account badge, name field, benefits, and contact-verification steps. Login has separate returning-member wording and actions.
5. **Mobile navigation covered the modal.** The authentication backdrop now appears above sticky navigation. Desktop and mobile screenshots were reviewed.

## Verification

- Web TypeScript check and production build passed.
- Backend secret scan and Edge Function type checks passed.
- Eleven new PostgreSQL tests passed: original identity/bookings, expiry, replay, attempt limits, quotas, contact changes, ambiguity, unknown contacts and service-only permissions.
- Twenty-four Edge Function tests passed, including nine new OTP handler tests covering SMS failures, invalid codes and identity mismatch rejection.
- Eight isolated browser scenarios passed: existing Gmail, Google profile phone, existing Auth SMS, unknown email/SMS login, desktop/mobile registration and new signup. API fixtures deliberately use synthetic accounts and assert preserved identity.
- Broader website navigation regression: four scenarios, 21 checkpoints passed.
- The full backend suite has one pre-existing failing booking test referencing absent migration `20261006120100_disable_seeded_admin_passwords.sql`; the remaining 28 PostgreSQL tests passed. This unrelated missing migration remains unresolved.

## Deployment and limits

Production Supabase migration `20261008120000_customer_phone_otp.sql` and function `customer-phone-otp` are included in this release. Challenges expire after ten minutes, permit five verification attempts, have one-minute send cooldowns and three requests per hour per phone, and cannot be read by customer sessions.

Browser identity checks use isolated API fixtures, not a member's real SMS/email codes. Actual delivery and sign-in on the member's device still require their OTP. No existing accounts were merged or deleted. The October 6 APK was not rebuilt in this change; the deployed website uses the updated source.
