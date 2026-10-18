export type ChatMode = "trip" | "diagnosis";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RecommendationCandidate {
  kind: "vehicle" | "service";
  id: string;
  reason: string;
}

export interface PlannerDraft {
  reply: string;
  candidates: RecommendationCandidate[];
  preferences: {
    destination: string;
    trip_start: string;
    trip_end: string;
    trip_days: number | null;
    passenger_count: number | null;
    daily_budget_php: number | null;
    total_budget_php: number | null;
    vehicle_preference: string;
    transmission_preference: string;
    fuel_preference: string;
  };
  itinerary: {
    title: string;
    days: Array<{ day: number; title: string; activities: string[] }>;
  };
}

export interface VerifiedTripPreferences {
  destination?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  passengerCount?: number;
  dailyBudgetPhp?: number;
  totalBudgetPhp?: number;
  vehiclePreference?: string;
  transmissionPreference?: string;
  fuelPreference?: string;
}

export interface ExplicitVehiclePreferences {
  vehiclePreference?: string;
  transmissionPreference?: string;
  fuelPreference?: string;
}

export interface ValidatedItinerary {
  title: string;
  days: Array<{ day: number; title: string; activities: string[] }>;
}

export const MAX_MESSAGE_CHARS = 3000;
export const MAX_HISTORY_ITEMS = 32;
export const MAX_HISTORY_MESSAGE_CHARS = 1200;
export const MAX_HISTORY_TOTAL_CHARS = 18_000;
export const MAX_REQUEST_BYTES = 48 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function normalizeHistory(
  value: unknown,
  currentMessage: string,
): ChatHistoryMessage[] {
  if (!Array.isArray(value)) return [{ role: "user", content: currentMessage }];

  const history: ChatHistoryMessage[] = [];
  for (const item of value.slice(-MAX_HISTORY_ITEMS * 2)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (candidate.role !== "user" && candidate.role !== "assistant") continue;
    if (typeof candidate.content !== "string") continue;
    const content = candidate.content.trim().slice(
      0,
      MAX_HISTORY_MESSAGE_CHARS,
    );
    if (!content) continue;
    history.push({ role: candidate.role, content });
  }

  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== currentMessage) {
    history.push({ role: "user", content: currentMessage });
  }
  const bounded = history.slice(-MAX_HISTORY_ITEMS);
  const result: ChatHistoryMessage[] = [];
  let totalChars = 0;
  for (const message of bounded.reverse()) {
    if (totalChars + message.content.length > MAX_HISTORY_TOTAL_CHARS) continue;
    result.push(message);
    totalChars += message.content.length;
  }
  return result.reverse();
}

export function parsePlannerDraft(value: unknown): PlannerDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const preferences = item.preferences as Record<string, unknown> | null;
  const itinerary = item.itinerary as Record<string, unknown> | null;
  if (
    !preferences || typeof preferences !== "object" || !itinerary ||
    typeof itinerary !== "object"
  ) return null;
  if (
    typeof item.reply !== "string" || !item.reply.trim() ||
    item.reply.length > 2400
  ) return null;
  if (!Array.isArray(item.candidates) || item.candidates.length > 3) {
    return null;
  }
  const candidates: RecommendationCandidate[] = [];
  for (const raw of item.candidates) {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Record<string, unknown>;
    if (
      (candidate.kind !== "vehicle" && candidate.kind !== "service") ||
      typeof candidate.id !== "string" ||
      typeof candidate.reason !== "string"
    ) return null;
    if (!isUuid(candidate.id)) continue;
    candidates.push({
      kind: candidate.kind,
      id: candidate.id,
      reason: candidate.reason.slice(0, 300),
    });
  }

  if (
    typeof preferences.destination !== "string" ||
    typeof preferences.trip_start !== "string" ||
    typeof preferences.trip_end !== "string" ||
    typeof preferences.vehicle_preference !== "string" ||
    typeof preferences.transmission_preference !== "string" ||
    typeof preferences.fuel_preference !== "string"
  ) return null;
  const nullableNumber = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isFinite(v));
  if (
    !nullableNumber(preferences.trip_days) ||
    !nullableNumber(preferences.passenger_count) ||
    !nullableNumber(preferences.daily_budget_php) ||
    !nullableNumber(preferences.total_budget_php)
  ) return null;
  if (
    typeof itinerary.title !== "string" || !Array.isArray(itinerary.days) ||
    itinerary.days.length > 30
  ) return null;

  const days: ValidatedItinerary["days"] = [];
  for (const rawDay of itinerary.days) {
    if (!rawDay || typeof rawDay !== "object") return null;
    const day = rawDay as Record<string, unknown>;
    if (
      typeof day.day !== "number" || !Number.isInteger(day.day) ||
      typeof day.title !== "string" || !Array.isArray(day.activities) ||
      day.activities.length > 5 || !day.activities.every((a) =>
        typeof a === "string"
      )
    ) return null;
    days.push({
      day: day.day,
      title: day.title.slice(0, 120),
      activities: (day.activities as string[]).map((activity) =>
        activity.slice(0, 180)
      ),
    });
  }

  return {
    reply: item.reply.trim(),
    candidates,
    preferences: {
      destination: preferences.destination.slice(0, 120).trim(),
      trip_start: preferences.trip_start.trim(),
      trip_end: preferences.trip_end.trim(),
      trip_days: preferences.trip_days as number | null,
      passenger_count: preferences.passenger_count as number | null,
      daily_budget_php: preferences.daily_budget_php as number | null,
      total_budget_php: preferences.total_budget_php as number | null,
      vehicle_preference: preferences.vehicle_preference.slice(0, 40).trim(),
      transmission_preference: preferences.transmission_preference.slice(0, 40)
        .trim(),
      fuel_preference: preferences.fuel_preference.slice(0, 40).trim(),
    },
    itinerary: { title: itinerary.title.slice(0, 120), days },
  };
}

