import { QUOTE_BAND } from "./fixtures";

export type CaseScore = {
  id: string;
  lane: string;
  parseOk: boolean;
  quoteOk: boolean;
  gateOk: boolean;
  actualCents: number | null;
  expectedCents: number;
  deltaPct: number | null;
  status: string;
  detail: string;
};

export function withinBand(
  actual: number,
  expected: number,
  band = QUOTE_BAND,
): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / expected <= band + 1e-12;
}

export function deltaPct(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Infinity;
  return (Math.abs(actual - expected) / expected) * 100;
}

export function scorecardPasses(cases: CaseScore[]): boolean {
  return cases.every((item) => item.parseOk && item.quoteOk && item.gateOk);
}

export function formatScorecard(cases: CaseScore[]): string {
  const header = [
    "id".padEnd(10),
    "lane".padEnd(36),
    "parse".padEnd(6),
    "quote".padEnd(8),
    "gate".padEnd(6),
    "actual".padEnd(12),
    "expert".padEnd(12),
    "delta",
  ].join(" ");
  const lines = cases.map((item) => {
    const delta =
      item.deltaPct === null ? "—" : `${item.deltaPct.toFixed(1)}%`;
    return [
      item.id.padEnd(10),
      item.lane.padEnd(36),
      (item.parseOk ? "pass" : "FAIL").padEnd(6),
      (item.quoteOk ? "pass" : "FAIL").padEnd(8),
      (item.gateOk ? "held" : "FAIL").padEnd(6),
      (item.actualCents === null ? "—" : String(item.actualCents)).padEnd(12),
      String(item.expectedCents).padEnd(12),
      delta,
    ].join(" ");
  });
  const parseHits = cases.filter((item) => item.parseOk).length;
  const quoteHits = cases.filter((item) => item.quoteOk).length;
  const gateHits = cases.filter((item) => item.gateOk).length;
  const total = cases.length;
  const notes = cases
    .filter((item) => !item.parseOk || !item.quoteOk || !item.gateOk)
    .map((item) => `  ${item.id}: ${item.detail}`);
  return [
    header,
    ...lines,
    "",
    `Parse accuracy:        ${parseHits}/${total}`,
    `Quotes within ${Math.round(QUOTE_BAND * 100)}%:     ${quoteHits}/${total}`,
    `Approval gate respected: ${gateHits}/${total}`,
    ...(notes.length ? ["", ...notes] : []),
    "",
    scorecardPasses(cases) ? "PASS" : "FAIL",
  ].join("\n");
}
