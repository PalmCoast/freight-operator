import { describe, expect, it } from "vitest";
import { SEED_LANES } from "@freight/db";
import { priceLane } from "./pricing";

describe("priceLane", () => {
  it("prices the Chicago to Dallas card at the published all-in", () => {
    const lane = SEED_LANES.find((item) => item.originCity === "Chicago" && item.destinationCity === "Dallas");
    expect(lane).toBeDefined();
    expect(priceLane(lane!)).toEqual({
      linehaulCents: 230000,
      fuelSurchargeCents: 36800,
      marginCents: 26680,
      allInCents: 293480,
    });
  });

  it("rounds flatbed margin to the nearest cent", () => {
    const lane = SEED_LANES.find(
      (item) => item.originCity === "Dallas" && item.equipment === "flatbed",
    );
    expect(priceLane(lane!).allInCents).toBe(263827);
  });
});
