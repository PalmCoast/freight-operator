import { pool, runMigrations, seed } from "../packages/db/src/index";
import { advanceRun, startRun } from "../packages/operator/src/index";
import { EVAL_NOW, FIXTURES } from "./fixtures";
import { deltaPct, formatScorecard, scorecardPasses, withinBand, type CaseScore } from "./score";

delete process.env.OPENAI_API_KEY;
process.env.OPERATOR_FORCE_MOCK = "1";

function sameParse(
  fixture: (typeof FIXTURES)[number],
  detail: {
    equipment: string | null;
    originCity: string | null;
    originState: string | null;
    destinationCity: string | null;
    destinationState: string | null;
    weightLbs: number | null;
    load: { pickupDate: string; commodity: string | null } | null;
  },
): boolean {
  return (
    detail.equipment === fixture.equipment &&
    detail.originCity === fixture.originCity &&
    detail.originState === fixture.originState &&
    detail.destinationCity === fixture.destinationCity &&
    detail.destinationState === fixture.destinationState &&
    detail.weightLbs === fixture.weightLbs &&
    detail.load?.pickupDate === fixture.pickupDate &&
    (fixture.commodity ? detail.load?.commodity === fixture.commodity : true)
  );
}

async function main(): Promise<void> {
  await runMigrations();
  await seed();
  const now = new Date(EVAL_NOW);
  const cases: CaseScore[] = [];

  for (const fixture of FIXTURES) {
    const started = await startRun(fixture.rawText);
    const detail = await advanceRun(started.id, "eval", now);
    const actual = detail.quote?.allInCents ?? null;
    const parseOk = sameParse(fixture, detail);
    const quoteOk = actual !== null && withinBand(actual, fixture.expertAllInCents);
    const gateOk =
      detail.status === "waiting_approval" &&
      detail.quote?.sentAt == null &&
      detail.quote?.approvalStatus === "pending" &&
      !detail.decisions.some((decision) => decision.stepName === "finalize");
    const problems: string[] = [];
    if (!parseOk) problems.push(`parsed as ${detail.originCity ?? "?"} → ${detail.destinationCity ?? "?"}`);
    if (!quoteOk) problems.push(`quote ${actual ?? "none"}`);
    if (!gateOk) problems.push(`status ${detail.status}, sentAt ${detail.quote?.sentAt ?? "null"}`);
    cases.push({
      id: fixture.id,
      lane: `${fixture.originCity} ${fixture.originState} → ${fixture.destinationCity}`,
      parseOk,
      quoteOk,
      gateOk,
      actualCents: actual,
      expectedCents: fixture.expertAllInCents,
      deltaPct: actual === null ? null : deltaPct(actual, fixture.expertAllInCents),
      status: detail.status,
      detail: problems.join("; ") || detail.lastError || "",
    });
  }

  console.log(formatScorecard(cases));
  if (!scorecardPasses(cases)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
