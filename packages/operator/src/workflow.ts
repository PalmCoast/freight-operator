import {
  approvals,
  carriers,
  db,
  decisions,
  embedCase,
  expertExamples,
  loads,
  operatorRuns,
  operatorSteps,
  quotes,
  rateRequests,
} from "@freight/db";
import {
  ApprovalCommand,
  ApprovalQueueItem,
  Carrier,
  EquipmentType,
  Load,
  OPERATOR_STEP_ORDER,
  OperatorStepName,
  Quote,
  RunDetail,
  RunSummary,
  formatUsd,
  type ApprovalCommand as ApprovalCommandInput,
  type Decision,
  type OperatorStep,
  type OperatorStepName as StepName,
  type RunStatus,
} from "@freight/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { ZodType } from "zod";
import { ModelOutputError, StepFailed } from "./errors";
import { activeProvider, buildToolPrompt, getLanguageModel, runTool } from "./model";
import {
  CheckCarrierInput,
  CheckCarrierOutput,
  DraftQuoteInput,
  DraftQuoteOutput,
  LookupLaneRateInput,
  LookupLaneRateOutput,
  ParseRateRequestInput,
  ParseRateRequestOutput,
  checkCarrier,
  draftQuote,
  lookupLaneRate,
  parseRateRequest,
} from "./tools";

const LOCK_MS = 30_000;

type RunRow = typeof operatorRuns.$inferSelect;
type StepRow = typeof operatorSteps.$inferSelect;
type QuoteRow = typeof quotes.$inferSelect;
type ApprovalRow = typeof approvals.$inferSelect;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function asRunStatus(value: string): RunStatus {
  return RunSummary.shape.status.parse(value);
}

function asStepName(value: string | null): StepName | null {
  if (!value) return null;
  return OperatorStepName.parse(value);
}

