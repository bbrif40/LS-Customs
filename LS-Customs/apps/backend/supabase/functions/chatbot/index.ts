/**
 * Edge Function: chatbot
 *
 * AI customer support assistant for LS Customs' car rental & mechanic services.
 * Powered by OpenRouter (any OpenAI-compatible endpoint via OPENROUTER_BASE_URL).
 *
 * Handles: FAQ, booking lookups, rental inquiries, mechanic service scheduling.
 * Includes guardrails to stay on-topic and refuse out-of-scope requests.
 *
 * Auth: Anonymous (customer support is public-facing).
 *      Optional user_id in request body for booking context enrichment.
 *
 * API contract: API.md §2.6
 */

import {
  createServiceClient,
} from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_BASE_URL = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
const PRIMARY_MODEL = Deno.env.get("OPENROUTER_MODEL") || "poolside/laguna-s-2.1:free";

// Ticket creation keywords
const TICKET_KEYWORDS = [
  "create ticket", "open ticket", "submit ticket", "support ticket",
  "talk to admin", "contact admin", "speak to admin", "human agent",
  "real person", "live agent", "escalate", "file a ticket", "make a ticket"
];

function wantsToCreateTicket(message: string): boolean {
  const lower = message.toLowerCase();
  return TICKET_KEYWORDS.some(kw => lower.includes(kw));
}

// List of verified free/reliable models in order of priority
const FALLBACK_MODELS = [
  PRIMARY_MODEL,
  "liquid/lfm-2.5-2.6b:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "minimax/minimax-m2.7:free",
].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

// How many messages from the conversation history to pass to the LLM.
const HISTORY_WINDOW = 12;

// Automotive / LS Customs topic keywords used by the guardrail.
const ALLOWED_TOPICS = [
  "rental", "rent", "booking", "book", "reservation", "reserve", "vehicle", "car", "truck", "suv",
  "van", "sedan", "auto", "automobile", "fleet", "drive", "hire", "ride",
  "service", "services", "mechanic", "repair", "maintenance", "inspect", "inspection", "tune",
  "tuning", "custom", "customs", "oil", "tire", "brake", "engine", "battery", "transmission",
  "diagnostic", "obd", "obd2", "check engine", "fault code", "troubleshoot", "trouble",
  "tow", "towing", "wash", "detail", "detailing", "fix", "broken", "not starting",
  "warning light", "dashboard", "alternator", "spark plug", "injector", "radiator",
  "coolant", "leak", "overheating", "stall", "click", "grinding", "knocking",
  "price", "pricing", "rate", "rates", "cost", "payment", "pay", "fee", "refund", "bill",
  "invoice", "deposit", "discount", "promo", "quote", "peso", "php",
  "location", "pickup", "dropoff", "delivery", "address", "map", "hours", "contact", "where",
  "availability", "available", "schedule", "appointment", "time", "date", "open", "close",
  "insurance", "damage", "accident", "claim", "coverage", "policy",
  "cancel", "modify", "change", "extend", "status", "track", "help", "support", "assist", "info",
  "question", "ls", "package", "offer",
  "make", "model", "year", "mileage", "plate", "vin", "license plate",
  "hatchback", "minivan", "hybrid", "ev", "electric", "pickup truck",
];

// Short conversational replies that are always allowed through
const CONVERSATIONAL_PASS = [
  "yes", "no", "ok", "okay", "sure", "yep", "nope", "thanks", "thank you",
  "got it", "sounds good", "great", "perfect", "that one", "book it",
  "go ahead", "proceed", "continue", "more info", "tell me more",
  "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
  "who are you", "what can you do", "help", "help me", "start",
  "how much", "how long", "when", "where", "what", "which",
];

interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  message?: string;
  messages?: ChatHistoryMessage[];
  conversation_id?: string;
  user_id?: string;
}

/**
 * Context-aware guardrail: returns true if the message OR the recent
 * conversation context is related to LS Customs topics.
 *
 * This prevents blocking follow-up messages like "ok book it" or "how much?"
 * when the broader conversation is clearly about automotive services.
 */
