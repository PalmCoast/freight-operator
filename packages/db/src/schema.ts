import { sql } from "drizzle-orm";
import {
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AuthorityStatus,
  EquipmentType,
  InsuranceStatus,
  SafetyRating,
} from "@freight/schema";

/**
 * pgvector column. node-postgres returns the value as a string like "[0.1,0.2]".
 * A real embedding model would fill this; the seed and the operator use a
 * deterministic hashing embedder so retrieval works with no API key.
 */
export const vector32 = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return "vector(32)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    const textValue = String(value).trim();
    if (!textValue || textValue === "[]") return [];
    return textValue
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((part) => Number(part));
  },
});

export const carriers = pgTable("carriers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  mcNumber: text("mc_number").notNull().unique(),
  dotNumber: text("dot_number").notNull(),
  equipment: jsonb("equipment").$type<EquipmentType[]>().notNull(),
  insuranceStatus: text("insurance_status")
    .$type<InsuranceStatus>()
    .notNull(),
  authorityStatus: text("authority_status")
    .$type<AuthorityStatus>()
    .notNull(),
  safetyRating: text("safety_rating").$type<SafetyRating>().notNull(),
  serviceStates: jsonb("service_states").$type<string[]>().notNull(),
});

export const laneRates = pgTable(
  "lane_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originCity: text("origin_city").notNull(),
    originState: text("origin_state").notNull(),
    destinationCity: text("destination_city").notNull(),
    destinationState: text("destination_state").notNull(),
    equipment: text("equipment").notNull(),
    mileage: integer("mileage").notNull(),
    ratePerMileCents: integer("rate_per_mile_cents").notNull(),
    fuelSurchargePerMileCents: integer("fuel_surcharge_per_mile_cents").notNull(),
    marginBps: integer("margin_bps").notNull(),
  },
  (table) => [
    uniqueIndex("lane_rates_lane_idx").on(
      table.originCity,
      table.originState,
      table.destinationCity,
      table.destinationState,
      table.equipment,
    ),
  ],
);

export const rateRequests = pgTable("rate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  rawText: text("raw_text").notNull(),
  equipment: text("equipment"),
  originCity: text("origin_city"),
  originState: text("origin_state"),
  destinationCity: text("destination_city"),
  destinationState: text("destination_state"),
  weightLbs: integer("weight_lbs"),
  pickupDate: text("pickup_date"),
  commodity: text("commodity"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const loads = pgTable("loads", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateRequestId: uuid("rate_request_id")
    .notNull()
    .unique()
    .references(() => rateRequests.id),
  status: text("status").notNull(),
  equipment: text("equipment").notNull(),
  originCity: text("origin_city").notNull(),
  originState: text("origin_state").notNull(),
  destinationCity: text("destination_city").notNull(),
  destinationState: text("destination_state").notNull(),
  weightLbs: integer("weight_lbs").notNull(),
  pickupDate: text("pickup_date").notNull(),
  commodity: text("commodity"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const operatorRuns = pgTable("operator_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateRequestId: uuid("rate_request_id")
    .notNull()
    .references(() => rateRequests.id),
  status: text("status").notNull(),
  currentStep: text("current_step"),
  model: text("model").notNull(),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const operatorSteps = pgTable(
  "operator_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => operatorRuns.id),
    name: text("name").notNull(),
    status: text("status").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("operator_steps_run_name_idx").on(table.runId, table.name),
  ],
);

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => operatorRuns.id),
  stepName: text("step_name").notNull(),
  toolName: text("tool_name"),
  inputs: jsonb("inputs").notNull(),
  reasoning: text("reasoning").notNull(),
  outcome: jsonb("outcome").notNull(),
  attempt: integer("attempt").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadId: uuid("load_id")
    .notNull()
    .references(() => loads.id),
  runId: uuid("run_id")
    .notNull()
    .unique()
    .references(() => operatorRuns.id),
  carrierId: uuid("carrier_id").references(() => carriers.id),
  linehaulCents: integer("linehaul_cents").notNull(),
  fuelSurchargeCents: integer("fuel_surcharge_cents").notNull(),
  marginCents: integer("margin_cents").notNull(),
  allInCents: integer("all_in_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  approvalStatus: text("approval_status").notNull(),
  editedAllInCents: integer("edited_all_in_cents"),
  validUntil: text("valid_until").notNull(),
  reasoning: text("reasoning").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .unique()
    .references(() => operatorRuns.id),
  status: text("status").notNull(),
  editedAllInCents: integer("edited_all_in_cents"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const expertExamples = pgTable("expert_examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  rawText: text("raw_text").notNull(),
  originState: text("origin_state").notNull(),
  destinationState: text("destination_state").notNull(),
  equipment: text("equipment").notNull(),
  quoteAllInCents: integer("quote_all_in_cents").notNull(),
  notes: text("notes"),
  source: text("source").notNull(),
  embedding: vector32("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const touchedAt = sql`now()`;
