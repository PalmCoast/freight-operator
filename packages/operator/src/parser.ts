import {
  EQUIPMENT_LABEL,
  US_STATE_CODES,
  type EquipmentType,
  type ParsedRateRequest,
  type UsState,
} from "@freight/schema";

const STATE_SET = new Set<string>(US_STATE_CODES);
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const LANE =
  /\b([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3})\s*,?\s+([A-Za-z]{2})\s+to\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3})\s*,?\s+([A-Za-z]{2})\b/gi;

/** Equipment words and filler otherwise get swallowed as part of the city. */
function laneSource(text: string): string {
  return text
    .replace(/\b(dry\s*vans?|reefers?|flat\s*beds?|flatbeds?|refrigerated)\b/gi, " ")
    .replace(/\b(please|need|quote|rate|can|you|from|a|an|the)\b/gi, " ");
}

const WEIGHT =
  /\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:lbs?|pounds)\b/i;

const ISO_DATE = /\bpickup\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i;
const WEEKDAY =
  /\bpickup\s+(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const COMMODITY =
  /\bcommodity\s*[:-]?\s*([A-Za-z][A-Za-z0-9 .'-]{1,80})/i;

export type ParseOutcome =
  | { ok: true; value: ParsedRateRequest }
  | { ok: false; error: string };

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function asState(value: string): UsState | null {
  const upper = value.toUpperCase();
  return STATE_SET.has(upper) ? (upper as UsState) : null;
}

function nextWeekday(now: Date, weekday: number): string {
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const delta = (weekday - cursor.getUTCDay() + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + delta);
  return cursor.toISOString().slice(0, 10);
}

function findLane(text: string): {
  originCity: string;
  originState: UsState;
  destinationCity: string;
  destinationState: UsState;
} | null {
  LANE.lastIndex = 0;
  for (const match of text.matchAll(LANE)) {
    const originState = asState(match[2] ?? "");
    const destinationState = asState(match[4] ?? "");
    const originCity = match[1];
    const destinationCity = match[3];
    if (!originState || !destinationState || !originCity || !destinationCity) {
      continue;
    }
    return {
      originCity: titleCase(originCity),
      originState,
      destinationCity: titleCase(destinationCity),
      destinationState,
    };
  }
  return null;
}

function findEquipment(text: string): EquipmentType | null {
  if (/\breefer\b|\brefrigerat/i.test(text)) return "reefer";
  if (/\bflat\s*bed\b|\bflatbed\b/i.test(text)) return "flatbed";
  if (/\bdry\s*van\b|\bvan\b/i.test(text)) return "dry_van";
  return null;
}

/**
 * Deterministic stand-in for the extraction a model does. The mock provider
 * calls this. A real model is asked for the same ParsedRateRequest shape.
 * The desk clock is UTC so "pickup Tuesday" does not depend on the host TZ.
 */
export function parseRateRequestText(rawText: string, now: Date): ParseOutcome {
  const text = rawText.trim();
  const equipment = findEquipment(text);
  const lane = findLane(laneSource(text));
  const weightMatch = WEIGHT.exec(text);
  const iso = ISO_DATE.exec(text);
  const weekday = WEEKDAY.exec(text);

  const missing: string[] = [];
  if (!equipment) missing.push("equipment (dry van, reefer, or flatbed)");
  if (!lane) missing.push("a lane like 'Chicago IL to Dallas TX'");
  if (!weightMatch?.[1]) missing.push("a weight in lbs");
  if (!iso?.[1] && !weekday?.[1]) {
    missing.push("a pickup date (YYYY-MM-DD or a weekday)");
  }
  if (missing.length > 0 || !equipment || !lane || !weightMatch?.[1]) {
    return {
      ok: false,
      error: `Could not parse a rate request. Missing ${missing.join(", ")}.`,
    };
  }

  const weightLbs = Number(weightMatch[1].replace(/,/g, ""));
  let pickupDate: string;
  if (iso?.[1]) {
    pickupDate = iso[1];
  } else {
    const dayName = (weekday?.[1] ?? "").toLowerCase();
    const index = WEEKDAYS.indexOf(dayName as (typeof WEEKDAYS)[number]);
    if (index < 0) {
      return { ok: false, error: "Pickup weekday was not recognized." };
    }
    pickupDate = nextWeekday(now, index);
  }

  const commodityMatch = COMMODITY.exec(text);
  const commodity = commodityMatch?.[1]
    ?.replace(/[.,;]+$/, "")
    .trim();

  const value: ParsedRateRequest = {
    equipment,
    originCity: lane.originCity,
    originState: lane.originState,
    destinationCity: lane.destinationCity,
    destinationState: lane.destinationState,
    weightLbs,
    pickupDate,
    ...(commodity ? { commodity } : {}),
  };

  return { ok: true, value };
}

export function describeParse(value: ParsedRateRequest): string {
  const commodity = value.commodity ? `, commodity ${value.commodity}` : "";
  return `Read this as ${EQUIPMENT_LABEL[value.equipment]} ${value.originCity}, ${value.originState} to ${value.destinationCity}, ${value.destinationState}, ${value.weightLbs.toLocaleString("en-US")} lbs, pickup ${value.pickupDate}${commodity}.`;
}