function isOnTopic(message: string, history: ChatHistoryMessage[] = []): boolean {
  const lower = message.toLowerCase().trim();
  if (!lower) return false;

  // Short conversational replies always pass through
  if (CONVERSATIONAL_PASS.some(p =>
    lower === p || lower.startsWith(p + " ") || lower.endsWith(" " + p)
  )) {
    return true;
  }

  // Check if the current message is on-topic
  const messageOnTopic = ALLOWED_TOPICS.some(topic => {
    const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    return re.test(lower) || lower.includes(topic);
  });
  if (messageOnTopic) return true;

  // Context fallback: if the recent history is automotive, a short
  // follow-up is still valid (the user is continuing the same thread).
  if (history.length >= 2) {
    const recentContent = history
      .slice(-4)
      .map(m => m.content.toLowerCase())
      .join(" ");
    const contextOnTopic = ALLOWED_TOPICS.some(topic => {
      const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      return re.test(recentContent) || recentContent.includes(topic);
    });
    if (contextOnTopic) return true;
  }

  return false;
}

/**
 * Detect if the user's message suggests their car is broken/has issues.
 */
function isCarTrouble(message: string): boolean {
  const lower = message.toLowerCase();
  const troubleKeywords = [
    "broken", "not starting", "won't start", "can't start", "not working",
    "won't fire", "won't turn over", "check engine", "warning light",
    "dashboard light", "weird noise", "strange noise", "grinding", "knocking",
    "clicking", "squealing", "overheating", "leaking", "stall", "stalling",
    "rough idle", "vibration", "smell", "burning smell", "gas smell",
    "won't shift", "transmission", "battery dead", "no power",
    "oil leak", "coolant", "flat tire", "flat"
  ];
  return troubleKeywords.some(kw => lower.includes(kw));
}

/**
 * Fetch live system data from Supabase to inject into the system prompt.
 */
async function getLiveSystemData(supabase: ReturnType<typeof createServiceClient>) {
  try {
    const [vehiclesRes, mechanicsRes, servicesRes] = await Promise.all([
      supabase
        .from("vehicles")
        .select("category, sub_category, name, price_per_day")
        .eq("is_active", true)
        .order("price_per_day", { ascending: true })
        .limit(30),

      supabase
        .from("mechanic_profiles")
        .select("id, specialties, is_available, years_experience, rating_avg, profiles(full_name)")
        .eq("is_available", true)
        .limit(5),

      supabase
        .from("mechanic_services")
        .select("main_category, name, base_price, estimated_duration_minutes")
        .eq("is_active", true)
        .order("base_price", { ascending: true })
        .limit(20),
    ]);

    return {
      vehicles: vehiclesRes.data ?? [],
      mechanics: mechanicsRes.data ?? [],
      services: servicesRes.data ?? [],
    };
  } catch {
    return { vehicles: [], mechanics: [], services: [] };
  }
}

type VehicleRow = { category: string; sub_category: string; name: string; price_per_day: number };
type MechanicRow = { specialties: string[]; is_available: boolean; years_experience: number; rating_avg: number; profiles?: { full_name?: string } | { full_name?: string }[] | null };
type ServiceRow = { main_category: string; name: string; base_price: number; estimated_duration_minutes: number };

/**
 * Build a live-data section for the system prompt from DB records.
 */
