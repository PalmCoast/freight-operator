import { pool, db, carriers, embedCase, laneRates } from "@freight/db";
import {
  Carrier,
  EquipmentType,
  LaneRate,
  ParsedRateRequest,
  PickupDate,
  SimilarExample,
  UsState,
  formatUsd,
} from "@freight/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { chooseCarrier, describeCarrierChoice } from "./eligibility";
import { describeParse } from "./parser";
import { describePrice, priceLane } from "./pricing";

const reasoning = z.string().trim().min(1);

export const ParseRateRequestInput = ParsedRateRequest.extend({ reasoning });
export type ParseRateRequestInput = z.infer<typeof ParseRateRequestInput>;

export const ParseRateRequestOutput = ParsedRateRequest.extend({
  reasoning: z.string(),
});
export type ParseRateRequestOutput = z.infer<typeof ParseRateRequestOutput>;

export const LookupLaneRateInput = z.object({
  originCity: z.string().trim().min(1),
  originState: UsState,
  destinationCity: z.string().trim().min(1),
  destinationState: UsState,
  equipment: EquipmentType,
  reasoning,
});
export type LookupLaneRateInput = z.infer<typeof LookupLaneRateInput>;

export const LookupLaneRateOutput = z.object({
  found: z.boolean(),
  lane: LaneRate.nullable(),
  reasoning: z.string(),
});
export type LookupLaneRateOutput = z.infer<typeof LookupLaneRateOutput>;

export const CheckCarrierInput = z.object({
  equipment: EquipmentType,
  originState: UsState,
  destinationState: UsState,
  reasoning,
});
export type CheckCarrierInput = z.infer<typeof CheckCarrierInput>;

const Consideration = z.object({
  id: z.string(),
  name: z.string(),
  mcNumber: z.string(),
  eligible: z.boolean(),
  reason: z.string(),
});

export const CheckCarrierOutput = z.object({
  carrier: Carrier.nullable(),
  considered: z.array(Consideration),
  reasoning: z.string(),
});
export type CheckCarrierOutput = z.infer<typeof CheckCarrierOutput>;

export const DraftQuoteInput = z.object({
  laneRateId: z.uuid(),
  carrierId: z.uuid(),
  rawText: z.string().min(1),
  weightLbs: z.number().int().positive(),
  pickupDate: PickupDate,
  reasoning,
});
export type DraftQuoteInput = z.infer<typeof DraftQuoteInput>;

const Price = z.object({
  linehaulCents: z.number().int(),
  fuelSurchargeCents: z.number().int(),
  marginCents: z.number().int(),
  allInCents: z.number().int(),
});

export const DraftQuoteOutput = z.object({
  ok: z.boolean(),
  lane: LaneRate.nullable(),
  carrier: Carrier.nullable(),
  price: Price.nullable(),
  examples: z.array(SimilarExample),
  reasoning: z.string(),
  validUntil: z.string().nullable(),
});
export type DraftQuoteOutput = z.infer<typeof DraftQuoteOutput>;

export function parseRateRequest(input: ParseRateRequestInput): ParseRateRequestOutput {
  const parsed = ParsedRateRequest.parse(input);
  return { ...parsed, reasoning: describeParse(parsed) };
}

export async function lookupLaneRate(
  input: LookupLaneRateInput,
): Promise<LookupLaneRateOutput> {
  const rows = await db
    .select()
    .from(laneRates)
    .where(
      and(
        eq(laneRates.originCity, input.originCity),
        eq(laneRates.originState, input.originState),
        eq(laneRates.destinationCity, input.destinationCity),
        eq(laneRates.destinationState, input.destinationState),
        eq(laneRates.equipment, input.equipment),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return {
      found: false,
      lane: null,
      reasoning: `No rate card for ${input.originCity}, ${input.originState} → ${input.destinationCity}, ${input.destinationState} (${input.equipment.replaceAll("_", " ")}).`,
    };
  }
  const lane = LaneRate.parse(row);
  return {
    found: true,
    lane,
    reasoning: describePrice(lane, priceLane(lane)),
  };
}

export async function checkCarrier(
  input: CheckCarrierInput,
): Promise<CheckCarrierOutput> {
  const rows = await db.select().from(carriers);
  const roster = rows.map((row) => Carrier.parse(row));
  const choice = chooseCarrier(
    roster,
    input.equipment,
    input.originState,
    input.destinationState,
  );
  return {
    carrier: choice.selected,
    considered: choice.considered.map((item) => ({
      id: item.id,
      name: item.name,
      mcNumber: item.mcNumber,
      eligible: item.eligible,
      reason: item.reason,
    })),
    reasoning: describeCarrierChoice(choice),
  };
}

export async function findSimilarExamples(input: {
  rawText: string;
  equipment: EquipmentType;
  originState: string;
  destinationState: string;
  limit?: number;
}): Promise<SimilarExample[]> {
  const vector = embedCase(input);
  const literal = `[${vector.join(",")}]`;
  const result = await pool.query<{
    id: string;
    raw_text: string;
    quote_all_in_cents: number;
    origin_state: string;
    destination_state: string;
    equipment: EquipmentType;
    notes: string | null;
    source: "seed" | "human_correction";
    similarity: number | string;
  }>(
    `select id, raw_text, quote_all_in_cents, origin_state, destination_state,
            equipment, notes, source,
            (1 - (embedding <=> $1::vector))::float8 as similarity
     from expert_examples
     where equipment = $2
     order by embedding <=> $1::vector
     limit $3`,
    [literal, input.equipment, input.limit ?? 3],
  );
  return result.rows.map((row) =>
    SimilarExample.parse({
      id: row.id,
      rawText: row.raw_text,
      quoteAllInCents: row.quote_all_in_cents,
      originState: row.origin_state,
      destinationState: row.destination_state,
      equipment: row.equipment,
      similarity: Number(row.similarity),
      source: row.source,
      notes: row.notes,
    }),
  );
}

export async function draftQuote(
  input: DraftQuoteInput,
): Promise<DraftQuoteOutput> {
  const laneRows = await db
    .select()
    .from(laneRates)
    .where(eq(laneRates.id, input.laneRateId))
    .limit(1);
  const carrierRows = await db
    .select()
    .from(carriers)
    .where(eq(carriers.id, input.carrierId))
    .limit(1);
  const laneRow = laneRows[0];
  const carrierRow = carrierRows[0];
  if (!laneRow || !carrierRow) {
    return {
      ok: false,
      lane: null,
      carrier: null,
      price: null,
      examples: [],
      validUntil: null,
      reasoning:
        "The draft step was given a lane or carrier id that is not on file.",
    };
  }
  const lane = LaneRate.parse(laneRow);
  const carrier = Carrier.parse(carrierRow);
  const price = priceLane(lane);
  const examples = await findSimilarExamples({
    rawText: input.rawText,
    equipment: lane.equipment,
    originState: lane.originState,
    destinationState: lane.destinationState,
  });
  const closest = examples[0];
  const exampleLine = closest
    ? `Retrieved ${examples.length} past desk example${examples.length === 1 ? "" : "s"}. Closest is ${closest.originState}→${closest.destinationState} at ${formatUsd(closest.quoteAllInCents)} (similarity ${closest.similarity.toFixed(2)}). The price still comes from the rate card until a human edits it.`
    : "No past desk example was on file for this equipment. The price comes from the rate card.";
  return {
    ok: true,
    lane,
    carrier,
    price,
    examples,
    validUntil: input.pickupDate,
    reasoning: `${describePrice(lane, price)} ${exampleLine} Held for a human before anything is marked sent.`,
  };
}
