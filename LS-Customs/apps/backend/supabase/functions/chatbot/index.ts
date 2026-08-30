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
const OPENROUTER_BASE_URL = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
const PRIMARY_MODEL = Deno.env.get("OPENROUTER_MODEL") || "poolside/laguna-s-2.1:free";

// List of verified free/reliable models in order of priority
const FALLBACK_MODELS = [
  PRIMARY_MODEL,
  "liquid/lfm-2.5-2.6b:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "minimax/minimax-m2.7:free",
].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

/**
 * Intelligent domain fallback reply in case external LLM providers are temporarily rate-limited
 */
function getDomainFallbackReply(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rent") || lower.includes("car") || lower.includes("vehicle") || lower.includes("fleet") || lower.includes("book")) {
    return `We offer a wide selection of vehicles for rental at LS Customs:
• **Economy & Sedans** (Toyota Corolla, Honda Civic) — starting at $39/day
• **SUVs & Trucks** (Range Rover, Ford F-150 Raptor) — starting at $69/day
• **Luxury & Sports Cars** (Porsche 911, Rolls-Royce Phantom) — starting at $129/day

What type of vehicle and rental dates do you have in mind? You can also browse our full fleet in the **Vehicles** tab!`;
  }
  if (lower.includes("mechanic") || lower.includes("service") || lower.includes("repair") || lower.includes("oil") || lower.includes("brake") || lower.includes("tune")) {
    return `Our certified mobile mechanics can come directly to your location anywhere in Los Santos!
• **Diagnostics & Full Inspections**
• **Oil & Filter Changes**
• **Brake & Tire Services**
• **Battery, Alternator & Engine Tuning**

You can request mobile mechanic dispatch directly from the **Mechanic Services** tab!`;
  }
  if (lower.includes("price") || lower.includes("rate") || lower.includes("cost") || lower.includes("quote") || lower.includes("pay")) {
    return `Here is an overview of LS Customs rates:
• **Vehicle Rentals**: Starting from $39/day (Economy) to $199/day (Supercars).
• **Mobile Mechanic**: Diagnostic dispatch from $49, standard maintenance packages from $89.

All rentals include 24/7 roadside assistance and flexible pickup/dropoff points across Los Santos.`;
  }
  return "Welcome to LS Customs! We provide premier car rentals and on-demand mobile mechanic services across Los Santos. How can I assist you with your rental or service booking today?";
}

/**
 * Guardrail: topics the assistant is allowed to discuss.
 * Used to gently redirect out-of-scope conversations back to LS Customs services.
 */
const ALLOWED_TOPICS = [
  "rental", "rent", "booking", "book", "reservation", "reserve", "vehicle", "car", "truck", "suv",
  "van", "sedan", "auto", "automobile", "fleet", "drive", "hire", "ride",
  "service", "services", "mechanic", "repair", "maintenance", "inspect", "inspection", "tune",
  "tuning", "custom", "customs", "oil", "tire", "brake", "engine", "battery", "transmission",
  "diagnostic", "tow", "towing", "wash", "detail", "detailing", "fix",
  "price", "pricing", "rate", "rates", "cost", "payment", "pay", "fee", "refund", "bill",
  "invoice", "deposit", "discount", "promo", "quote",
  "location", "pickup", "dropoff", "delivery", "address", "map", "hours", "contact", "where",
  "availability", "available", "schedule", "appointment", "time", "date", "open", "close",
  "insurance", "damage", "accident", "claim", "coverage", "policy",
  "cancel", "modify", "change", "extend", "status", "track", "help", "support", "assist", "info",
  "question", "ls", "package", "offer"
];

const SYSTEM_PROMPT = `You are "LS Customs Assistant" — the friendly, expert AI customer support agent for LS Customs, a premier car rental and mobile mechanic service company in Los Santos.

You help customers with:
1. Vehicle rentals: Luxury cars, sports cars, SUVs, trucks, economy vehicles (short-term & long-term).
2. Mobile mechanic services: On-site diagnostics, oil changes, brake repairs, tire services, battery replacements, full vehicle inspections, and performance tuning.
3. Booking management: Creating reservations, modifications, extensions, cancellations, and status tracking.
4. Pricing & payments: Transparent rates, payment options, invoices, security deposits, and refunds.
5. Location & delivery: Pickup/dropoff points, mobile mechanic dispatch to user GPS location.

Guidelines:
- Be warm, helpful, professional, and concise.
- Use clear bullet points when listing services or options.
- If a user asks for vehicle rental or service assistance, ask for their requirements (type of car, dates, or mechanical issue).
- If a user asks about something completely unrelated (e.g., programming/coding tutorials, unrelated non-automotive products, homework), politely redirect them: "I'm here to help with LS Customs car rentals and mobile mechanic services. How can I assist you with those today?"
- Never fabricate confidential internal credentials, passwords, or transaction IDs.`;

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
 * Check if the user's message is related to LS Customs' services.
 */
