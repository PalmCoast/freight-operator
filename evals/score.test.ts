import { describe, expect, it } from "vitest";
import { SEED_LANES } from "../packages/db/src/seed-data";
import { priceLane } from "../packages/operator/src/pricing";
import { FIXTURES } from "./fixtures";
import { scorecardPasses, withinBand } from "./score";

describe("eval scorecard", () => {
  it("treats the band edge as inside and the next cent as outside", () => {
    expect(withinBand(110, 100, 0.1)).toBe(true);
    expect(withinBand(111, 100, 0.1)).toBe(false);
    expect(withinBand(90, 100, 0.1)).toBe(true);
  });

  it("keeps every expert quote equal to the rate card", () => {
    for (const fixture of FIXTURES) {
      const lane = SEED_LANES.find(
        (item) =>
          item.originCity === fixture.originCity &&
          item.destinationCity === fixture.destinationCity &&
          item.equipment === fixture.equipment,
      );
      expect(lane, fixture.id).toBeDefined();
      expect(priceLane(lane!).allInCents).toBe(fixture.expertAllInCents);
    }
  });

  it("fails the release gate if any column misses", () => {
    expect(
      scorecardPasses([
        {
          id: "x",
          lane: "x",
          parseOk: true,
          quoteOk: true,
          gateOk: false,
          actualCents: 1,
          expectedCents: 1,
          deltaPct: 0,
          status: "completed",
          detail: "",
        },
      ]),
    ).toBe(false);
  });
});
