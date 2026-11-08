import { Carrier } from "@freight/schema";
import { SEED_CARRIERS } from "@freight/db";
import { describe, expect, it } from "vitest";
import { chooseCarrier } from "./eligibility";

const roster = SEED_CARRIERS.map((carrier) => Carrier.parse(carrier));

describe("chooseCarrier", () => {
  it("prefers a satisfactory carrier and skips expired insurance", () => {
    const choice = chooseCarrier(roster, "dry_van", "IL", "TX");
    expect(choice.selected?.name).toBe("Northwind Transport");
    const redMesa = choice.considered.find((item) => item.name === "Red Mesa Logistics");
    const milemarker = choice.considered.find((item) => item.name === "Milemarker Freight");
    expect(redMesa?.eligible).toBe(false);
    expect(redMesa?.reason).toMatch(/Insurance/);
    expect(milemarker?.eligible).toBe(true);
  });

  it("refuses a carrier whose authority is still pending", () => {
    const choice = chooseCarrier(roster, "dry_van", "TN", "OH");
    expect(choice.selected?.name).toBe("Northwind Transport");
    expect(
      choice.considered.find((item) => item.name === "Cinder Haul")?.eligible,
    ).toBe(false);
  });

  it("picks the reefer carrier that actually covers the lane", () => {
    const choice = chooseCarrier(roster, "reefer", "GA", "FL");
    expect(choice.selected?.mcNumber).toBe("MC-100204");
  });
});
