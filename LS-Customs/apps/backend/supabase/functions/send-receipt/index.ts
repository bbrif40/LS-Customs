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
    const {
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

    // If customerEmail is missing, resolve it from the database via bookingId or user_id
    if (!customerEmail && bookingId) {
      if (bookingType === "rental") {
        const { data: vb } = await supabase
          .from("vehicle_bookings")
          .select("customer_id, vehicles(name), start_date, total_price")
          .eq("id", bookingId)
          .maybeSingle();

        if (vb?.customer_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", vb.customer_id)
            .maybeSingle();

          customerName = customerName || profile?.full_name || "Valued Customer";

          // Fetch email from auth admin
          const { data: userData } = await supabase.auth.admin.getUserById(vb.customer_id);
          customerEmail = userData?.user?.email;
        }
      } else {
        const { data: sb } = await supabase
          .from("service_bookings")
          .select("customer_id, services(name), scheduled_at, price, location_address")
          .eq("id", bookingId)
          .maybeSingle();

        if (sb?.customer_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", sb.customer_id)
            .maybeSingle();

          customerName = customerName || profile?.full_name || "Valued Customer";

          // Fetch email from auth admin
          const { data: userData } = await supabase.auth.admin.getUserById(sb.customer_id);
          customerEmail = userData?.user?.email;
        }
      }
    }

    if (!customerEmail) {
      // Default / fallback to developer email during Resend onboarding testing
      customerEmail = Deno.env.get("RESEND_FALLBACK_EMAIL") || "bbri7198@gmail.com";
    }

    if (!bookingId) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required bookingId parameter",
      }, 400);
    }

    const receiptData: ReceiptEmailData = {
      customerName: customerName || "Valued Customer",
      customerEmail,
      bookingId: String(bookingId),
      bookingType,
      itemTitle: itemTitle || (bookingType === "rental" ? "Premium Vehicle Rental" : "Certified Mechanic Service"),
      amount,
      scheduledDate,
      location,
      status: "Confirmed & Acknowledged",
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
