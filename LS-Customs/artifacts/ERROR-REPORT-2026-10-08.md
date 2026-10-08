# Website and APK error investigation

Date: 2026-10-08 (Asia/Taipei)

## Fix and website retest — 2026-10-08

**Status: the confirmed post-login channel collision is fixed in the application source.** No further uncaught JavaScript errors were found in the website checks described below. The original investigation and APK limitations are retained later in this report for reference.

### Change

`apps/web/src/hooks/useCustomerSiteSettings.ts` now assigns a different channel topic to each effect execution using a module-local counter. Sidebar, Dashboard, and WorkspaceFooter each own their subscription and cleanup. React StrictMode's cleanup/remount replay also receives a new topic, avoiding reuse while asynchronous cleanup of an earlier channel is still in progress. No hook interface or settings data format changed.

The recovery-button failure was caused by this same collision and does not require a separate button change.

### Verification

The regression harness was made to exit with an error if it captures a crash or JavaScript error. It was run against the original source before the edit: `web-before-fix-results.json` records the reproduced dashboard and retry crashes, and the command exited **1**. After the source fix, without browser code substitution, the same regression and route scan exited **0** against both the development website and rebuilt production website.

| Website test | Development | Production build |
| --- | --- | --- |
| Guest and restored customer session | Pass | Pass |
| Home plus nine customer/public routes | Pass | Pass |
| Invalid SMS code displays an error; valid fixture code opens dashboard | Pass | Pass |
| Two cycles of rentals/mechanic/bookings/profile/home navigation without reload | Pass | Pass |
| Sign-out returns to guest workspace | Pass | Pass |
| Populated dashboard, rental search, vehicle details | Pass | Pass |
| Rental and assigned-mechanic booking details, including absent mechanic phone/location | Pass | Pass |
| Populated booking calendar and mechanic category/service selection | Pass | Pass |
| Missing phone: save number and enter dashboard | Pass | Pass |
| Missing settings row: use defaults without crashing | Pass | Pass |

The expanded flow suite contains 21 checkpoints per build. Expected HTTP 400 messages from the intentionally rejected verification code and HTTP 406 messages from the intentionally missing settings row were recorded separately; they were handled by the app and are not new crashes.

`npm.cmd run build --workspace=apps/web` passed TypeScript validation and generated the production website. Vite still prints its bundle-size warning; that is not a runtime crash and was outside this fix.

### Evidence and rerun

Additional files under `artifacts/apk-test/`:

- `web-before-fix-results.json`: failing regression before the edit.
- `web-after-fix-results.json`: passing development regression and route scan.
- `production-after-fix-results.json`: passing production regression and route scan.
- `website-flows.cjs`: expanded UI interaction suite with isolated API/session fixtures.
- `website-flows-results.json`: passing development interaction suite.
- `production-flows-results.json`: passing production interaction suite.
- Corresponding screenshots prefixed `web-after-fix`, `production-after-fix`, `website-flows`, and `production-flows`.

With the development website running, rerun using:

```powershell
$env:QA_LABEL = 'web-after-fix'
node artifacts/apk-test/browser-check.cjs
node artifacts/apk-test/website-flows.cjs
```

For production, start `npm.cmd run preview --workspace=apps/web -- --host 127.0.0.1 --port 5175` in another terminal and set `QA_URL=http://127.0.0.1:5175` before running the harnesses. Leave `QA_PATCH_CHANNEL` unset: the tests now exercise the real source fix.

### Limits

All new website tests ran locally with controlled fixtures. They exercise the sign-in form and Supabase client transition after a successful verification response, but do not send real SMS or validate a live provider. Real payments, booking submissions, live realtime delivery, admin workflows, and the deployed website were not tested.

The existing October 6 APK remains unchanged and still contains the original bundle. The source fix will apply to a newly built APK after rebuilding the website, syncing Capacitor, and building Android. No updated APK or deployment was produced in this follow-up.

## Main finding

The customer screen crashes after entering the signed-in state because multiple components attempt to configure the same already-subscribed Supabase realtime channel. This was reproduced in the local website and in the exact JavaScript extracted from the supplied APK. It matches the reported timing and error screen. The member's expanded technical error report is still needed to prove their particular occurrence has this same exception.

During the initial investigation, no application source fix or deployment was made. The channel change described below was applied only to responses in the diagnostic browser. The follow-up source fix and website retest are documented above.

## Confirmed error: customer dashboard fails after login

Severity: high — blocks the customer workspace.

Exact exception:

```text
Error: cannot add `postgres_changes` callbacks for realtime:customer-site-settings-db after `subscribe()`.
```

### Cause

`apps/web/src/hooks/useCustomerSiteSettings.ts:89` calls:

```ts
supabase.channel('customer-site-settings-db')
  .on('postgres_changes', /* ... */)
  .subscribe(/* ... */)
```

The hook runs separately in `Sidebar` (line 44), `Dashboard` (line 60), and `WorkspaceFooter` (line 19). The Supabase client returns the existing channel when another caller requests the same topic (`node_modules/@supabase/realtime-js/src/RealtimeClient.ts:453`). After the first caller subscribes, the next caller attempts to register another callback on that channel. The library rejects this while the channel is joining or joined (`RealtimeChannel.ts:879`).

