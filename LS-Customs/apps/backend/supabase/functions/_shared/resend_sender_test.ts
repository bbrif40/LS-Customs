import { emailTransports, sendResendEmail, type SendEmailOptions } from "./resend.ts";

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("Resend sender validates configuration and sends only the requested recipients", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = Deno.env.get("RESEND_API_KEY");
  const originalFrom = Deno.env.get("RESEND_FROM_EMAIL");
  let requestCount = 0;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1;
    capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    capturedInit = init;
    return Promise.resolve(Response.json({ id: "email_test_123" }));
  }) as typeof fetch;

  try {
    Deno.env.delete("RESEND_API_KEY");
    Deno.env.delete("RESEND_FROM_EMAIL");
    const options: SendEmailOptions = {
      from: "LS Customs <billing@example.test>",
      to: [" customer@example.test ", "second@example.test"],
      subject: "Receipt",
      html: "<p>Receipt details</p>",
      text: "Receipt details",
      idempotencyKey: "notification-123-email",
    };

    equal(await sendResendEmail(options), { success: false, error: "Resend API key is not configured" });
    equal(requestCount, 0);

    Deno.env.set("RESEND_API_KEY", "test-resend-key");
    equal(await sendResendEmail({ ...options, from: undefined }), { success: false, error: "Resend sender is not configured" });
    equal(requestCount, 0);

    Deno.env.set("RESEND_FROM_EMAIL", "LS Customs <configured@example.test>");
    equal(await sendResendEmail({ ...options, to: [" ", "customer@example.test"] }, "test-resend-key"), {
      success: false,
      error: "At least one recipient is required",
    });
    equal(requestCount, 0);

    const result = await sendResendEmail(options, "test-override-key");
    equal(result, { success: true, id: "email_test_123" });
    equal(capturedUrl, "https://api.resend.com/emails");
    equal(capturedInit?.method, "POST");
    equal(new Headers(capturedInit?.headers).get("Authorization"), "Bearer test-override-key");
    equal(new Headers(capturedInit?.headers).get("Content-Type"), "application/json");
    equal(new Headers(capturedInit?.headers).get("Idempotency-Key"), "notification-123-email");
    equal(JSON.parse(String(capturedInit?.body)), {
      from: "LS Customs <billing@example.test>",
      to: ["customer@example.test", "second@example.test"],
      subject: "Receipt",
      html: "<p>Receipt details</p>",
      text: "Receipt details",
    });

    await sendResendEmail({ ...options, from: undefined, to: "customer@example.test" });
    equal(JSON.parse(String(capturedInit?.body)).from, "LS Customs <configured@example.test>");
    equal(JSON.parse(String(capturedInit?.body)).to, ["customer@example.test"]);

    globalThis.fetch = (() => Promise.resolve(Response.json({ message: "private@example.test test-resend-key" }, { status: 422 }))) as typeof fetch;
    equal(await sendResendEmail(options, "test-resend-key"), {
      success: false,
      error: "Resend request failed (HTTP 422)",
    });

    globalThis.fetch = (() => Promise.resolve(Response.json({}))) as typeof fetch;
    equal(await sendResendEmail(options, "test-resend-key"), {
      success: false,
      error: "Resend did not return an email ID",
    });

    globalThis.fetch = (() => Promise.reject(new Error("secret and recipient leaked by provider"))) as typeof fetch;
    equal(await sendResendEmail(options, "test-resend-key"), {
      success: false,
      error: "Resend request failed",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) Deno.env.delete("RESEND_API_KEY");
    else Deno.env.set("RESEND_API_KEY", originalApiKey);
    if (originalFrom === undefined) Deno.env.delete("RESEND_FROM_EMAIL");
    else Deno.env.set("RESEND_FROM_EMAIL", originalFrom);
  }
});

Deno.test("Gmail sends first when configured and Resend is used only if Gmail fails", async () => {
  const names = ["GMAIL_USER", "GMAIL_PASSWORD", "RESEND_API_KEY", "RESEND_FROM_EMAIL"];
  const saved = names.map(name => Deno.env.get(name));
  const originalFetch = globalThis.fetch, originalGmail = emailTransports.gmail;
  let resendCalls = 0, gmailPassword = "", gmailResult = { success: true, id: "<gmail-1@test>" } as { success: boolean; id?: string; error?: string };
  globalThis.fetch = (() => { resendCalls++; return Promise.resolve(Response.json({ id: "resend_1" })); }) as typeof fetch;
  emailTransports.gmail = (_options, _user, pass) => { gmailPassword = pass; return Promise.resolve(gmailResult); };
  try {
    ["ls@example.test", "abcd efgh ijkl mnop", "test-resend-key", "LS <onboarding@resend.dev>"].forEach((value, index) => Deno.env.set(names[index], value));
    const options: SendEmailOptions = { to: "anyone@example.test", subject: "Hi", html: "<p>Hi</p>" };
    equal(await sendResendEmail(options), { success: true, id: "<gmail-1@test>" });
    equal(gmailPassword, "abcdefghijklmnop");
    equal(resendCalls, 0);
    gmailResult = { success: false, error: "Gmail SMTP failed (535)" };
    equal(await sendResendEmail(options), { success: true, id: "resend_1" });
    equal(resendCalls, 1);
  } finally {
    globalThis.fetch = originalFetch; emailTransports.gmail = originalGmail;
    names.forEach((name, index) => { const value = saved[index]; if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value); });
  }
});