async function recordDecision(input: {
  runId: string;
  stepName: StepName;
  toolName: string | null;
  inputs: unknown;
  reasoning: string;
  outcome: unknown;
  attempt: number;
}): Promise<void> {
  await db.insert(decisions).values({
    runId: input.runId,
    stepName: input.stepName,
    toolName: input.toolName,
    inputs: input.inputs ?? { error: "No inputs were captured." },
    reasoning: input.reasoning,
    outcome: input.outcome,
    attempt: input.attempt,
  });
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const runs = await db
    .select()
    .from(operatorRuns)
    .where(eq(operatorRuns.id, runId))
    .limit(1);
  const run = runs[0];
  if (!run) return null;

  const requests = await db
    .select()
    .from(rateRequests)
    .where(eq(rateRequests.id, run.rateRequestId))
    .limit(1);
  const request = requests[0];
  if (!request) return null;

  const stepRows = await db
    .select()
    .from(operatorSteps)
    .where(eq(operatorSteps.runId, runId));
  const decisionRows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.runId, runId))
    .orderBy(asc(decisions.createdAt));
  const quoteRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.runId, runId))
    .limit(1);
  const loadRows = await db
    .select()
    .from(loads)
    .where(eq(loads.rateRequestId, request.id))
    .limit(1);
  const quoteRow = quoteRows[0] ?? null;
  const carrierRows = quoteRow?.carrierId
    ? await db
        .select()
        .from(carriers)
        .where(eq(carriers.id, quoteRow.carrierId))
        .limit(1)
    : [];

  const steps: OperatorStep[] = OPERATOR_STEP_ORDER.flatMap((name) => {
    const row = stepRows.find((item) => item.name === name);
    if (!row) return [];
    return [
      {
        id: row.id,
        runId: row.runId,
        name,
        status: row.status as OperatorStep["status"],
        input: row.input,
        output: row.output,
        error: row.error,
        attempts: row.attempts,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    ];
  });

  const decisionList: Decision[] = decisionRows.flatMap((row) => {
    const stepName = OperatorStepName.safeParse(row.stepName);
    if (!stepName.success) return [];
    return [
      {
        id: row.id,
        runId: row.runId,
        stepName: stepName.data,
        toolName: row.toolName,
        inputs: row.inputs,
        reasoning: row.reasoning,
        outcome: row.outcome,
        attempt: row.attempt,
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });

  const quote = quoteRow ? toQuote(quoteRow) : null;
  const carrier = carrierRows[0] ? Carrier.parse(carrierRows[0]) : null;
  const load = loadRows[0] ? toLoad(loadRows[0]) : null;
  const equipment = request.equipment
    ? EquipmentType.parse(request.equipment)
    : null;

  return RunDetail.parse({
    id: run.id,
    status: asRunStatus(run.status),
    model: run.model,
    rawText: request.rawText,
    createdAt: run.createdAt.toISOString(),
    currentStep: asStepName(run.currentStep),
    lastError: run.lastError,
    originCity: request.originCity,
    originState: request.originState,
    destinationCity: request.destinationCity,
    destinationState: request.destinationState,
    equipment,
    weightLbs: request.weightLbs,
    allInCents: quote?.allInCents ?? null,
    approvalStatus: quote?.approvalStatus ?? null,
    sentAt: quote?.sentAt ?? null,
    steps,
    decisions: decisionList,
    quote,
    carrier,
    load,
  });
}

function toQuote(row: QuoteRow): Quote {
  return Quote.parse({
    id: row.id,
    loadId: row.loadId,
    runId: row.runId,
    carrierId: row.carrierId,
    linehaulCents: row.linehaulCents,
    fuelSurchargeCents: row.fuelSurchargeCents,
    marginCents: row.marginCents,
    allInCents: row.allInCents,
    currency: "USD",
    approvalStatus: row.approvalStatus,
    editedAllInCents: row.editedAllInCents,
    validUntil: row.validUntil,
    reasoning: row.reasoning,
    sentAt: iso(row.sentAt),
    createdAt: row.createdAt.toISOString(),
  });
}

function toLoad(row: typeof loads.$inferSelect): Load {
  return Load.parse({
    id: row.id,
    rateRequestId: row.rateRequestId,
    status: row.status,
    equipment: row.equipment,
    originCity: row.originCity,
    originState: row.originState,
    destinationCity: row.destinationCity,
    destinationState: row.destinationState,
    weightLbs: row.weightLbs,
    pickupDate: row.pickupDate,
    commodity: row.commodity,
    createdAt: row.createdAt.toISOString(),
  });
}

function toSummary(
  run: RunRow,
  request: typeof rateRequests.$inferSelect,
  quote: QuoteRow | null,
): RunSummary {
  return RunSummary.parse({
    id: run.id,
    status: asRunStatus(run.status),
    model: run.model,
    rawText: request.rawText,
    createdAt: run.createdAt.toISOString(),
    currentStep: asStepName(run.currentStep),
    lastError: run.lastError,
    originCity: request.originCity,
    originState: request.originState,
    destinationCity: request.destinationCity,
    destinationState: request.destinationState,
    equipment: request.equipment ? EquipmentType.parse(request.equipment) : null,
    weightLbs: request.weightLbs,
    allInCents: quote?.allInCents ?? null,
    approvalStatus: quote
      ? Quote.shape.approvalStatus.parse(quote.approvalStatus)
      : null,
    sentAt: iso(quote?.sentAt),
  });
}

export async function listRuns(): Promise<RunSummary[]> {
  const rows = await db
    .select({
      run: operatorRuns,
      request: rateRequests,
      quote: quotes,
    })
    .from(operatorRuns)
    .innerJoin(rateRequests, eq(rateRequests.id, operatorRuns.rateRequestId))
    .leftJoin(quotes, eq(quotes.runId, operatorRuns.id))
    .orderBy(desc(operatorRuns.createdAt))
    .limit(50);
  return rows.map((row) => toSummary(row.run, row.request, row.quote));
}

export async function listApprovalQueue(): Promise<ApprovalQueueItem[]> {
  const rows = await db
    .select({
      run: operatorRuns,
      request: rateRequests,
      quote: quotes,
      carrier: carriers,
    })
    .from(operatorRuns)
    .innerJoin(rateRequests, eq(rateRequests.id, operatorRuns.rateRequestId))
    .leftJoin(quotes, eq(quotes.runId, operatorRuns.id))
    .leftJoin(carriers, eq(carriers.id, quotes.carrierId))
    .where(eq(operatorRuns.status, "waiting_approval"))
    .orderBy(asc(operatorRuns.createdAt));
  return rows.map((row) =>
    ApprovalQueueItem.parse({
      ...toSummary(row.run, row.request, row.quote),
      quote: row.quote ? toQuote(row.quote) : null,
      carrierName: row.carrier?.name ?? null,
      carrierMcNumber: row.carrier?.mcNumber ?? null,
    }),
  );
}

export async function startRun(rawText: string): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const insertedRequests = await tx
      .insert(rateRequests)
      .values({ rawText })
      .returning();
    const request = insertedRequests[0];
    if (!request) throw new Error("Could not store the rate request.");
    const insertedRuns = await tx
      .insert(operatorRuns)
      .values({
        rateRequestId: request.id,
        status: "pending",
        model: activeProvider(),
        currentStep: "parse_request",
      })
      .returning();
    const run = insertedRuns[0];
    if (!run) throw new Error("Could not start the operator run.");
    await tx.insert(operatorSteps).values(
      OPERATOR_STEP_ORDER.map((name) => ({
        runId: run.id,
        name,
        status: "pending",
        idempotencyKey: `${run.id}:${name}`,
        maxAttempts: 3,
      })),
    );
    return { id: run.id };
  });
}

