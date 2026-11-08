import { z } from "zod";

/**
 * Shared contracts. Every layer — the model tools, the database boundary,
 * tRPC, and the desk — imports these instead of re-declaring shapes.
 */

export const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

export const UsState = z.enum(US_STATE_CODES);
export type UsState = z.infer<typeof UsState>;

export const EquipmentType = z.enum(["dry_van", "reefer", "flatbed"]);
export type EquipmentType = z.infer<typeof EquipmentType>;

export const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  dry_van: "Dry van",
  reefer: "Reefer",
  flatbed: "Flatbed",
};

export const InsuranceStatus = z.enum(["active", "expired", "pending"]);
export type InsuranceStatus = z.infer<typeof InsuranceStatus>;

export const AuthorityStatus = z.enum(["authorized", "revoked", "pending"]);
export type AuthorityStatus = z.infer<typeof AuthorityStatus>;

export const SafetyRating = z.enum([
  "satisfactory",
  "conditional",
  "unsatisfactory",
  "none",
]);
export type SafetyRating = z.infer<typeof SafetyRating>;

export const ApprovalStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "edited",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const RunStatus = z.enum([
  "pending",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "rejected",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "waiting",
]);
export type StepStatus = z.infer<typeof StepStatus>;

export const OperatorStepName = z.enum([
  "parse_request",
  "lookup_lane",
  "check_carrier",
  "draft_quote",
  "await_approval",
  "finalize",
]);
export type OperatorStepName = z.infer<typeof OperatorStepName>;

export const OPERATOR_STEP_ORDER = OperatorStepName.options;

export const STEP_LABEL: Record<OperatorStepName, string> = {
  parse_request: "Parse request",
  lookup_lane: "Look up lane rate",
  check_carrier: "Check carrier",
  draft_quote: "Draft quote",
  await_approval: "Human approval",
  finalize: "Send quote",
};

const uuid = z.uuid();

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const PickupDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isIsoDate, "Invalid calendar date");

/** What the model (or the mock standing in for it) must return for a parse. */
export const ParsedRateRequest = z.object({
  equipment: EquipmentType,
  originCity: z.string().trim().min(1),
  originState: UsState,
  destinationCity: z.string().trim().min(1),
  destinationState: UsState,
  weightLbs: z.number().int().positive().max(80_000),
  pickupDate: PickupDate,
  commodity: z.string().trim().min(1).optional(),
});
export type ParsedRateRequest = z.infer<typeof ParsedRateRequest>;

/** A rate request as stored. Parsed fields stay null until the parse step. */
export const RateRequest = z.object({
  id: uuid,
  rawText: z.string().min(1),
  equipment: EquipmentType.nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  weightLbs: z.number().int().positive().nullable(),
  pickupDate: z.string().nullable(),
  commodity: z.string().nullable(),
  createdAt: z.string(),
});
export type RateRequest = z.infer<typeof RateRequest>;

export const SubmitRateRequest = z.object({
  rawText: z.string().trim().min(8).max(8_000),
});
export type SubmitRateRequest = z.infer<typeof SubmitRateRequest>;

export const LoadStatus = z.enum(["quoting", "quoted", "cancelled"]);
export type LoadStatus = z.infer<typeof LoadStatus>;

export const Load = z.object({
  id: uuid,
  rateRequestId: uuid,
  status: LoadStatus,
  equipment: EquipmentType,
  originCity: z.string(),
  originState: z.string(),
  destinationCity: z.string(),
  destinationState: z.string(),
  weightLbs: z.number().int().positive(),
  pickupDate: z.string(),
  commodity: z.string().nullable(),
  createdAt: z.string(),
});
export type Load = z.infer<typeof Load>;

export const Carrier = z.object({
  id: uuid,
  name: z.string().min(1),
  mcNumber: z.string().min(1),
  dotNumber: z.string().min(1),
  equipment: z.array(EquipmentType).min(1),
  insuranceStatus: InsuranceStatus,
  authorityStatus: AuthorityStatus,
  safetyRating: SafetyRating,
  serviceStates: z.array(UsState).min(1),
});
export type Carrier = z.infer<typeof Carrier>;

export const LaneRate = z.object({
  id: uuid,
  originCity: z.string().min(1),
  originState: UsState,
  destinationCity: z.string().min(1),
  destinationState: UsState,
  equipment: EquipmentType,
  mileage: z.number().int().positive(),
  ratePerMileCents: z.number().int().positive(),
  fuelSurchargePerMileCents: z.number().int().nonnegative(),
  marginBps: z.number().int().nonnegative(),
});
export type LaneRate = z.infer<typeof LaneRate>;

export const Quote = z.object({
  id: uuid,
  loadId: uuid,
  runId: uuid,
  carrierId: uuid.nullable(),
  linehaulCents: z.number().int().nonnegative(),
  fuelSurchargeCents: z.number().int().nonnegative(),
  marginCents: z.number().int().nonnegative(),
  allInCents: z.number().int().positive(),
  currency: z.literal("USD"),
  approvalStatus: ApprovalStatus,
  editedAllInCents: z.number().int().positive().nullable(),
  validUntil: z.string(),
  reasoning: z.string(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Quote = z.infer<typeof Quote>;

export const Decision = z.object({
  id: uuid,
  runId: uuid,
  stepName: OperatorStepName,
  toolName: z.string().nullable(),
  inputs: z.unknown(),
  reasoning: z.string(),
  outcome: z.unknown(),
  attempt: z.number().int().positive(),
  createdAt: z.string(),
});
export type Decision = z.infer<typeof Decision>;

export const OperatorStep = z.object({
  id: uuid,
  runId: uuid,
  name: OperatorStepName,
  status: StepStatus,
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OperatorStep = z.infer<typeof OperatorStep>;

export const RunSummary = z.object({
  id: uuid,
  status: RunStatus,
  model: z.string(),
  rawText: z.string(),
  createdAt: z.string(),
  currentStep: OperatorStepName.nullable(),
  lastError: z.string().nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  equipment: EquipmentType.nullable(),
  weightLbs: z.number().int().nullable(),
  allInCents: z.number().int().nullable(),
  approvalStatus: ApprovalStatus.nullable(),
  sentAt: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const RunDetail = RunSummary.extend({
  steps: z.array(OperatorStep),
  decisions: z.array(Decision),
  quote: Quote.nullable(),
  carrier: Carrier.nullable(),
  load: Load.nullable(),
});
export type RunDetail = z.infer<typeof RunDetail>;

export const ApprovalQueueItem = RunSummary.extend({
  quote: Quote.nullable(),
  carrierName: z.string().nullable(),
  carrierMcNumber: z.string().nullable(),
});
export type ApprovalQueueItem = z.infer<typeof ApprovalQueueItem>;

export const ApprovalCommand = z.discriminatedUnion("action", [
  z.object({
    runId: uuid,
    action: z.literal("approve"),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    runId: uuid,
    action: z.literal("reject"),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    runId: uuid,
    action: z.literal("edit"),
    editedAllInCents: z.number().int().positive().max(50_000_000),
    note: z.string().trim().max(500).optional(),
  }),
]);
export type ApprovalCommand = z.infer<typeof ApprovalCommand>;

export const SimilarExample = z.object({
  id: uuid,
  rawText: z.string(),
  quoteAllInCents: z.number().int(),
  originState: z.string(),
  destinationState: z.string(),
  equipment: EquipmentType,
  similarity: z.number(),
  source: z.enum(["seed", "human_correction"]),
  notes: z.string().nullable(),
});
export type SimilarExample = z.infer<typeof SimilarExample>;

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