function buildLiveDataBlock(data: {
  vehicles: VehicleRow[];
  mechanics: MechanicRow[];
  services: ServiceRow[];
}): string {
  const parts: string[] = [];

  // --- Vehicles grouped by category ---
  if (data.vehicles.length > 0) {
    const byCategory = new Map<string, VehicleRow[]>();
    for (const v of data.vehicles) {
      if (!byCategory.has(v.category)) byCategory.set(v.category, []);
      byCategory.get(v.category)!.push(v);
    }
    const lines: string[] = [];
    for (const [cat, vehicles] of byCategory) {
      const minPrice = Math.min(...vehicles.map(v => Number(v.price_per_day)));
      const maxPrice = Math.max(...vehicles.map(v => Number(v.price_per_day)));
      const samples = vehicles.slice(0, 3).map(v => v.name).join(", ");
      lines.push(`  • ${cat.replace(/_/g, " ").toUpperCase()} — ₱${minPrice.toLocaleString()}–₱${maxPrice.toLocaleString()}/day (e.g. ${samples})`);
    }
    parts.push(`=== LIVE VEHICLE FLEET (currently active) ===\n${lines.join("\n")}`);
  }

  // --- Mechanic services grouped by category ---
  if (data.services.length > 0) {
    const byCategory = new Map<string, ServiceRow[]>();
    for (const s of data.services) {
      if (!byCategory.has(s.main_category)) byCategory.set(s.main_category, []);
      byCategory.get(s.main_category)!.push(s);
    }
    const lines: string[] = [];
    for (const [cat, svcs] of byCategory) {
      const minPrice = Math.min(...svcs.map(s => Number(s.base_price)));
      const label = cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      lines.push(`  • ${label} — from ₱${minPrice.toLocaleString()} (e.g. ${svcs[0].name})`);
    }
    parts.push(`=== LIVE MECHANIC SERVICE CATALOG ===\n${lines.join("\n")}`);
  }

  // --- Available mechanics ---
  if (data.mechanics.length > 0) {
    const lines = data.mechanics.map(m => {
      const p = m.profiles;
      const name = Array.isArray(p)
        ? (p[0]?.full_name ?? "Mechanic")
        : ((p as { full_name?: string } | null)?.full_name ?? "Mechanic");
      const specs = Array.isArray(m.specialties) ? m.specialties.slice(0, 3).join(", ") : "General";
      const exp = m.years_experience ? `${m.years_experience}yrs` : "";
      const rating = Number(m.rating_avg) > 0 ? `★${Number(m.rating_avg).toFixed(1)}` : "";
      return `  • ${name} — ${specs}${exp ? " · " + exp : ""}${rating ? " · " + rating : ""} ✅ Available`;
    });
    parts.push(`=== AVAILABLE MECHANICS RIGHT NOW ===\n${lines.join("\n")}`);
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

/**
 * Build the full system prompt with live data injected.
 */
function buildSystemPrompt(liveData: string, userContext: string, diagnosticContext: string): string {
  return `You are "LS Customs Assistant" — the friendly, expert AI customer support agent for LS Customs, a premier car rental and mobile mechanic service company in the Philippines.

You help customers with:
1. Vehicle rentals: Luxury cars, sports cars, SUVs, trucks, hatchbacks, vans, sedans, EVs, hybrids (short-term & long-term).
2. Mobile mechanic services: On-site diagnostics, oil changes, brake repairs, tire services, battery replacements, full vehicle inspections, and performance tuning.
3. Booking management: Creating reservations, modifications, extensions, cancellations, and status tracking.
4. Pricing & payments: Transparent rates in Philippine Peso (₱ / PHP), payment options, invoices, security deposits, and refunds.
5. Location & delivery: Pickup/dropoff points, mobile mechanic dispatch to customer GPS location.

IMPORTANT: All prices are in Philippine Peso (₱). Never quote USD unless the customer specifically asks for a conversion.
IMPORTANT: Maintain context across the entire conversation — remember what was said earlier. Never ask for information the customer already provided.
${liveData}${userContext}

=== BREAKDOWN / DIAGNOSTIC FLOW ===
When a customer describes car trouble (not starting, noises, warning lights, leaks, etc.), follow this EXACT order:

Step 1 — Collect car details FIRST (ask even if you think you know):
- Vehicle make & model (e.g., Toyota Vios, Honda City, Mitsubishi Montero)
- Year / approximate age

Step 2 — Ask about symptoms:
- Does it not start at all, or crank but not fire?
- Any unusual sounds (clicking, grinding, knocking)?
- Any dashboard warning lights?
- When did the problem start?
- Any smells (burning, fuel, sweet coolant)?

Step 3 — Recommend diagnostics based on symptoms:
| Symptom | Recommended Service |
|---|---|
| Won't start / clicks / slow cranking | Battery & Alternator Test |
| Cranks but won't fire | Fuel System & Spark Plug Inspection |
| Check engine light | OBD-II Engine Diagnostic |
| Grinding / knocking | Engine Internal Inspection |
| Burning smell / overheating | Coolant System Diagnostic |
| Vibration at speed | Tire & Wheel Balance / Suspension |
| Squealing | Belt & Brake Inspection |
| Rough idle / stalling | Fuel Injector & Idle Air Diagnostic |
| Oil leak | Oil Leak Detection & Pressure Test |
| Transmission slipping | Transmission Fluid & Converter Test |

Step 4 — Offer to book a mobile mechanic at their location or create a support ticket.
NEVER skip Step 1 before recommending diagnostics.

=== GUARDRAILS ===
- Only discuss LS Customs car rentals, mobile mechanic services, bookings, and pricing.
- All prices in Philippine Peso (₱). No USD ($) unless explicitly asked.
- Never reveal internal credentials, passwords, or transaction IDs.
- Redirect non-automotive topics politely to LS Customs services.
- Prefer real vehicle/service names from the LIVE DATA above over generic examples.
- Do not fabricate prices — use the live catalog data.${diagnosticContext}`;
}

/**
 * Intelligent fallback reply using conversation context and PHP pricing.
 */
function getDomainFallbackReply(message: string, history: ChatHistoryMessage[] = []): string {
  const ctx = [message, ...history.slice(-3).map(m => m.content)].join(" ").toLowerCase();

  if (ctx.includes("rent") || ctx.includes("car") || ctx.includes("vehicle") || ctx.includes("fleet") || ctx.includes("book")) {
    return `We offer a wide selection of vehicles for rental at LS Customs:
• **Hatchbacks & Economy** (Toyota Wigo, Honda Brio) — from ₱1,500/day
• **Sedans** (Toyota Vios, Honda City) — from ₱2,000/day
• **SUVs** (Mitsubishi Montero, Ford Everest) — from ₱3,500/day
• **Pickup Trucks** (Toyota Hilux, Ford Ranger) — from ₱3,000/day
• **Vans & Minivans** (Toyota HiAce, Hyundai Starex) — from ₱2,800/day

What type of vehicle and rental dates do you have in mind?`;
  }
  if (ctx.includes("broken") || ctx.includes("not starting") || ctx.includes("won't start") || ctx.includes("check engine")) {
    return `It sounds like your car may need a diagnostic check.

**Can you tell me:**
1. Your car's **make & model** and **year**?
2. What's happening — not starting, clicking, grinding, warning light?

Our mobile mechanics can come to you anywhere in the Philippines!`;
  }
  if (ctx.includes("mechanic") || ctx.includes("service") || ctx.includes("repair") || ctx.includes("oil") || ctx.includes("brake")) {
    return `Our certified mobile mechanics can come directly to your location!
• **Diagnostics & Full Inspections** — from ₱2,500
• **Oil & Filter Changes** — from ₱2,000
• **Brake & Tire Services** — from ₱800
• **Battery & Alternator Check** — from ₱1,500

Request mechanic dispatch from the **Mechanic Services** tab!`;
  }
  if (ctx.includes("price") || ctx.includes("rate") || ctx.includes("cost") || ctx.includes("pay") || ctx.includes("peso") || ctx.includes("php")) {
    return `LS Customs rates (all in Philippine Peso ₱):
• **Vehicle Rentals**: ₱1,500/day (Economy) to ₱8,000/day (Luxury/SUV)
• **Mobile Mechanic**: from ₱1,200 dispatch, standard packages from ₱2,000

All rentals include 24/7 roadside assistance.`;
  }
  return "Welcome to LS Customs! We provide premier car rentals and on-demand mobile mechanic services across the Philippines. How can I assist you with your rental or service booking today?";
}

/**
 * Clean up assistant replies by removing hidden reasoning tokens.
 */
function sanitizeReply(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
  return cleaned.trim();
}

/**
 * Create a support ticket for the user.
 */
async function createSupportTicket(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  subject: string,
  description: string,
  category: "general" | "billing" | "technical" | "booking" | "mechanic" | "other" = "general",
  priority: "low" | "medium" | "high" | "urgent" = "medium"
) {
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      customer_id: userId,
      subject,
      description,
      category,
      priority,
    })
    .select("id, subject, status, created_at")
    .single();

  if (error) {
    console.error("Failed to create support ticket:", error);
    return null;
  }
  return data;
}

