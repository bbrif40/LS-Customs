type Handler = (req: Request) => Promise<Response>;
const owner = "10000000-0000-4000-8000-000000000001";
const phone = "+639171234567";
const challengeId = "20000000-0000-4000-8000-000000000001";
const user = { id: owner, email: "original@example.invalid", email_confirmed_at: new Date().toISOString() };
const session = { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, user };
Deno.env.set("SUPABASE_URL", "https://backend.example.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("TEXTBEE_API_KEY", "test-textbee");
Deno.env.set("TEXTBEE_DEVICE_ID", "test-device");
const originalServe = Deno.serve;
let handler: Handler;
Deno.serve = ((callback: Handler) => { handler = callback; return {}; }) as unknown as typeof Deno.serve;
try { await import("../customer-phone-otp/index.ts"); } finally { Deno.serve = originalServe; }

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
interface Call { path: string; body: Record<string, unknown> }
async function call(body: unknown, options: { delivery?: string; owner?: string | null; smsStatus?: number; sessionOwner?: string; linkOwner?: string } = {}): Promise<{ response: Response; json: { data?: Record<string, unknown>; error?: unknown }; calls: Call[] }> {
  const originalFetch = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const payload = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ path: url.pathname, body: payload });
    let data: unknown;
    if (url.hostname === "api.textbee.dev") return Promise.resolve(new Response("{}", { status: options.smsStatus ?? 200 }));
    if (url.pathname.endsWith("/reserve_customer_phone_otp")) data = [{ challenge_id: challengeId, delivery: options.delivery ?? "profile" }];
    else if (url.pathname.endsWith("/consume_customer_phone_otp")) data = options.owner === null ? null : options.owner ?? owner;
    else if (url.pathname.endsWith("/customer_phone_otp_challenges")) data = { user_id: options.owner === null ? null : owner };
    else if (url.pathname.includes("/admin/users/")) data = user;
    else if (url.pathname.endsWith("/admin/generate_link")) data = { ...user, id: options.linkOwner ?? owner, action_link: "https://example.invalid", email_otp: "000000", hashed_token: "test-token-hash", verification_type: "magiclink" };
    else if (url.pathname.endsWith("/verify")) data = { ...session, user: { ...user, id: options.sessionOwner ?? owner } };
    else if (url.pathname.endsWith("/otp")) data = {};
    else throw new Error(`Unexpected request ${url.pathname}`);
    return Promise.resolve(new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }));
  };
  try {
    const response = await handler(new Request("https://edge.example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { response, json: await response.json(), calls };
  } finally { globalThis.fetch = originalFetch; }
}

Deno.test("profile phone send uses the SMS gateway without creating an auth identity", async () => {
  const result = await call({ action: "send", phone, createAccount: false });
  equal(result.response.status, 200);
  equal(result.json.data, { verification: "profile_phone", challengeId: result.calls[0].body.p_id });
  const sms = result.calls.find(value => value.path.endsWith("/sendSMS"));
  if (!sms || !/\b\d{6}\b/.test(String(sms.body.message))) throw new Error("SMS code was not sent");
  equal(result.calls.some(value => value.path.endsWith("/otp")), false);
});
Deno.test("unknown login sends no SMS and exposes no account information", async () => {
  const result = await call({ action: "send", phone, createAccount: false }, { owner: null });
  equal(result.response.status, 200);
  equal(result.calls.some(value => value.path.endsWith("/sendSMS")), false);
  equal(result.json.data?.verification, "profile_phone");
  equal(Object.keys(result.json.data ?? {}).sort(), ["challengeId", "verification"]);
});
Deno.test("existing SMS uses shouldCreateUser false; signup alone permits creation", async () => {
  for (const createAccount of [false, true]) {
    const result = await call({ action: "send", phone, createAccount, fullName: "New Customer" }, { delivery: "supabase" });
    equal(result.response.status, 200);
    equal(result.calls.find(value => value.path.endsWith("/otp"))?.body.create_user, createAccount);
  }
});
Deno.test("a failed SMS provider response does not pretend a code was delivered", async () => {
  equal((await call({ action: "send", phone, createAccount: false }, { smsStatus: 500 })).response.status, 503);
});
Deno.test("valid profile SMS code returns a session with the original account ID", async () => {
  const result = await call({ action: "verify", challengeId, code: "123456" });
  equal(result.response.status, 200);
  equal((result.json.data?.session as typeof session).user.id, owner);
  equal(result.calls.find(value => value.path.endsWith("/admin/generate_link"))?.body.email, user.email);
});
Deno.test("invalid or consumed code never reaches session creation", async () => {
  const result = await call({ action: "verify", challengeId, code: "123456" }, { owner: null });
  equal(result.response.status, 400);
  equal(result.calls.some(value => value.path.includes("/auth/")), false);
});
Deno.test("a mismatched minted identity never receives a session", async () => {
  const result = await call({ action: "verify", challengeId, code: "123456" }, { linkOwner: "other-user" });
  equal(result.response.status, 503);
  equal(result.json.data, null);
  equal(result.calls.some(value => value.path.endsWith("/verify")), false);
});
Deno.test("a mismatched verified session is not returned to the caller", async () => {
  const result = await call({ action: "verify", challengeId, code: "123456" }, { sessionOwner: "other-user" });
  equal(result.response.status, 503); equal(result.json.data, null);
});
Deno.test("rate limits and ambiguous contacts fail without sending a code", async () => {
  for (const [delivery, status] of [["rate_limited", 429], ["conflict", 409]] as const) {
    const result = await call({ action: "send", phone, createAccount: false }, { delivery });
    equal(result.response.status, status); equal(result.calls.length, 1);
  }
});
