/**
 * Edge Function: send-receipt
 *
 * Sends a transactional booking / rental / service receipt email to a customer via Resend.
 *
 * Auth: Requires an authenticated JWT. Caller must be an admin OR the booking owner.
 *
 * Receives:
 * - customerName: Customer's display name
 * - customerEmail: Customer's email address
 * - bookingId: The vehicle booking or service booking ID
 * - bookingType: "rental" | "service"
 * - itemTitle?: Name of the vehicle or service (e.g. "Karin Sultan RS" or "Brake System Flush")
 * - amount?: Total amount in PHP
 * - scheduledDate?: Date & time formatted string
 * - location?: Service/pickup address
 *
 * Includes automatic fallback to profile / booking lookup if only bookingId is provided!
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceClient,
  extractJwt,
} from "../_shared/supabaseClient.ts";
import { sendResendReceipt, type ReceiptEmailData } from "../_shared/resend.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(null, {
      code: "VALIDATION_ERROR",
      message: "Method not allowed. Use POST.",
    }, 405);
  }

  try {
    // ------------------------------------------------------------------
    // Authenticate caller
    // ------------------------------------------------------------------
    const jwt = extractJwt(req);
    const supabase = createServiceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return jsonResponse(null, {
        code: "UNAUTHENTICATED",
        message: userError?.message ?? "Missing or invalid JWT",
      }, 401);
    }
    const callerId = userData.user.id;

    // Check if caller is admin
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();
    const isAdmin = callerProfile?.role === "admin";

    const body = await req.json().catch(() => ({}));
    let {
      paymentId,
      bookingId,
      bookingType = "service",
      itemTitle,
      amount,
      scheduledDate,
      location,
    } = body;

    let customerName = body.customerName;
    let customerEmail = body.customerEmail;

    // 1. If paymentId is passed, resolve payment row
    if (paymentId && (!bookingId || amount === undefined)) {
      const { data: pay } = await supabase
        .from("payments")
        .select("id, booking_id, booking_type, amount, customer_id")
        .eq("id", paymentId)
        .maybeSingle();

      if (pay) {
        // Ownership check: caller must own the payment or be admin
        if (!isAdmin && pay.customer_id !== callerId) {
          return jsonResponse(null, {
            code: "FORBIDDEN",
            message: "You do not own this payment",
          }, 403);
        }
        bookingId = bookingId || pay.booking_id;
        bookingType = bookingType || (pay.booking_type === "vehicle" ? "rental" : "service");
        amount = amount !== undefined ? amount : pay.amount;
      }
    }

    // 2. Resolve booking and customer details from database if needed
    if (bookingId) {
      if (bookingType === "rental" || bookingType === "vehicle") {
        const { data: vb } = await supabase
          .from("vehicle_bookings")
          .select("customer_id, start_date, end_date, total_price, vehicles(name)")
          .eq("id", bookingId)
          .maybeSingle();

        if (vb) {
          // Ownership check
          if (!isAdmin && vb.customer_id !== callerId) {
            return jsonResponse(null, {
              code: "FORBIDDEN",
              message: "You do not own this booking",
            }, 403);
          }

          amount = amount !== undefined ? amount : vb.total_price;
          itemTitle = itemTitle || (vb.vehicles as any)?.name || "Premium Vehicle Rental";
          scheduledDate = scheduledDate || `From ${vb.start_date || "Scheduled Date"}`;

          if (!customerName || !customerEmail) {
            if (vb.customer_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", vb.customer_id)
                .maybeSingle();

              customerName = customerName || profile?.full_name || "Valued Customer";

              const { data: userDataRow } = await supabase.auth.admin.getUserById(vb.customer_id);
              customerEmail = customerEmail || userDataRow?.user?.email;
            }
          }
        }
      } else {
        // Fix M-6: Use correct schema columns for service_bookings
        const { data: sb } = await supabase
          .from("service_bookings")
          .select("customer_id, scheduled_at, total_price, pin_lat, pin_lng, address_id")
          .eq("id", bookingId)
          .maybeSingle();

        if (sb) {
          // Ownership check
          if (!isAdmin && sb.customer_id !== callerId) {
            return jsonResponse(null, {
              code: "FORBIDDEN",
              message: "You do not own this booking",
            }, 403);
          }

          amount = amount !== undefined ? amount : sb.total_price;

          // Resolve service names from service_booking_items
          if (!itemTitle) {
            try {
              const { data: items } = await supabase
                .from("service_booking_items")
                .select("mechanic_services(name)")
                .eq("service_booking_id", bookingId);
              const serviceNames = (items as any[])?.map((i) => i.mechanic_services?.name).filter(Boolean).join(", ");
              itemTitle = serviceNames || "Mobile Mechanic Service";
            } catch {
              itemTitle = "Mobile Mechanic Service";
            }
          }

          scheduledDate = scheduledDate || (sb.scheduled_at ? new Date(sb.scheduled_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "As Scheduled");

          // Resolve address if address_id is present
          if (!location && sb.address_id) {
            const { data: addr } = await supabase
              .from("addresses")
              .select("line1, city")
              .eq("id", sb.address_id)
              .maybeSingle();
            location = addr ? `${addr.line1}, ${addr.city}` : "On-site / Customer Location";
          }
          location = location || "On-site / Customer Location";

          if (!customerName || !customerEmail) {
            if (sb.customer_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", sb.customer_id)
                .maybeSingle();

              customerName = customerName || profile?.full_name || "Valued Customer";

              const { data: userDataRow } = await supabase.auth.admin.getUserById(sb.customer_id);
              customerEmail = customerEmail || userDataRow?.user?.email;
            }
          }
        }
      }
    }

    // Fix C-5: If no customer email could be resolved, skip sending instead
    // of falling back to a hardcoded personal address.
    if (!customerEmail) {
      console.warn("[send-receipt] Could not resolve customer email — skipping send.");
      return jsonResponse(null, {
        code: "MISSING_EMAIL",
        message: "Could not resolve customer email address. Receipt not sent.",
      }, 422);
    }

    if (!bookingId && !paymentId) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required bookingId or paymentId parameter",
      }, 400);
    }

    const receiptData: ReceiptEmailData = {
      customerName: customerName || "Valued Customer",
      customerEmail,
      bookingId: String(bookingId || paymentId),
      bookingType,
      itemTitle: itemTitle || (bookingType === "rental" ? "Premium Vehicle Rental" : "Certified Mechanic Service"),
      amount,
      scheduledDate,
      location,
      status: "Confirmed & Succeeded",
    };

    console.log(`[send-receipt] Sending receipt to ${customerEmail} for booking #${bookingId}`);

    const result = await sendResendReceipt(receiptData);

    if (!result.success) {
      console.error("[send-receipt] Resend delivery error:", result.error);
      return jsonResponse(null, {
        code: "DELIVERY_ERROR",
        message: result.error || "Failed to dispatch email receipt via Resend",
      }, 502);
    }

    console.log(`[send-receipt] Receipt sent successfully! Resend ID: ${result.id}`);

    return jsonResponse({
      sent: true,
      id: result.id,
      recipient: customerEmail,
      bookingId,
    }, null, 200);

  } catch (err: unknown) {
    // Handle non-Error throws (e.g., from extractJwt)
    if (err && typeof err === "object" && "status" in err) {
      const errObj = err as { code: string; message: string; status: number };
      return jsonResponse(null, {
        code: errObj.code ?? "UNAUTHENTICATED",
        message: errObj.message,
      }, errObj.status);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-receipt] Unhandled exception:", msg);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: msg,
    }, 500);
  }
});
