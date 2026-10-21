# Footer newsletter signup

The workspace footer replaces its Navigation column with a form adapted from
[Opensource UI](https://opensourceui.in/components/newsletter-form). The source
license is retained beside `NewsletterForm.tsx`.

The form calls `public.subscribe_newsletter(subscriber_email)` on the Supabase
project configured by the web app's environment. The function validates and
normalizes email addresses, records consent time and signup source, and ignores
duplicates. It returns the same successful result for new and existing addresses.
Anonymous and authenticated visitors cannot read or directly modify the list.

The migration is `20261018140000_newsletter_subscriptions.sql`. Apply it to each
environment before using the form. It has been applied to the currently linked
hosted project and the running local Supabase database.

This feature collects subscriptions; it does not send emails or confirmation
messages. Before running campaigns, connect an email provider and implement its
unsubscribe/suppression flow. Do not advertise automatic unsubscribe links or
confirmation emails until those features exist.

Authorized staff can inspect or export `public.newsletter_subscriptions` through
Supabase Studio. Keep exports private and use consent records when importing to
the mailing provider. Honor opt-out or deletion requests through the support
contact listed in the privacy policy, remove the address from this list, and
suppress it in any mailing provider or previous export before sending again.

Run the database behavior test with:

```sh
node --test scripts/newsletter.test.ts
```

Run from `apps/backend`. The test also runs with the backend test command. It
checks normalization, duplicate handling, invalid input, anonymous access
restrictions, and submissions by signed-in visitors.
