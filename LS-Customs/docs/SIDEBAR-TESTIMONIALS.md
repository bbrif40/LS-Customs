# Workspace customer reviews

The customer and guest Workspace home pages show a rotating sample of reviews tied to completed rentals or service bookings. The section sits below rentals and services, before the footer. It is hidden when no eligible reviews exist. Desktop shows up to two reviews; mobile shows one. Reviews are selected without favoring high ratings; reviewer identity and booking identifiers are omitted, and common contact details in review text are sanitized.

The carousel layout was informed by [Opensource UI's testimonial component](https://opensourceui.in/components/testimonial), whose source page identifies the component as MIT licensed and credits Bidyut Kundu. This feature was implemented independently without copying its component source or adding a dependency. See the original [MIT license](https://github.com/bidyut10/opensourceui/blob/main/LICENSE), copyright © 2026 Bidyut Kundu.

The `public.get_sidebar_testimonials()` RPC returns at most ten sanitized reviews and generic reviewer labels. Apply `20261018150000_public_sidebar_testimonials.sql` and `20261018151000_preserve_admin_review_access.sql` before enabling the feature in an environment. The RPC is granted to anonymous and authenticated web visitors; direct review reads are scoped to the owner or an administrator. The follow-up migration preserves the existing admin mechanic review-history RPC.

Reviews rotate automatically every eight seconds without navigation buttons. Rotation pauses on hover, keyboard focus, when the page is hidden, and when the card is offscreen. Reduced-motion users start with rotation paused. The section remains in the main page content at all screen heights. Review data is loaded when the Workspace page mounts; refresh the page to fetch newly published reviews.

Run the focused database behavior test from `apps/backend`:

```sh
node --test scripts/sidebar-testimonials.test.mjs
```