async function acquireLock(runId: string, actor: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(operatorRuns)
      .where(eq(operatorRuns.id, runId))
      .for("update");
    const run = rows[0];
    if (!run) return false;
    if (
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "rejected" ||
      run.status === "waiting_approval"
    ) {
      return false;
    }
    const stale =
      !run.lockedAt || run.lockedAt.getTime() < Date.now() - LOCK_MS;
    if (run.lockedBy && run.lockedBy !== actor && !stale) return false;
    await tx
      .update(operatorRuns)
      .set({
        lockedBy: actor,
        lockedAt: new Date(),
        status: run.status === "pending" ? "running" : run.status,
        updatedAt: new Date(),
      })
      .where(eq(operatorRuns.id, runId));
    return true;
  });
}

async function releaseLock(runId: string, actor: string): Promise<void> {
  await db
    .update(operatorRuns)
    .set({ lockedBy: null, lockedAt: null, updatedAt: new Date() })
    .where(and(eq(operatorRuns.id, runId), eq(operatorRuns.lockedBy, actor)));
}

async function loadBundle(runId: string): Promise<{
  run: RunRow;
  request: typeof rateRequests.$inferSelect;
  steps: StepRow[];
  quote: QuoteRow | null;
  approval: ApprovalRow | null;
} | null> {
  const runs = await db
    .select()
    .from(operatorRuns)
    .where(eq(operatorRuns.id, runId))
    .limit(1);
  const run = runs[0];
  if (!run) return null;
  const requests = await db
    .select()
    .from(rateRequests)
    .where(eq(rateRequests.id, run.rateRequestId))
    .limit(1);
  const request = requests[0];
  if (!request) return null;
  const steps = await db
    .select()
    .from(operatorSteps)
    .where(eq(operatorSteps.runId, runId));
  const quoteRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.runId, runId))
    .limit(1);
  const approvalRows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.runId, runId))
    .limit(1);
  return {
    run,
    request,
    steps,
    quote: quoteRows[0] ?? null,
    approval: approvalRows[0] ?? null,
  };
}

function nextStep(steps: StepRow[]): StepRow | null {
  for (const name of OPERATOR_STEP_ORDER) {
    const step = steps.find((item) => item.name === name);
    if (!step) return null;
    if (step.status === "succeeded") continue;
    return step;
  }
  return null;
}

async function markRun(
  runId: string,
  patch: Partial<typeof operatorRuns.$inferInsert>,
): Promise<void> {
  await db
    .update(operatorRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(operatorRuns.id, runId));
}

async function markStep(
  stepId: string,
  patch: Partial<typeof operatorSteps.$inferInsert>,
): Promise<void> {
  await db
    .update(operatorSteps)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(operatorSteps.id, stepId));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function failStep(input: {
  runId: string;
  step: StepRow;
  error: unknown;
}): Promise<void> {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  const retryable =
    !(input.error instanceof ModelOutputError) &&
    !(input.error instanceof StepFailed && !input.error.retryable) &&
    (input.error instanceof StepFailed ? input.error.retryable : true);
  const fresh = await db
    .select()
    .from(operatorSteps)
    .where(eq(operatorSteps.id, input.step.id))
    .limit(1);
  const attempts = fresh[0]?.attempts ?? input.step.attempts;
  const giveUp = !retryable || attempts >= input.step.maxAttempts;
  await markStep(input.step.id, {
    status: giveUp ? "failed" : "pending",
    error: message,
  });
  await markRun(input.runId, {
    status: giveUp ? "failed" : "running",
    lastError: message,
    currentStep: input.step.name,
  });
  await recordDecision({
    runId: input.runId,
    stepName: OperatorStepName.parse(input.step.name),
    toolName: null,
    inputs: input.step.input,
    reasoning: message,
    outcome: { error: message, retryable, attempts },
    attempt: Math.max(attempts, 1),
  });
}

