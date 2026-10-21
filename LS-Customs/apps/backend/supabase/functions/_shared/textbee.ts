const TEXTBEE_SEND_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";
const REQUEST_TIMEOUT_MS = 15_000;

type TextBeeResponse = {
  success?: unknown;
  error?: unknown;
  errors?: unknown;
  data?: {
    success?: unknown;
    successCount?: unknown;
    failureCount?: unknown;
  };
};

function hasExplicitError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const result = payload as TextBeeResponse;
  if (result.success === false || result.error) return true;
  if (
    (Array.isArray(result.errors) && result.errors.length > 0) ||
    (typeof result.errors === "string" && result.errors.trim())
  ) return true;

  const data = result.data;
  return Boolean(
    data && (
      data.success === false ||
      (typeof data.failureCount === "number" && data.failureCount > 0)
    ),
  );
}

/**
 * Submit one SMS to TextBee. A successful result means TextBee accepted the
 * request; it does not confirm that the recipient's handset received it.
 */
export async function sendTextBeeSms(
  to: string,
  message: string,
  apiKey?: string,
  deviceId?: string,
): Promise<{ success: boolean; error?: string }> {
  const configuredApiKey = apiKey ?? Deno.env.get("TEXTBEE_API_KEY") ?? "";
  const configuredDeviceId = deviceId ?? Deno.env.get("TEXTBEE_DEVICE_ID") ??
    "";
  if (!configuredApiKey.trim() || !configuredDeviceId.trim()) {
    return { success: false, error: "TextBee configuration missing" };
  }
  if (!to.trim() || !message.trim()) {
    return { success: false, error: "SMS recipient or message missing" };
  }

  try {
    const response = await fetch(TEXTBEE_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": configuredApiKey,
      },
      body: JSON.stringify({
        deviceId: configuredDeviceId,
        recipients: [to],
        message,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { success: false, error: "TextBee rejected the request" };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // TextBee's HTTP success is the acceptance signal; its response body is
      // optional for callers that only need to know whether submission worked.
      return { success: true };
    }
    if (hasExplicitError(payload)) {
      return { success: false, error: "TextBee rejected the request" };
    }
    return { success: true };
  } catch {
    return { success: false, error: "TextBee request failed" };
  }
}
