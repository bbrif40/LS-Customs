/**
 * Edge Function: send-receipt
 *
 * Sends a transactional booking / rental / service receipt email to a customer via Resend.
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
import { createServiceClient } from "../_shared/supabaseClient.ts";
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

    const supabase = createServiceClient();

    // 1. If paymentId is passed, resolve payment row
    if (paymentId && (!bookingId || amount === undefined)) {
      const { data: pay } = await supabase
        .from("payments")
        .select("id, booking_id, booking_type, amount, customer_id")
        .eq("id", paymentId)
        .maybeSingle();

      if (pay) {
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

              const { data: userData } = await supabase.auth.admin.getUserById(vb.customer_id);
              customerEmail = customerEmail || userData?.user?.email;
            }
          }
        }
      } else {
        const { data: sb } = await supabase
          .from("service_bookings")
          .select("customer_id, services(name), scheduled_at, price, location_address")
          .eq("id", bookingId)
          .maybeSingle();

        if (sb) {
          amount = amount !== undefined ? amount : sb.price;
          itemTitle = itemTitle || (sb.services as any)?.name || "Mobile Mechanic Service";
          scheduledDate = scheduledDate || (sb.scheduled_at ? new Date(sb.scheduled_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "As Scheduled");
          location = location || sb.location_address || "On-site / Customer Location";

          if (!customerName || !customerEmail) {
            if (sb.customer_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", sb.customer_id)
                .maybeSingle();

              customerName = customerName || profile?.full_name || "Valued Customer";

              const { data: userData } = await supabase.auth.admin.getUserById(sb.customer_id);
              customerEmail = customerEmail || userData?.user?.email;
            }
          }
        }
      }
    }

    if (!customerEmail) {
      customerEmail = Deno.env.get("RESEND_FALLBACK_EMAIL") || "bbri7198@gmail.com";
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-receipt] Unhandled exception:", msg);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: msg,
    }, 500);
  }
});