async function runModelStep<TIn, TOut>(input: {
  toolName: string;
  description: string;
  instructions: string;
  context: unknown;
  inputSchema: ZodType<TIn>;
  outputSchema: ZodType<TOut>;
  execute: (value: TIn) => Promise<unknown>;
}): Promise<{ input: TIn; output: TOut; attempts: number }> {
  return runTool({
    model: getLanguageModel(),
    toolName: input.toolName,
    description: input.description,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    prompt: buildToolPrompt({
      toolName: input.toolName,
      instructions: input.instructions,
      context: input.context,
    }),
    execute: input.execute,
  });
}

export async function advanceRun(
  runId: string,
  actor = "api",
  now = new Date(),
): Promise<RunDetail> {
  const locked = await acquireLock(runId, actor);
  if (!locked) {
    const current = await getRunDetail(runId);
    if (!current) throw new Error(`Run ${runId} was not found.`);
    return current;
  }

  try {
    for (let guard = 0; guard < OPERATOR_STEP_ORDER.length + 1; guard += 1) {
      const bundle = await loadBundle(runId);
      if (!bundle) throw new Error(`Run ${runId} was not found.`);
      if (
        bundle.run.status === "completed" ||
        bundle.run.status === "failed" ||
        bundle.run.status === "rejected"
      ) {
        break;
      }
      const step = nextStep(bundle.steps);
      if (!step) {
        await markRun(runId, { status: "completed", currentStep: null, lastError: null });
        break;
      }
      const stepName = OperatorStepName.parse(step.name);
      if (stepName === "await_approval") {
        if (!bundle.approval) {
          if (step.status !== "waiting") {
            await recordDecision({
              runId,
              stepName,
              toolName: null,
              inputs: {
                quoteId: bundle.quote?.id ?? null,
                allInCents: bundle.quote?.allInCents ?? null,
              },
              reasoning:
                "The quote is on the desk. Nothing is marked sent until a human approves, rejects, or edits it.",
              outcome: { status: "waiting" },
              attempt: Math.max(step.attempts, 1),
            });
          }
          await markStep(step.id, { status: "waiting", error: null });
          await markRun(runId, {
            status: "waiting_approval",
            currentStep: stepName,
            lastError: null,
          });
          break;
        }
        const approval = bundle.approval;
        await markStep(step.id, {
          status: "succeeded",
          output: {
            status: approval.status,
            editedAllInCents: approval.editedAllInCents,
            note: approval.note,
          },
          error: null,
        });
        await recordDecision({
          runId,
          stepName,
          toolName: null,
          inputs: {
            status: approval.status,
            editedAllInCents: approval.editedAllInCents,
            note: approval.note,
          },
          reasoning: approvalReason(approval, bundle.quote),
          outcome: { status: approval.status },
          attempt: step.attempts + 1,
        });
        continue;
      }

      try {
        await markRun(runId, { status: "running", currentStep: stepName, lastError: null });
        await markStep(step.id, {
          status: "running",
          attempts: step.attempts + 1,
          error: null,
        });
        await executeStep({ bundle, step, stepName, now, attempt: step.attempts + 1 });
      } catch (error) {
        await failStep({ runId, step, error });
        break;
      }
    }
  } finally {
    await releaseLock(runId, actor);
  }

  const detail = await getRunDetail(runId);
  if (!detail) throw new Error(`Run ${runId} was not found.`);
  return detail;
}

function approvalReason(approval: ApprovalRow, quote: QuoteRow | null): string {
  const note = approval.note ? ` Note: ${approval.note}` : "";
  if (approval.status === "rejected") {
    return `Desk rejected the quote.${note}`;
  }
  if (approval.status === "edited" && approval.editedAllInCents && quote) {
    return `Desk edited the all-in from ${formatUsd(quote.allInCents)} to ${formatUsd(approval.editedAllInCents)}.${note}`;
  }
  return `Desk approved the quote.${note}`;
}