/**
 * Categorize the ticket based on message content.
 */
function categorizeTicket(message: string): "general" | "billing" | "technical" | "booking" | "mechanic" | "other" {
  const lower = message.toLowerCase();
  if (lower.includes("bill") || lower.includes("payment") || lower.includes("charge") || lower.includes("refund") || lower.includes("price")) return "billing";
  if (lower.includes("technical") || lower.includes("bug") || lower.includes("error") || lower.includes("crash") || lower.includes("app") || lower.includes("website")) return "technical";
  if (lower.includes("booking") || lower.includes("reservation") || lower.includes("rent") || lower.includes("vehicle") || lower.includes("car")) return "booking";
  if (lower.includes("mechanic") || lower.includes("repair") || lower.includes("service") || lower.includes("oil") || lower.includes("brake")) return "mechanic";
  return "general";
}

/**
 * Look up recent bookings for a user to provide context to the AI.
 */
async function getUserContext(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  try {
    const { data: bookings, error } = await supabase
      .from("vehicle_bookings")
      .select("id, status, start_date, end_date, total_price")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) return null;
    return bookings;
  } catch {
    return null;
  }
}

/**
 * Call OpenRouter with fallback models.
 * temperature: 0.4 — more consistent multi-turn replies, less hallucination.
 * max_tokens: 800 — prevents cut-off responses on longer answers.
 */