function mentionedByUser(value: string, userMessages: string[]): boolean {
  const target = value.trim().toLocaleLowerCase();
  if (!target) return false;
  return userMessages.some((message) =>
    message.toLocaleLowerCase().includes(target)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberForms(n: number): string[] {
  const forms = new Set([
    String(n),
    n.toLocaleString("en-US"),
    Number.isInteger(n) ? `${n}.0` : n.toFixed(2),
  ]);
  if (n >= 1000 && n % 1000 === 0) forms.add(`${n / 1000}k`);
  return [...forms].map(escapeRegExp);
}

function amountWasMentioned(
  n: number,
  userMessages: string[],
  qualifier: "daily" | "total",
): boolean {
  if (!Number.isFinite(n)) return false;
  const amountRe = numberForms(n).join("|");
  return userMessages.some((message) => {
    const amountPresent = new RegExp(
      `(?:₱\\s*|\\bphp\\s*|\\bpesos?\\s*)?(?:${amountRe})(?![\\d])`,
      "i",
    ).test(message);
    if (!amountPresent) return false;
    return qualifier === "daily"
      ? /\b(?:per day|daily|each day)\b|\/\s*day\b/i.test(message)
      : /\b(?:total|overall|whole trip|for the trip)\b/i.test(message);
  });
}

function latestBudgetStatement(userMessages: string[]): string | undefined {
  const amount = /₱|\b(?:php|pesos?)\b|\b\d[\d,]*(?:\.\d+)?\s*k?\b/i;
  const scope =
    /\b(?:budget|spend|spending|price range|daily|per day|total|overall|whole trip)\b|\/\s*day\b/i;
  return [...userMessages].reverse().find((message) =>
    amount.test(message) && scope.test(message)
  );
}

const SMALL_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function numericToken(value: string): number {
  return /^\d+$/.test(value)
    ? Number(value)
    : (SMALL_NUMBER_WORDS[value.toLowerCase()] ?? 0);
}

function extractPassengerCount(userMessages: string[]): number | undefined {
  for (const message of [...userMessages].reverse()) {
    const explicitTotal = message.match(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:passengers?|travelers?|travellers?|ppl|people|persons?)\b/i,
    );
    if (explicitTotal) return numericToken(explicitTotal[1]);
    const parts: number[] = [];
    const componentRe =
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:adults?|kids?|children)\b/gi;
    for (const match of message.matchAll(componentRe)) {
      parts.push(numericToken(match[1]));
    }
    if (parts.length && parts.reduce((sum, count) => sum + count, 0) <= 20) {
      return parts.reduce((sum, count) => sum + count, 0);
    }
    const groupMatch = message.match(
      /\b(?:family of|party of|we are|there are|it's)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b|\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+of us\b/i,
    );
    if (groupMatch) return numericToken(groupMatch[1] ?? groupMatch[2]);
  }
  return undefined;
}

export function hasStatedPassengerCount(userMessages: string[]): boolean {
  const count = extractPassengerCount(userMessages);
  return count !== undefined && count >= 1 && count <= 20;
}

export function hasFlexibleBudget(userMessages: string[]): boolean {
  const flexible =
    /\b(?:no (?:set )?budget|budget (?:is )?flexible|any budget|no budget limit|price (?:isn't|is not) a concern|open to any price)\b/i;
  let latestFlexible: boolean | undefined;
  for (const message of userMessages) {
    if (latestBudgetStatement([message])) latestFlexible = false;
    else if (flexible.test(message)) latestFlexible = true;
  }
  return latestFlexible === true;
}

export function hasVerifiedBudget(
  preferences: VerifiedTripPreferences,
  userMessages: string[],
): boolean {
  return preferences.dailyBudgetPhp !== undefined ||
    hasFlexibleBudget(userMessages);
}

function contextualTripEvidence(history: ChatHistoryMessage[]): string[] {
  const evidence: string[] = [];
  let precedingAssistant = "";
  for (const message of history) {
    if (message.role === "assistant") {
      precedingAssistant = message.content;
      continue;
    }
    const answer = message.content.trim();
    if (
      /^(?:\d{1,7}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?k|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*(?:php|pesos?))?$/i
        .test(answer)
    ) {
      const countPrompt =
        /\b(?:how many|number of)\s+(?:people|passengers|travelers|travellers)|party size|group size\b/i
          .test(precedingAssistant);
      const dailyBudgetPrompt =
        /\b(?:daily budget|budget per day|per-day budget|how much per day|spend each day)\b/i
          .test(precedingAssistant);
      const totalBudgetPrompt =
        /\b(?:total budget|budget for the whole trip|overall budget|total spend)\b/i
          .test(precedingAssistant);
      if (countPrompt && !dailyBudgetPrompt && !totalBudgetPrompt) {
        evidence.push(`${answer} passengers`);
      } else if (dailyBudgetPrompt && !countPrompt && !totalBudgetPrompt) {
        evidence.push(`${answer} per day`);
      } else if (totalBudgetPrompt && !countPrompt && !dailyBudgetPrompt) {
        evidence.push(`${answer} total budget`);
      }
    }
    evidence.push(answer);
  }
  return evidence;
}

export function verifyTripPreferences(
  draft: PlannerDraft,
  userMessages: string[],
  now = new Date(),
  history: ChatHistoryMessage[] = [],
): VerifiedTripPreferences {
  const preferences = draft.preferences;
  const evidenceMessages = history.length
    ? contextualTripEvidence(history)
    : userMessages;
  const result: VerifiedTripPreferences = {};
  if (mentionedByUser(preferences.destination, evidenceMessages)) {
    result.destination = preferences.destination;
  }

  const passengerCount = preferences.passenger_count;
  if (
    passengerCount !== null && Number.isInteger(passengerCount) &&
    passengerCount >= 1 && passengerCount <= 20 &&
    extractPassengerCount(evidenceMessages) === passengerCount
  ) {
    result.passengerCount = passengerCount;
  }

  const budget = preferences.daily_budget_php;
  const totalBudget = preferences.total_budget_php;
  const currentBudgetEvidence = latestBudgetStatement(evidenceMessages);
  const budgetEvidence = currentBudgetEvidence ? [currentBudgetEvidence] : [];
  if (
    !hasFlexibleBudget(evidenceMessages) && budget !== null && budget > 0 &&
    budget <= 1_000_000 && amountWasMentioned(budget, budgetEvidence, "daily")
  ) {
    result.dailyBudgetPhp = budget;
  }
  if (
    !hasFlexibleBudget(evidenceMessages) && totalBudget !== null &&
    totalBudget > 0 && totalBudget <= 10_000_000 &&
    amountWasMentioned(totalBudget, budgetEvidence, "total")
  ) {
    result.totalBudgetPhp = totalBudget;
  }

  const tripDays = preferences.trip_days;
  if (
    tripDays !== null && Number.isInteger(tripDays) && tripDays >= 1 &&
    tripDays <= 30 &&
    evidenceMessages.some((message) => containsDayCount(message, tripDays))
  ) {
    result.days = tripDays;
  }

  const allUserText = evidenceMessages.join("\n");
  const dateMentions: string[] =
    allUserText.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  const startDate = preferences.trip_start;
  const endDate = preferences.trip_end;
  const relativeRange = resolveRelativeStartAndDuration(allUserText, now);
  const explicitPair = dateMentions.includes(startDate) &&
    dateMentions.includes(endDate);
  const matchingRelative = relativeRange?.startDate === startDate &&
    relativeRange.endDate === endDate;
  if (
    (explicitPair || matchingRelative) &&
    isValidTripDateRange(startDate, endDate, now)
  ) {
    result.startDate = startDate;
    result.endDate = endDate;
    result.days = dateDistanceDays(startDate, endDate);
  }

  if (
    result.dailyBudgetPhp === undefined &&
    result.totalBudgetPhp !== undefined && result.days
  ) {
    result.dailyBudgetPhp = Math.floor(result.totalBudgetPhp / result.days);
  }

  const explicitVehiclePreferences = deriveExplicitVehiclePreferences(
    evidenceMessages,
  );
  if (explicitVehiclePreferences.vehiclePreference) {
    result.vehiclePreference = explicitVehiclePreferences.vehiclePreference;
  }
  if (explicitVehiclePreferences.transmissionPreference) {
    result.transmissionPreference =
      explicitVehiclePreferences.transmissionPreference;
  }
  if (explicitVehiclePreferences.fuelPreference) {
    result.fuelPreference = explicitVehiclePreferences.fuelPreference;
  }
  return result;
}

export function isValidTripDateRange(
  start: string,
  end: string,
  now = new Date(),
): boolean {
  const startMs = strictDateMillis(start);
  const endMs = strictDateMillis(end);
  if (startMs === null || endMs === null || endMs <= startMs) return false;
  const todayString = manilaDate(now);
  const today = strictDateMillis(todayString)!;
  const days = (endMs - startMs) / 86_400_000;
  return startMs >= today && days >= 1 && days <= 30;
}

export function manilaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function dateDistanceDays(start: string, end: string): number {
  const startMs = strictDateMillis(start);
  const endMs = strictDateMillis(end);
  return startMs === null || endMs === null
    ? 0
    : (endMs - startMs) / 86_400_000;
}

function strictDateMillis(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) &&
      new Date(ms).toISOString().slice(0, 10) === value
    ? ms
    : null;
}

function containsDayCount(text: string, days: number): boolean {
  const word = Object.entries(SMALL_NUMBER_WORDS).find(([, count]) =>
    count === days
  )?.[0];
  return new RegExp(`\\b(?:${days}${word ? `|${word}` : ""})\\s+days?\\b`, "i")
    .test(text);
}

interface PreferenceTerm {
  value: string;
  pattern: RegExp;
}

const VEHICLE_TYPE_TERMS: PreferenceTerm[] = [
  { value: "minivan", pattern: /\bmini[- ]?vans?\b/gi },
  { value: "suv", pattern: /\b(?:suvs?|sport utility vehicles?)\b/gi },
  { value: "sedan", pattern: /\bsedans?\b/gi },
  { value: "hatchback", pattern: /\bhatchbacks?\b/gi },
  { value: "pickup", pattern: /\b(?:pick[- ]?ups?(?: trucks?)?)\b/gi },
  { value: "truck", pattern: /\btrucks?\b/gi },
  { value: "van", pattern: /\b(?:vans?|minivans?)\b/gi },
  { value: "luxury", pattern: /\bluxury\b/gi },
  { value: "sports", pattern: /\b(?:sports? cars?|sporty)\b/gi },
  { value: "economy", pattern: /\beconomy\b/gi },
];

const TRANSMISSION_TERMS: PreferenceTerm[] = [
  {
    value: "automatic",
    pattern: /\b(?:automatic|auto transmission|auto gearbox)\b/gi,
  },
  {
    value: "manual",
    pattern: /\b(?:manual|stick shift|manual transmission)\b/gi,
  },
];

const FUEL_TERMS: PreferenceTerm[] = [
  { value: "gasoline", pattern: /\b(?:gasoline|petrol)\b/gi },
  { value: "diesel", pattern: /\bdiesel\b/gi },
  { value: "hybrid", pattern: /\bhybrid\b/gi },
  { value: "electric", pattern: /\b(?:electric|ev)\b/gi },
];

function isNegatedPreferenceMention(message: string, index: number): boolean {
  const prefix = message.slice(0, index)
    .split(/[.!?;,]|\bbut\b|\bhowever\b|\binstead\b/i)
    .pop() ?? "";
  return /\b(?:not|no|don't|dont|do not|never|avoid|exclude|excluding|without)\b(?:\s+\w+){0,4}\s*$/i
    .test(prefix);
}

function latestExplicitPreference(
  userMessages: string[],
  terms: PreferenceTerm[],
  resetPhrase: RegExp,
): string | undefined {
  for (const message of [...userMessages].reverse()) {
    const mentions: Array<{ value: string; index: number; positive: boolean }> =
      [];
    for (const term of terms) {
      for (const match of message.matchAll(term.pattern)) {
        const index = match.index ?? 0;
        if (
          term.value === "van" &&
          (/^minivans?$/i.test(match[0]) ||
            /\bmini[- ]?$/i.test(message.slice(0, index)))
        ) continue;
        if (
          term.value === "truck" &&
          /\b(?:pick[- ]?up)\s+$/i.test(message.slice(0, index))
        ) continue;
        mentions.push({
          value: term.value,
          index,
          positive: !isNegatedPreferenceMention(message, index),
        });
      }
    }
    if (mentions.length) {
      const lastMention = mentions.reduce((last, mention) =>
        mention.index > last.index ? mention : last
      );
      if (
        resetPhrase.test(message.slice(lastMention.index + 1))
      ) return undefined;
      const positive = [
        ...new Set(
          mentions.filter((item) => item.positive).map((item) => item.value),
        ),
      ];
      return positive.length === 1 ? positive[0] : undefined;
    }
    if (resetPhrase.test(message)) return undefined;
  }
  return undefined;
}

export function deriveExplicitVehiclePreferences(
  userMessages: string[],
): ExplicitVehiclePreferences {
  return {
    vehiclePreference: latestExplicitPreference(
      userMessages,
      VEHICLE_TYPE_TERMS,
      /\b(?:any|either)\s+(?:car|vehicle|body type|body style|type)|\bno preference\b|\b(?:doesn't|does not) matter\b|\banything works\b|\b(?:don't|dont|do not) care (?:about )?(?:the )?(?:vehicle|car|body type)\b/i,
    ),
    transmissionPreference: latestExplicitPreference(
      userMessages,
      TRANSMISSION_TERMS,
      /\b(?:any|either)\s+(?:transmission|gearbox)|\bno preference\b|\b(?:doesn't|does not) matter\b|\b(?:don't|dont|do not) care (?:about )?(?:the )?(?:transmission|gearbox)\b/i,
    ),
    fuelPreference: latestExplicitPreference(
      userMessages,
      FUEL_TERMS,
      /\bany fuel\b|\bno preference\b|\b(?:doesn't|does not) matter\b|\b(?:don't|dont|do not) care (?:about )?(?:the )?fuel\b/i,
    ),
  };
}

export function matchesVehicleCategory(
  category: string | null | undefined,
  subCategory: string | null | undefined,
  preference: string,
): boolean {
  const value = `${category ?? ""} ${subCategory ?? ""}`.toLowerCase();
  const patterns: Record<string, RegExp> = {
    suv: /\b(?:suvs?|sport utility vehicles?)\b/i,
    sedan: /\bsedans?\b/i,
    hatchback: /\bhatchbacks?\b/i,
    minivan: /\bmini[- ]?vans?\b/i,
    van: /\b(?:vans?|minivans?)\b/i,
    pickup: /\b(?:pick[- ]?ups?(?: trucks?)?)\b/i,
    truck: /\btrucks?\b/i,
    luxury: /\bluxury\b/i,
    sports: /\b(?:sports? cars?|sporty)\b/i,
    economy: /\beconomy\b/i,
  };
  return (patterns[preference.toLowerCase()] ??
    new RegExp(`\\b${escapeRegExp(preference)}\\b`, "i")).test(value);
}

export function matchesTransmissionType(
  transmission: string | null | undefined,
  preference: string,
): boolean {
  const patterns: Record<string, RegExp> = {
    automatic: /\b(?:automatic|auto|at)\b/i,
    manual: /\b(?:manual|stick shift)\b/i,
  };
  return (patterns[preference.toLowerCase()] ??
    new RegExp(`\\b${escapeRegExp(preference)}\\b`, "i")).test(
      transmission ?? "",
    );
}

export function matchesVehicleFuelType(
  fuelType: string | null | undefined,
  preference: string,
): boolean {
  const patterns: Record<string, RegExp> = {
    gasoline: /\b(?:gas(?:oline)?|petrol)\b/i,
    petrol: /\b(?:gas(?:oline)?|petrol)\b/i,
    diesel: /\bdiesel\b/i,
    hybrid: /\bhybrid\b/i,
    electric: /\b(?:electric|ev)\b/i,
    ev: /\b(?:electric|ev)\b/i,
  };
  return (patterns[preference.toLowerCase()] ??
    new RegExp(`\\b${escapeRegExp(preference)}\\b`, "i")).test(
      fuelType ?? "",
    );
}

function resolveRelativeStartAndDuration(
  text: string,
  now = new Date(),
): { startDate: string; endDate: string } | undefined {
  const durationMatch = text.match(
    /\b(?:(?:for|over)\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\b/i,
  );
  if (!durationMatch) return undefined;
  const count = numericToken(durationMatch[1]);
  if (!Number.isInteger(count) || count < 1 || count > 30) return undefined;
  const startPhrase = text.match(/\b(day after tomorrow|tomorrow|today)\b/i)
    ?.[1]?.toLowerCase();
  let offset = startPhrase === "today"
    ? 0
    : startPhrase === "tomorrow"
    ? 1
    : startPhrase === "day after tomorrow"
    ? 2
    : undefined;
  const weekdayPhrase = text.match(
    /\b(?:next|this coming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  )?.[1]?.toLowerCase();
  if (offset === undefined && weekdayPhrase) {
    const weekdayNumber: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const today = new Date(`${manilaDate(now)}T00:00:00.000Z`);
    const difference = (weekdayNumber[weekdayPhrase] - today.getUTCDay() + 7) %
      7;
    offset = difference === 0 ? 7 : difference;
  }
  if (offset === undefined) return undefined;
  const start = strictDateMillis(manilaDate(now));
  if (start === null) return undefined;
  const startDate = new Date(start + offset * 86_400_000).toISOString().slice(
    0,
    10,
  );
  const endDate = new Date(start + (offset + count) * 86_400_000).toISOString()
    .slice(0, 10);
  return { startDate, endDate };
}

function removeNegatedUrgentTerms(text: string): string {
  return text
    .replace(
      /\b(?:no|not|never|without|isn't|isnt|aren't|arent|doesn't|doesnt|don't|dont)\s+(?:any\s+)?(?:smoke|smoking|fire|flames?|overheating|overheated|steam|fuel smell|gas smell|brake failure|brakes failing|steering failure)\b/gi,
      " ",
    )
    .replace(/\bbrakes?\s+(?:are\s+)?(?:working|fine|okay|ok)\b/gi, " ");
}

export function isUrgentSafetyConcern(message: string): boolean {
  const text = removeNegatedUrgentTerms(message.toLowerCase());
  return [
    /\b(smoke|smoking|fire|flames?)\b/i,
    /\b(?:fuel|gas(?:oline)?|petrol)\s+(?:leak|leaking|smell|odor)\b/i,
    /\b(?:smell|odor)\s+(?:of\s+)?(?:fuel|gas(?:oline)?|petrol)\b/i,
    /\bbrakes?\s+(?:failed?|not working|aren't working|arent working|don't work|dont work)\b/i,
    /\bbrake pedal (?:goes?|went) to (?:the )?floor\b/i,
    /\b(?:can't|cannot|unable to) stop\b/i,
    /\bsteering (?:failed?|not working|locked|went out)\b/i,
    /\b(overheating|overheated|steam from (?:the )?(?:engine|hood|bonnet)|temperature (?:gauge|light) (?:is )?(?:in|at|on) (?:the )?red)\b/i,
    /\bburning smell\b/i,
    /\b(?:oil pressure (?:light|warning)|red oil light)\b/i,
    /\b(?:crash|collision|accident with injuries|someone is injured|someone is hurt|person is hurt)\b/i,
  ].some((pattern) => pattern.test(text));
}

export function isUrgentSafetyFollowUp(
  history: ChatHistoryMessage[],
  currentMessage: string,
): boolean {
  const priorUserMessages = history.filter((entry) => entry.role === "user")
    .map((entry) => entry.content);
  if (
    priorUserMessages[priorUserMessages.length - 1]?.trim() ===
      currentMessage.trim()
  ) priorUserMessages.pop();
  const recentUrgentSymptom = priorUserMessages.slice(-2).reverse().find((
    message,
  ) => isUrgentSafetyConcern(message));
  if (!recentUrgentSymptom) return false;
  return /\b(?:can i|should i|is it safe to|is it okay to|may i|do i)\s+(?:drive|keep driving|continue|go|head|make it|start|restart|repair|fix|check)|\b(?:drive home|drive there|keep going|continue driving|what should i do|what do i do|can i get home|can i make it)\b/i
    .test(currentMessage);
}

export function validateItinerary(
  draft: PlannerDraft,
  preferences: VerifiedTripPreferences,
): ValidatedItinerary | undefined {
  const maxDays = preferences.days;
  if (
    !preferences.destination || !maxDays || maxDays < 1 || maxDays > 30 ||
    !draft.itinerary.title.trim()
  ) return undefined;
  const days = draft.itinerary.days
    .filter((day) =>
      Number.isInteger(day.day) && day.day >= 1 && day.day <= maxDays &&
      day.title.trim()
    )
    .slice(0, maxDays)
    .map((day) => ({
      day: day.day,
      title: day.title.trim(),
      activities: day.activities
        .map((activity) => activity.trim())
        .filter((activity) =>
          activity &&
          !/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|₱|\bphp\s*\d|\b(?:open|closes?) at\b|\btraffic\b|\bweather\b/i
            .test(activity)
        )
        .slice(0, 4),
    }))
    .sort((a, b) => a.day - b.day);
  if (!days.length) return undefined;
  return { title: draft.itinerary.title.trim(), days };
}

export function sanitizePlannerReply(reply: string, mode?: ChatMode): string {
  const blockedClaim =
    /₱|\$\s*\d|\bPHP\s*\d|\b(?:booked|booking confirmed|reservation confirmed|reserved for you)\b/i;
  const availabilityClaim =
    /\b(?:available|availability confirmed|in stock|ready to rent|bookable)\b/i;
  const diyInstruction =
    /^(?:[-•]\s*)?(?:try|check|inspect|remove|disconnect|replace|tighten|open|add|pour|top up|jump[- ]start|test|drive|restart|turn off|turn on|bypass)\b|\b(?:try to (?:repair|fix|replace|jump|bypass)|you can (?:repair|fix|replace|disconnect|remove|jump-start)|keep driving|drive it to|open the radiator|remove the battery|bypass the)\b/i;
  return reply.split(/\r?\n/)
    .map((line) =>
      line.split(/(?<=[.!?])\s+/).filter((sentence) =>
        !blockedClaim.test(sentence) &&
        !(mode === "trip" && availabilityClaim.test(sentence)) &&
        (mode !== "diagnosis" || !diyInstruction.test(sentence.trim()))
      ).join(" ")
    )
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, 1800);
}

interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();

export function takeChatbotRateLimit(
  key: string,
  now = Date.now(),
  limit = 20,
  windowMs = 60_000,
): boolean {
  for (const [bucketKey, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
  }
  if (rateBuckets.size > 2000) {
    const oldest = [...rateBuckets.entries()].sort((a, b) =>
      a[1].resetAt - b[1].resetAt
    ).slice(0, rateBuckets.size - 1500);
    for (const [bucketKey] of oldest) rateBuckets.delete(bucketKey);
  }

  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

export function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signConversationId(
  id: string,
  owner: string,
  secret: string,
  expiresAt: number,
): Promise<string> {
  const payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ v: 1, id, owner, exp: expiresAt }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `v1.${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyConversationId(
  value: string,
  owner: string,
  secret: string,
  now = Date.now(),
): Promise<"valid" | "owner_mismatch" | "invalid"> {
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return "invalid";
  const payloadBytes = decodeBase64Url(parts[1]);
  const signatureBytes = decodeBase64Url(parts[2]);
  if (!payloadBytes || !signatureBytes) return "invalid";
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBuffer = Uint8Array.from(signatureBytes)
      .buffer as ArrayBuffer;
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      new TextEncoder().encode(parts[1]),
    );
    if (!verified) return "invalid";
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as Record<string, unknown>;
    if (
      payload.v !== 1 || typeof payload.id !== "string" ||
      !isUuid(payload.id) || typeof payload.owner !== "string" ||
      typeof payload.exp !== "number" || payload.exp <= now
    ) return "invalid";
    return payload.owner === owner ? "valid" : "owner_mismatch";
  } catch {
    return "invalid";
  }
}