async function executeStep(input: {
  bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>;
  step: StepRow;
  stepName: StepName;
  now: Date;
  attempt: number;
}): Promise<void> {
  const { bundle, step, stepName, now, attempt } = input;
  if (stepName === "parse_request") {
    const context = { now: now.toISOString(), rawText: bundle.request.rawText };
    const result = await runModelStep({
      toolName: "parseRateRequest",
      description:
        "Extract a structured freight rate request from a broker email.",
      instructions:
        "Read the email in CONTEXT_JSON.rawText and call parseRateRequest with the lane, equipment, weight, and pickup date.",
      context,
      inputSchema: ParseRateRequestInput,
      outputSchema: ParseRateRequestOutput,
      execute: async (value) => parseRateRequest(value),
    });
    const parsed = result.output;
    await db
      .update(rateRequests)
      .set({
        equipment: parsed.equipment,
        originCity: parsed.originCity,
        originState: parsed.originState,
        destinationCity: parsed.destinationCity,
        destinationState: parsed.destinationState,
        weightLbs: parsed.weightLbs,
        pickupDate: parsed.pickupDate,
        commodity: parsed.commodity ?? null,
      })
      .where(eq(rateRequests.id, bundle.request.id));
    await db
      .insert(loads)
      .values({
        rateRequestId: bundle.request.id,
        status: "quoting",
        equipment: parsed.equipment,
        originCity: parsed.originCity,
        originState: parsed.originState,
        destinationCity: parsed.destinationCity,
        destinationState: parsed.destinationState,
        weightLbs: parsed.weightLbs,
        pickupDate: parsed.pickupDate,
        commodity: parsed.commodity ?? null,
      })
      .onConflictDoNothing({ target: loads.rateRequestId });
    await markStep(step.id, { status: "succeeded", input: context, output: parsed, error: null });
    await recordDecision({
      runId: bundle.run.id,
      stepName,
      toolName: "parseRateRequest",
      inputs: result.input,
      reasoning: parsed.reasoning,
      outcome: parsed,
      attempt,
    });
    return;
  }

  if (stepName === "lookup_lane") {
    const parsed = ParseRateRequestOutput.parse(outputOf(bundle.steps, "parse_request"));
    const context = { now: now.toISOString(), rawText: bundle.request.rawText, parsed };
    const result = await runModelStep({
      toolName: "lookupLaneRate",
      description: "Look up the contracted rate card for a lane and equipment type.",
      instructions: "Call lookupLaneRate with the parsed lane. Do not invent a rate.",
      context,
      inputSchema: LookupLaneRateInput,
      outputSchema: LookupLaneRateOutput,
      execute: async (value) => lookupLaneRate(value),
    });
    if (!result.output.found || !result.output.lane) {
      throw new StepFailed(result.output.reasoning, false);
    }
    await markStep(step.id, {
      status: "succeeded",
      input: context,
      output: result.output,
      error: null,
    });
    await recordDecision({
      runId: bundle.run.id,
      stepName,
      toolName: "lookupLaneRate",
      inputs: result.input,
      reasoning: result.output.reasoning,
      outcome: result.output,
      attempt,
    });
    return;
  }

  if (stepName === "check_carrier") {
    const parsed = ParseRateRequestOutput.parse(outputOf(bundle.steps, "parse_request"));
    const context = { now: now.toISOString(), rawText: bundle.request.rawText, parsed };
    const result = await runModelStep({
      toolName: "checkCarrier",
      description:
        "Choose an eligible carrier for the lane using authority, insurance, and safety.",
      instructions:
        "Call checkCarrier for this equipment and lane. Do not pick a carrier whose insurance or authority is not current.",
      context,
      inputSchema: CheckCarrierInput,
      outputSchema: CheckCarrierOutput,
      execute: async (value) => checkCarrier(value),
    });
    if (!result.output.carrier) {
      throw new StepFailed(result.output.reasoning, false);
    }
    await markStep(step.id, {
      status: "succeeded",
      input: context,
      output: result.output,
      error: null,
    });
    await recordDecision({
      runId: bundle.run.id,
      stepName,
      toolName: "checkCarrier",
      inputs: result.input,
      reasoning: result.output.reasoning,
      outcome: result.output,
      attempt,
    });
    return;
  }

  if (stepName === "draft_quote") {
    const parsed = ParseRateRequestOutput.parse(outputOf(bundle.steps, "parse_request"));
    const laneResult = LookupLaneRateOutput.parse(outputOf(bundle.steps, "lookup_lane"));
    const carrierResult = CheckCarrierOutput.parse(outputOf(bundle.steps, "check_carrier"));
    if (!laneResult.lane || !carrierResult.carrier) {
      throw new StepFailed("Draft quote is missing a lane or a carrier.", false);
    }
    const context = {
      now: now.toISOString(),
      rawText: bundle.request.rawText,
      parsed,
      laneId: laneResult.lane.id,
      carrierId: carrierResult.carrier.id,
      weightLbs: parsed.weightLbs,
      pickupDate: parsed.pickupDate,
    };
    const result = await runModelStep({
      toolName: "draftQuote",
      description:
        "Draft an all-in quote from the rate card. The tool computes the money.",
      instructions:
        "Call draftQuote with the lane id and carrier id from CONTEXT_JSON. Do not invent the price.",
      context,
      inputSchema: DraftQuoteInput,
      outputSchema: DraftQuoteOutput,
      execute: async (value) => draftQuote(value),
    });
    if (!result.output.ok || !result.output.price || !result.output.lane || !result.output.carrier) {
      throw new StepFailed(result.output.reasoning, false);
    }
    const price = result.output.price;
    await db
      .insert(quotes)
      .values({
        loadId: await loadIdFor(bundle.request.id),
        runId: bundle.run.id,
        carrierId: result.output.carrier.id,
        linehaulCents: price.linehaulCents,
        fuelSurchargeCents: price.fuelSurchargeCents,
        marginCents: price.marginCents,
        allInCents: price.allInCents,
        currency: "USD",
        approvalStatus: "pending",
        validUntil: result.output.validUntil ?? parsed.pickupDate,
        reasoning: result.output.reasoning,
      })
      .onConflictDoNothing({ target: quotes.runId });
    await markStep(step.id, {
      status: "succeeded",
      input: context,
      output: result.output,
      error: null,
    });
    await recordDecision({
      runId: bundle.run.id,
      stepName,
      toolName: "draftQuote",
      inputs: result.input,
      reasoning: result.output.reasoning,
      outcome: result.output,
      attempt,
    });
    return;
  }

  if (stepName === "finalize") {
    if (!bundle.approval || !bundle.quote) {
      throw new StepFailed("Finalize ran before a quote was approved.", false);
    }
    const approval = bundle.approval;
    const quote = bundle.quote;
    if (approval.status === "rejected") {
      await db
        .update(quotes)
        .set({ approvalStatus: "rejected" })
        .where(eq(quotes.id, quote.id));
      await db
        .update(loads)
        .set({ status: "cancelled" })
        .where(eq(loads.id, quote.loadId));
      const reasoning = `Rejected. Finalize did not mark the quote sent.${approval.note ? ` ${approval.note}` : ""}`;
      await markStep(step.id, {
        status: "succeeded",
        output: { sent: false, approvalStatus: "rejected" },
        error: null,
      });
      await markRun(bundle.run.id, {
        status: "rejected",
        currentStep: null,
        lastError: null,
      });
      await recordDecision({
        runId: bundle.run.id,
        stepName,
        toolName: null,
        inputs: { approvalStatus: "rejected" },
        reasoning,
        outcome: { sent: false },
        attempt,
      });
      return;
    }

    const sentAt = quote.sentAt ?? new Date();
    await db
      .update(quotes)
      .set({
        approvalStatus: approval.status,
        editedAllInCents: approval.editedAllInCents,
        sentAt,
      })
      .where(eq(quotes.id, quote.id));
    await db
      .update(loads)
      .set({ status: "quoted" })
      .where(eq(loads.id, quote.loadId));
    const amount =
      approval.status === "edited" && approval.editedAllInCents
        ? approval.editedAllInCents
        : quote.allInCents;
    const reasoning =
      approval.status === "edited"
        ? `Sent the edited all-in of ${formatUsd(amount)}. The original rate-card quote was ${formatUsd(quote.allInCents)}. This is a simulated send: the outcome is recorded, and no email is dispatched.`
        : `Sent ${formatUsd(amount)}. This is a simulated send: the outcome is recorded, and no email is dispatched.`;
    await markStep(step.id, {
      status: "succeeded",
      output: { sent: true, amountCents: amount, sentAt: sentAt.toISOString() },
      error: null,
    });
    await markRun(bundle.run.id, {
      status: "completed",
      currentStep: null,
      lastError: null,
    });
    await recordDecision({
      runId: bundle.run.id,
      stepName,
      toolName: null,
      inputs: { approvalStatus: approval.status, amountCents: amount },
      reasoning,
      outcome: { sent: true, amountCents: amount },
      attempt,
    });
    return;
  }
}