function isOnTopic(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (!lower) return false;

  // Greetings and conversational pleasantries are always on-topic
  const greetings = [
    "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
    "howdy", "sup", "thanks", "thank you", "ok", "okay", "sure", "yes", "no",
    "who are you", "what can you do", "help", "help me", "start"
  ];
  if (greetings.some((g) => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g) || lower.includes(g))) {
    return true;
  }

  // Check if any allowed automotive / service topic keywords are present
  return ALLOWED_TOPICS.some((topic) => {
    const re = new RegExp(`\\b${topic}\\b`, "i");
    return re.test(lower) || lower.includes(topic);
  });
}

/**
 * Clean up assistant replies by removing hidden reasoning tokens or thoughts.
 */
function sanitizeReply(text: string): string {
  if (!text) return "";
  // Strip <think>...</think> or <reasoning>...</reasoning> blocks if present
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
  if (lower.includes("bill") || lower.includes("payment") || lower.includes("charge") || lower.includes("refund") || lower.includes("price")) {
    return "billing";
  }
  if (lower.includes("technical") || lower.includes("bug") || lower.includes("error") || lower.includes("crash") || lower.includes("app") || lower.includes("website")) {
    return "technical";
  }
  if (lower.includes("booking") || lower.includes("reservation") || lower.includes("rent") || lower.includes("vehicle") || lower.includes("car")) {
    return "booking";
  }
  if (lower.includes("mechanic") || lower.includes("repair") || lower.includes("service") || lower.includes("oil") || lower.includes("brake") || lower.includes("tune")) {
    return "mechanic";
  }
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
 * Call OpenRouter with fallback models in sequence.
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
          temperature: 0.7,
          max_tokens: 600,
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
        return {
          reply: cleanContent,
          model: data.model || model,
        };
      }
    } catch (modelErr) {
      console.warn(`Error calling model ${model}:`, modelErr);
    }
  }

  throw new Error("All AI models were temporarily unreachable. Please try again shortly.");
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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
  const userMessage: string = body.message?.trim() ||
    (body.messages && body.messages.length > 0 ? body.messages[body.messages.length - 1]?.content?.trim() || "" : "");

  try {

    if (!userMessage) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Message is required",
      }, 400);
    }

    // Guardrail: check if message is on-topic before hitting the AI provider
    if (!isOnTopic(userMessage)) {
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
          reply: `I've created a support ticket for you! 🎫

**Ticket ID:** ${ticket.id}
**Subject:** ${ticket.subject}
**Category:** ${ticket.category}
**Status:** ${ticket.status}

An admin will review your request and respond soon. You can check the status of your ticket in the chat or ask me for updates.`,
          context_used: true,
          model: "ticket-system",
          ticket_created: true,
          ticket_id: ticket.id,
        }, null, 200);
      }
    }

    // Build context for the AI from user's recent bookings
    let userContext = "";
    if (body.user_id) {
      const supabase = createServiceClient();
      const bookings = await getUserContext(supabase, body.user_id);
      if (bookings && bookings.length > 0) {
        userContext = `The authenticated customer has these recent bookings on file: ${JSON.stringify(bookings)}.\n`;
      }
    }

    if (!OPENROUTER_API_KEY) {
      // Fallback when no OpenRouter key is configured (local dev without
      // a real LLM). Route through getDomainFallbackReply so the response
      // is keyword-aware (rental / mechanic / price) instead of a generic
      // welcome line. Mirrors the catch block below for consistency.
      return jsonResponse({
        conversation_id: body.conversation_id || crypto.randomUUID(),
        reply: getDomainFallbackReply(userMessage),
        context_used: false,
        model: "fallback-no-key",
      }, null, 200);
    }

    // Build API messages payload
    const apiMessages: { role: string; content: string }[] = [
      { role: "system", content: `${SYSTEM_PROMPT}${userContext ? `\n\n${userContext}` : ""}` }
    ];

    if (body.messages && body.messages.length > 0) {
      // Add last few messages for conversational context
      const history = body.messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      apiMessages.push(...history);
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
      reply: getDomainFallbackReply(userMessage),
      context_used: false,
      model: "fallback-resilient",
    }, null, 200);
  }
});