async function callOpenRouter(
  apiMessages: { role: string; content: string }[],
): Promise<{ reply: string; model: string }> {
  for (const model of FALLBACK_MODELS) {
    try {
      const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://ls-customs.ph",
          "X-Title": "LS Customs Customer Support",
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          temperature: 0.4,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        console.warn(`Model ${model} returned status ${res.status}`);
        continue;
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content;
      const cleanContent = sanitizeReply(rawContent || "");

      if (cleanContent) {
        return { reply: cleanContent, model: data.model || model };
      }
    } catch (modelErr) {
      console.warn(`Error calling model ${model}:`, modelErr);
    }
  }

  throw new Error("All AI models were temporarily unreachable. Please try again shortly.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(null, {
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST with a JSON body { message, conversation_id?, user_id? }",
    }, 405);
  }

  const body = await req.json() as ChatRequest;

  // Full conversation history sent by the client
  const history: ChatHistoryMessage[] = body.messages ?? [];
  const userMessage: string = body.message?.trim() ||
    (history.length > 0 ? history[history.length - 1]?.content?.trim() || "" : "");

  try {
    if (!userMessage) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Message is required",
      }, 400);
    }

    // Context-aware guardrail: check message AND conversation history
    if (!isOnTopic(userMessage, history)) {
      return jsonResponse({
        conversation_id: body.conversation_id || crypto.randomUUID(),
        reply: "I'm here to help with LS Customs car rentals and mobile mechanic services. Would you like assistance with vehicle bookings, repair estimates, or our service rates?",
        context_used: !!body.user_id,
        model: "guardrail",
      }, null, 200);
    }

    // Handle ticket creation request
    if (body.user_id && wantsToCreateTicket(userMessage)) {
      const supabase = createServiceClient();
      const category = categorizeTicket(userMessage);
      const ticket = await createSupportTicket(
        supabase,
        body.user_id,
        "Support Request via Chatbot",
        userMessage,
        category,
        "medium"
      );

      if (ticket) {
        return jsonResponse({
          conversation_id: body.conversation_id || crypto.randomUUID(),
          reply: `I've created a support ticket for you! 🎫\n\n**Ticket ID:** ${ticket.id}\n**Subject:** ${ticket.subject}\n**Status:** ${ticket.status}\n\nAn admin will review your request and respond soon. You can check the status of your ticket in the chat or ask me for updates.`,
          context_used: true,
          model: "ticket-system",
          ticket_created: true,
          ticket_id: ticket.id,
        }, null, 200);
      }
    }

    // Fetch live data + user context in parallel
    const supabase = createServiceClient();
    const [liveData, bookings] = await Promise.all([
      getLiveSystemData(supabase),
      body.user_id ? getUserContext(supabase, body.user_id) : Promise.resolve(null),
    ]);

    const liveDataBlock = buildLiveDataBlock(liveData);

    let userContext = "";
    if (bookings && bookings.length > 0) {
      userContext = `\n\n=== CUSTOMER BOOKING HISTORY ===\nThis authenticated customer has recent bookings:\n${JSON.stringify(bookings, null, 2)}`;
    }

    const carTroubleDetected = isCarTrouble(userMessage);
    const diagnosticContext = carTroubleDetected
      ? "\n\n⚠️ DIAGNOSTIC MODE ACTIVE: The user described car trouble. Follow the BREAKDOWN / DIAGNOSTIC FLOW: collect car make/model/year FIRST, then symptoms, THEN recommend diagnostics."
      : "";

    if (!OPENROUTER_API_KEY) {
      return jsonResponse({
        conversation_id: body.conversation_id || crypto.randomUUID(),
        reply: getDomainFallbackReply(userMessage, history),
        context_used: false,
        model: "fallback-no-key",
      }, null, 200);
    }

    const systemPrompt = buildSystemPrompt(liveDataBlock, userContext, diagnosticContext);

    // System prompt + up to HISTORY_WINDOW most recent messages
    const apiMessages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (history.length > 0) {
      const recentHistory = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-HISTORY_WINDOW)
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push(...recentHistory);
    } else {
      apiMessages.push({ role: "user", content: userMessage });
    }

    const { reply, model } = await callOpenRouter(apiMessages);

    return jsonResponse({
      conversation_id: body.conversation_id || crypto.randomUUID(),
      reply,
      context_used: !!body.user_id,
      model,
    }, null, 200);
  } catch (err) {
    console.error("chatbot error:", err);
    return jsonResponse({
      conversation_id: crypto.randomUUID(),
      reply: getDomainFallbackReply(userMessage, history),
      context_used: false,
      model: "fallback-resilient",
    }, null, 200);
  }
});