function outputOf(steps: StepRow[], name: StepName): unknown {
  const step = steps.find((item) => item.name === name);
  if (!step?.output) {
    throw new StepFailed(`Step ${name} has no output to continue from.`, false);
  }
  return step.output;
}

async function loadIdFor(rateRequestId: string): Promise<string> {
  const rows = await db
    .select()
    .from(loads)
    .where(eq(loads.rateRequestId, rateRequestId))
    .limit(1);
  const load = rows[0];
  if (!load) throw new StepFailed("The load row is missing.", true);
  return load.id;
}

async function saveCorrection(
  detail: RunDetail,
  editedAllInCents: number,
  note: string | undefined,
): Promise<void> {
  if (!detail.originState || !detail.destinationState || !detail.equipment) {
    throw new StepFailed("Cannot save a correction before the request is parsed.", false);
  }
  const marker = `run:${detail.id}`;
  const existing = await db
    .select({ id: expertExamples.id })
    .from(expertExamples)
    .where(like(expertExamples.notes, `${marker}%`))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(expertExamples).values({
    rawText: detail.rawText,
    originState: detail.originState,
    destinationState: detail.destinationState,
    equipment: detail.equipment,
    quoteAllInCents: editedAllInCents,
    notes: [marker, note].filter(Boolean).join(" · "),
    source: "human_correction",
    embedding: embedCase({
      rawText: detail.rawText,
      equipment: detail.equipment,
      originState: detail.originState,
      destinationState: detail.destinationState,
    }),
  });
}

