# Email OTP delivery investigation

Hosted `/auth/v1/otp` reproduced HTTP 500 with `Error sending magic link email`. The UI correctly waits for successful delivery before opening OTP entry.

Hosted SMTP configuration currently uses smtp.gmail.com:587, sender bbri7198@gmail.com, but username `gmail`. Google requires the complete email address as the SMTP username. The password remains unverified. CLI config push cannot manage the username alone without a full SMTP configuration; attempted pushes changed no hosted values.

Prepared numeric-code templates for returning users and signup confirmation (`{{ .Token }}`), clearer frontend delivery-error messaging, cleared stale OTP on successful resend, OTP focus, and guarded duplicate verification. Frontend TypeScript and production build passed.

With explicit owner approval, the hosted SMTP username was corrected to the sender’s full Gmail address and both returning-user and signup templates were updated to numeric codes. The existing SMTP password was preserved. Readback verified the new settings. A subsequent OTP request still returns HTTP 500, so successful delivery and end-to-end OTP login remain unverified. The owner approved reading the last five authentication errors from the preceding 20 minutes. Four matching events were present. All reported Gmail SMTP `535 5.7.8 Username and Password not accepted`, including the request after the username correction. This confirms SMTP authentication is the remaining blocker. The SMTP password must be replaced with a valid Gmail app password by the owner in Supabase email settings. No OTP, token, password, user IP, or full auth log is recorded here.

After the owner updated the SMTP credential, the authorized hosted OTP delivery request returned HTTP 200 on 6 October 2026. The former SMTP authentication failure no longer reproduces. Inbox receipt and OTP verification into a session still require the owner to complete the sign-in flow; no code was read or recorded.
