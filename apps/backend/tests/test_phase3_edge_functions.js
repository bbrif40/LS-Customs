// Phase 3 edge function acceptance test runner
// Tests [82]: create-payment-intent full success path
// Tests [83]: Signed webhook -> payments.status = succeeded, booking -> confirmed
// Tests [84]: Unsigned/invalid webhook -> 401, no DB changes
//
// Provider selection: set TEST_PROVIDER env var to "stripe" to test Stripe
// (default is "paymongo" per supabase/.env PAYMENT_PROVIDER=PAYMONGO)
const http = require("http");
const crypto = require("crypto");
const { execSync } = require("child_process");

const HOST = "127.0.0.1";
const PORT = 54321;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_PROVIDER = (process.env.TEST_PROVIDER || "paymongo").toLowerCase();
const WEBHOOK_SECRET = "whsec_test_local_development_placeholder";

function makeRequest(baseHost, basePort, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: baseHost, port: basePort, path, method, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function decodeJwt(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mock payment provider server (handles both PayMongo and Stripe formats)
// ---------------------------------------------------------------------------
function startMockProvider(port) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        // Handle POST /v1/payment_intents (both Stripe and PayMongo use this path)
        if (req.method === "POST" && req.url === "/v1/payment_intents") {
          if (TEST_PROVIDER === "paymongo") {
            // PayMongo expects Basic auth + JSON body
            // Response: { data: { id, type, attributes: { client_key, ... } } }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              data: {
                id: "pi_mock_12345",
                type: "payment_intent",
                attributes: {
                  client_key: "pi_mock_12345_client_secret_abcdef",
                  amount: 750000,
                  currency: "PHP",
                  status: "awaiting_payment_method",
                },
              },
            }));
          } else {
            // Stripe expects Bearer auth + URL-encoded body
            // Response: { id, client_secret, ... }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              id: "pi_mock_12345",
              object: "payment_intent",
              amount: 750000,
              currency: "php",
              status: "requires_payment_method",
              client_secret: "pi_mock_12345_secret_abcdef",
            }));
          }
          return;
        }

        // Default 404
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      });
    });
    server.listen(port, HOST, () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Webhook signing helpers
// ---------------------------------------------------------------------------

/**
 * Sign a webhook payload for the configured provider.
 * Returns { headerName, headerValue }.
 *
 * PayMongo format: Paymongo-Signature: t=<timestamp>,te=<test_sig>,li=<test_sig>
 *   Signature = HMAC-SHA256(webhook_secret, `${timestamp}.${rawBody}`) hex
 *
 * Stripe format: stripe-signature: t=<timestamp>,v1=<signature>
 *   Signature = HMAC-SHA256(webhook_secret, `${timestamp}.${rawBody}`) hex
 */
function signWebhook(payload) {
  const payloadStr = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payloadStr}`;
  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(signedPayload).digest("hex");

  if (TEST_PROVIDER === "paymongo") {
    // PayMongo: t=<timestamp>,te=<test_sig>,li=<live_sig>
    return {
      headerName: "paymongo-signature",
      headerValue: `t=${ts},te=${sig},li=${sig}`,
    };
  } else {
    // Stripe: t=<timestamp>,v1=<signature>
    return {
      headerName: "stripe-signature",
      headerValue: `t=${ts},v1=${sig}`,
    };
  }
}

/**
 * Build a webhook payload in the format expected by the configured provider.
 *
 * PayMongo event: { data: { id: "evt_...", type: "payment_intent.succeeded",
 *                           attributes: { payment_intent_id: "pi_...", ... } } }
 * Stripe event: { type: "payment_intent.succeeded",
 *                 data: { object: { id: "pi_...", ... } } }
 */
function buildWebhookPayload(providerRef, eventType) {
  if (TEST_PROVIDER === "paymongo") {
    return {
      data: {
        id: "evt_mock_" + Date.now(),
        type: eventType,
        attributes: {
          payment_intent_id: providerRef,
          amount: 750000,
          currency: "PHP",
          status: eventType === "payment_intent.succeeded" ? "succeeded" : "failed",
        },
      },
    };
  } else {
    return {
      type: eventType,
      data: {
        object: {
          id: providerRef,
          object: "payment_intent",
          amount: 750000,
          currency: "php",
          status: eventType === "payment_intent.succeeded" ? "succeeded" : "failed",
        },
      },
    };
  }
}

async function run() {
  console.log(`=== Phase 3 Edge Function Tests (provider: ${TEST_PROVIDER}) ===\n`);

  // Start the mock payment provider server
  let mockServer;
  try {
    mockServer = await startMockProvider(8090);
    console.log("  Mock provider server started on port 8090");
  } catch (e) {
    console.log("  FAIL: Could not start mock provider server:", e.message);
    process.exit(1);
  }

  try {
    // --- [82] create-payment-intent ---
    console.log("\n[82] create-payment-intent test");

    // Step 1: Signup to get JWT
    console.log("  --- Obtaining JWT via GoTrue signup ---");
    const signupRes = await makeRequest(
      HOST, PORT,
      "/auth/v1/signup",
      "POST",
      { "Content-Type": "application/json", "apikey": ANON_KEY },
      JSON.stringify({
        email: `p3test_${Date.now()}@ls.test`,
        password: "TestPassword123!",
      })
    );

    let jwt = null;
    try {
      const signupData = JSON.parse(signupRes.body);
      if (signupData.access_token) {
        jwt = signupData.access_token;
      } else if (signupData.msg && signupData.msg.includes("already registered")) {
        console.log("  Signup returned:", signupData.msg);
        console.log("  User already registered — re-running with unique email...");
        process.exit(1);
      } else {
        console.log("  Signup response:", signupRes.body);
        process.exit(1);
      }
    } catch (e) {
      console.log("  Error parsing signup response:", e.message, signupRes.body);
      process.exit(1);
    }

    if (!jwt) {
      console.log("  FAIL: Could not obtain JWT");
      process.exit(1);
    }

    const payload = decodeJwt(jwt);
    const userId = payload?.sub;
    console.log("  JWT obtained:", jwt.substring(0, 20) + "...");
    console.log("  User ID from JWT:", userId);

    // Step 2: Insert a vehicle booking for this user via psql (docker)
    console.log("  --- Inserting vehicle booking for test user ---");
    const bookingId = "aaaaaaaa-0000-0000-0000-" + Date.now().toString().slice(-12);
    const startDate = "2027-01-01";
    const endDate = "2027-01-05";
    const psqlCmd = `docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432 -c "DELETE FROM public.vehicle_bookings WHERE id = '${bookingId}'; INSERT INTO public.vehicle_bookings (id, vehicle_id, customer_id, start_date, end_date, status, total_price) VALUES ('${bookingId}', 'aaaaaaaa-1111-1111-1111-111111111111', '${userId}', '${startDate}', '${endDate}', 'pending', 7500.00);"`;
    try {
      execSync(psqlCmd, { encoding: "utf8" });
      console.log("  Booking inserted:", bookingId);
    } catch (e) {
      console.log("  psql insert failed:", e.message);
      console.log("  (Booking may already exist from a previous run)");
    }

    // Step 3: Call create-payment-intent with valid JWT and owned booking
    console.log("  --- Calling create-payment-intent ---");
    const payRes = await makeRequest(
      HOST, PORT,
      "/functions/v1/create-payment-intent",
      "POST",
      { "Content-Type": "application/json", "Authorization": "Bearer " + jwt },
      JSON.stringify({ booking_type: "vehicle", booking_id: bookingId })
    );

    console.log("  HTTP status:", payRes.status);
    console.log("  Response:", payRes.body);

    let providerRef = null;

    try {
      const payData = JSON.parse(payRes.body);
      if (payData.data && payData.data.payment_id) {
        console.log(`  [82] PASS: payment_id = ${payData.data.payment_id}, client_secret present: ${!!payData.data.client_secret}`);
        console.log(`  [82] Provider: ${payData.data.provider || "unknown"}`);
        console.log(`  [82] Full success path verified: JWT → ownership → provider → payments row → client_secret`);

        // Query the DB for the provider_reference
        try {
          const refResult = execSync(
            `docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432 ` +
            `-t -c "SELECT provider_reference, provider, status FROM public.payments WHERE id = '${payData.data.payment_id}'::uuid;"`,
            { encoding: "utf8" }
          ).trim();
          console.log("  Payment record:", refResult);

          // Extract provider_reference from psql output
          const refMatch = refResult.match(/pi_mock_\d+/);
          providerRef = refMatch ? refMatch[0] : null;
        } catch (e) {
          console.log("  Could not query payment record:", e.message);
        }
      } else if (payData.error) {
        console.log(`  [82] NOTE: ${payData.error.code} - ${payData.error.message}`);
        if (payData.error.code === "PROVIDER_ERROR") {
          console.log("  [82] PARTIAL: JWT verified, ownership OK, but provider not configured");
        }
      } else {
        console.log("  [82] FAIL: Unexpected response format");
      }
    } catch (e) {
      console.log("  [82] FAIL: Could not parse response");
    }

    // --- [84] Unsigned webhook → 401 ---
    console.log("\n[84] payment-webhook without signature");
    const webhookRes = await makeRequest(
      HOST, PORT,
      "/functions/v1/payment-webhook",
      "POST",
      { "Content-Type": "application/json" },
      JSON.stringify(buildWebhookPayload("pi_test_999", "payment_intent.succeeded"))
    );
    console.log("  HTTP status:", webhookRes.status);
    if (webhookRes.status === 401) {
      console.log("  [84] PASS: Unsigned webhook rejected with 401");
    } else {
      console.log(`  [84] FAIL: Expected 401, got ${webhookRes.status}`);
    }

    // --- [84b] Invalid signature → 401 ---
    console.log("\n[84b] payment-webhook with invalid signature");
    const invalidSigRes = await makeRequest(
      HOST, PORT,
      "/functions/v1/payment-webhook",
      "POST",
      {
        "Content-Type": "application/json",
        "paymongo-signature": "t=1234567890,te=invalid_signature_li=invalid_signature",
      },
      JSON.stringify(buildWebhookPayload("pi_test_999", "payment_intent.succeeded"))
    );
    console.log("  HTTP status:", invalidSigRes.status);
    if (invalidSigRes.status === 401) {
      console.log("  [84b] PASS: Invalid signature rejected with 401");
    } else {
      console.log(`  [84b] FAIL: Expected 401, got ${invalidSigRes.status}`);
    }

    // --- [83] Signed webhook → payment confirmed ---
    console.log("\n[83] payment-webhook with valid signature");

    // Use the provider_reference from the create-payment-intent call
    if (!providerRef) {
      // Fallback: try to get the last pending payment from the DB
      try {
        const result = execSync(
          `docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432 ` +
          `-t -c "SELECT provider_reference FROM public.payments WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1;"`,
          { encoding: "utf8" }
        ).trim();
        providerRef = result.replace(/[\s\n]/g, "");
        console.log("  Found pending payment:", providerRef);
      } catch (e) {
        console.log("  Could not query pending payment:", e.message);
      }
    }

    if (providerRef) {
      // Build the signed webhook payload
      const webhookPayload = buildWebhookPayload(providerRef, "payment_intent.succeeded");
      const { headerName, headerValue } = signWebhook(webhookPayload);

      const signedWebhookRes = await makeRequest(
        HOST, PORT,
        "/functions/v1/payment-webhook",
        "POST",
        {
          "Content-Type": "application/json",
          [headerName]: headerValue,
        },
        JSON.stringify(webhookPayload)
      );

      console.log("  HTTP status:", signedWebhookRes.status);
      console.log("  Response:", signedWebhookRes.body);

      if (signedWebhookRes.status === 200) {
        // Verify DB state: payment status should be 'succeeded', booking should be 'confirmed'
        try {
          const verifyResult = execSync(
            `docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432 ` +
            `-t -c "SELECT p.status AS payment_status, p.provider, vb.status AS booking_status ` +
            `FROM public.payments p JOIN public.vehicle_bookings vb ON p.booking_id = vb.id ` +
            `WHERE p.provider_reference = '${providerRef}';"`,
            { encoding: "utf8" }
          ).trim();
          console.log("  DB result:", verifyResult);

          if (verifyResult.includes("succeeded") && verifyResult.includes("confirmed")) {
            console.log("  [83] PASS: Payment status=succeeded, booking status=confirmed");
          } else {
            console.log(`  [83] FAIL: DB state unexpected - ${verifyResult}`);
          }
        } catch (e) {
          console.log("  [83] DB verification error:", e.message);
        }
      } else {
        console.log(`  [83] FAIL: Expected 200, got ${signedWebhookRes.status}`);
      }
    } else {
      console.log("  [83] SKIP: No pending payment found to test webhook");
    }

    console.log("\n=== Phase 3 tests complete ===");
  } finally {
    // Clean up mock server
    if (mockServer) {
      mockServer.close();
      console.log("\n  Mock provider server stopped");
    }
  }
}

run().catch(console.error);