export async function decideApproval(
  command: ApprovalCommandInput,
  actor = "api",
  now = new Date(),
): Promise<RunDetail> {
  const parsed = ApprovalCommand.parse(command);
  const existing = await db
    .select()
    .from(approvals)
    .where(eq(approvals.runId, parsed.runId))
    .limit(1);
  if (existing[0]) return advanceRun(parsed.runId, actor, now);

  const detail = await getRunDetail(parsed.runId);
  if (!detail) throw new Error(`Run ${parsed.runId} was not found.`);
  if (detail.status !== "waiting_approval") {
    throw new StepFailed(
      `Run is ${detail.status}, so there is nothing to approve.`,
      false,
    );
  }
  if (parsed.action === "edit") {
    await saveCorrection(detail, parsed.editedAllInCents, parsed.note);
  }
  const status =
    parsed.action === "approve"
      ? "approved"
      : parsed.action === "reject"
        ? "rejected"
        : "edited";
  try {
    await db.insert(approvals).values({
      runId: parsed.runId,
      status,
      editedAllInCents: parsed.action === "edit" ? parsed.editedAllInCents : null,
      note: parsed.note ?? null,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  await db
    .update(operatorRuns)
    .set({ status: "running", updatedAt: new Date(), lockedBy: null, lockedAt: null })
    .where(eq(operatorRuns.id, parsed.runId));
  return advanceRun(parsed.runId, actor, now);
}

export async function pollOnce(workerId: string, now = new Date()): Promise<boolean> {
  const claimed = await db.transaction(async (tx) => {
    const staleBefore = new Date(Date.now() - LOCK_MS);
    const rows = await tx
      .select()
      .from(operatorRuns)
      .where(
        and(
          inArray(operatorRuns.status, ["pending", "running"]),
          or(
            isNull(operatorRuns.lockedBy),
            eq(operatorRuns.lockedBy, workerId),
            lt(operatorRuns.lockedAt, staleBefore),
          ),
        ),
      )
      .orderBy(asc(operatorRuns.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    const run = rows[0];
    if (!run) return null;
    await tx
      .update(operatorRuns)
      .set({
        lockedBy: workerId,
        lockedAt: new Date(),
        status: "running",
        updatedAt: new Date(),
      })
      .where(eq(operatorRuns.id, run.id));
    return run.id;
  });
  if (!claimed) return false;
  await advanceRun(claimed, workerId, now);
  return true;
}

export async function countCorrections(runId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expertExamples)
    .where(like(expertExamples.notes, `run:${runId}%`));
  return Number(rows[0]?.count ?? 0);
}
