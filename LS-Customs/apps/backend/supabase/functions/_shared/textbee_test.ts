import { sendTextBeeSms } from "./textbee.ts";

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("TextBee transport requires configured credentials and submits one accepted SMS", async () => {
  const oldApiKey = Deno.env.get("TEXTBEE_API_KEY");
  const oldDeviceId = Deno.env.get("TEXTBEE_DEVICE_ID");
  const oldFetch = globalThis.fetch;
  let calls = 0;
  Deno.env.delete("TEXTBEE_API_KEY");
  Deno.env.delete("TEXTBEE_DEVICE_ID");

  try {
    equal(await sendTextBeeSms("+639171234567", "test"), {
      success: false,
      error: "TextBee configuration missing",
    });

    Deno.env.set("TEXTBEE_API_KEY", "test-api-key");
    Deno.env.set("TEXTBEE_DEVICE_ID", "device/with space");
    globalThis.fetch = async (input, init) => {
      calls += 1;
      equal(String(input), "https://api.textbee.dev/api/v1/gateway/send-sms");
      equal(init?.method, "POST");
      equal(new Headers(init?.headers).get("x-api-key"), "test-api-key");
      equal(JSON.parse(String(init?.body)), {
        deviceId: "device/with space",
        recipients: ["+639171234567"],
        message: "test",
      });
      if (!init?.signal) {
        throw new Error("SMS request is missing a timeout signal");
      }
      // A 2xx response with no body means TextBee accepted the request.
      return new Response("{}", { status: 200 });
    };
    equal(await sendTextBeeSms("+639171234567", "test"), { success: true });
    equal(calls, 1);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: { success: false } }), {
        status: 200,
      });
    equal(await sendTextBeeSms("+639171234567", "test"), {
      success: false,
      error: "TextBee rejected the request",
    });

    globalThis.fetch = async () =>
      new Response("provider detail", { status: 503 });
    equal(await sendTextBeeSms("+639171234567", "test"), {
      success: false,
      error: "TextBee rejected the request",
    });

    globalThis.fetch = async () => {
      throw new Error("network detail");
    };
    equal(await sendTextBeeSms("+639171234567", "test"), {
      success: false,
      error: "TextBee request failed",
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldApiKey === undefined) Deno.env.delete("TEXTBEE_API_KEY");
    else Deno.env.set("TEXTBEE_API_KEY", oldApiKey);
    if (oldDeviceId === undefined) Deno.env.delete("TEXTBEE_DEVICE_ID");
    else Deno.env.set("TEXTBEE_DEVICE_ID", oldDeviceId);
  }
});