The exception happens during the React effect lifecycle and reaches `RootErrorBoundary`, which displays the screenshot's “Something went wrong” page. Authentication can succeed before this screen fails; this reproduction does not identify an SMS-delivery failure.

The APK reproduction uses the production bundle, so React development StrictMode is not required for the crash.

### Evidence and cause verification

With a synthetic valid session, a customer profile containing a phone number, and a valid settings response:

| Test target | Guest | Signed-in home | Try again |
| --- | --- | --- | --- |
| Local website source in Chromium | No captured JS errors | Same exception and fallback screen | Same crash repeats |
| Exact October 6 APK assets in Chromium | No captured JS errors | Same exception and fallback screen | Same crash repeats |

Changing only the settings channel topic to a unique topic per hook instance, through browser response interception, removed the exception in both targets. No API data changes were needed. This isolates channel reuse as the cause.

Suggested implementation: centralize settings and realtime ownership in a shared provider, or give each hook instance its own stable unique topic and clean up only its own channel. Validate mount/unmount, login/logout, and development StrictMode behavior before shipping. A fresh APK must contain the corrected web bundle; updating a website alone will not replace the assets inside this APK.

## Confirmed consequence: recovery buttons cannot resolve this crash

“Try again” clears the boundary's error and remounts the same components. Both original test targets immediately crash again. The button works as coded, but the underlying channel collision persists. This is a consequence of the main error, rather than an independent root cause. Reloading or returning home also does not change the conflicting channel names.

## Additional page checks

After applying the temporary channel isolation in the test browser, both the website source and APK assets completed these route checks without captured JavaScript errors:

- Signed-in home
- `/rentals`
- `/services`
- `/bookings`
- `/profile`
- `/help`
- `/contact`
- `/terms`
- `/privacy`
- `/faqs`

These are rendering smoke tests with empty catalog/booking lists and a synthetic profile. They do not validate live data, purchases, booking submissions, Stripe, admin permissions, notifications, or real SMS verification. No other production error was confirmed in this scope.

An early test fixture incorrectly returned HTTP 200 with `null` for the settings row and caused a separate `data.settings` exception. Replacing it with a valid settings row eliminated that exception. It is not counted as a confirmed production error: Supabase `.single()` normally reports a missing row as an API error.

## Actual Android APK run: partial, post-login result inconclusive

The supplied APK was installed successfully on an isolated Android 36.1 x86_64 emulator and its activity launched. WebView debugging and Capacitor Preferences storage were accessible. The instrumented native test remained on “LOADING LS CUSTOMS” during its capture windows, for both the initial capture and synthetic-session capture. It did not reach a completed customer screen, so its `crash: false` value is **not** a passing login test.

The reason for the native loading state was not established. It may involve test instrumentation, native bridge/session restoration, or emulator timing. Do not report it as a confirmed member-device error. The confirmed APK crash evidence comes from the exact packaged production assets running in Chromium, not a completed native SMS login.

Actual SMS delivery/verification and the deployed website were not exercised. No member credentials or real verification codes were used, and API fixtures prevented test calls from modifying real records.

## Test artifacts

APK: `artifacts/LS-Customs-2026-10-06.apk`

SHA-256: `60072DEA0E38079E2BCA0E89AB516066EA9E47FEDCBDD2CF76419A80107531A6`

Under `artifacts/apk-test/`:

- `web-results.json`, `web-signed-in.png`: original website crash and retry evidence.
- `apk-assets-results.json`, `apk-assets-signed-in.png`: exact APK bundle crash and retry evidence.
- `web-isolated-channels-results.json`: website diagnostic and route scan.
- `apk-assets-isolated-channels-results.json`: APK bundle diagnostic and route scan.
- `native-results.json`, `native-guest.png`, `native-signed-in.png`: inconclusive native loading captures.
- `native-app.log`, `native-startup.log`: Android log extracts; startup logs include emulator system-process messages which are not app findings.
- `browser-check.cjs`, `serve-apk.cjs`, `native-cdp.cjs`: diagnostic harnesses.

## Reproduction commands

From the repository root, start the website with:

```powershell
npm.cmd run dev --workspace=apps/web -- --host 127.0.0.1
node artifacts/apk-test/browser-check.cjs
```

For the packaged APK asset test, start its local static server in another terminal:

```powershell
node artifacts/apk-test/serve-apk.cjs
$env:QA_URL = 'http://127.0.0.1:5174'
$env:QA_LABEL = 'apk-assets'
node artifacts/apk-test/browser-check.cjs
```

Set `QA_PATCH_CHANNEL=1` and a different `QA_LABEL` to repeat the diagnostic isolation and extended route checks. Remove that variable to test the original code. The harness currently uses this computer's bundled Playwright path; adjust it on another machine. Its test login restores a synthetic session to exercise the screen rendered after successful authentication; it does not send or verify an OTP.
