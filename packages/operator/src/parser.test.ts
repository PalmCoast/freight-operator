import { describe, expect, it } from "vitest";
import { parseRateRequestText } from "./parser";

const NOW = new Date("2026-11-09T15:00:00.000Z");

describe("parseRateRequestText", () => {
  it("reads the broker shorthand the desk actually receives", () => {
    const result = parseRateRequestText(
      "Need a quote, dry van, Chicago IL to Dallas TX, 42,000 lbs, pickup 2026-11-10",
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        equipment: "dry_van",
        originCity: "Chicago",
        originState: "IL",
        destinationCity: "Dallas",
        destinationState: "TX",
        weightLbs: 42000,
        pickupDate: "2026-11-10",
      },
    });
  });

  it("reads a reefer email with a commodity and a comma-separated lane", () => {
    const result = parseRateRequestText(
      "Reefer please. Atlanta, GA to Miami, FL. Weight 38,000 pounds. Pickup on 2026-11-12. Commodity: frozen poultry.",
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        equipment: "reefer",
        originCity: "Atlanta",
        originState: "GA",
        destinationCity: "Miami",
        destinationState: "FL",
        weightLbs: 38000,
        pickupDate: "2026-11-12",
        commodity: "frozen poultry",
      });
    }
  });

  it("resolves pickup Tuesday against the injected clock", () => {
    const result = parseRateRequestText(
      "Can you rate a dry van Los Angeles CA to Phoenix AZ, 44000 lbs, pickup Tuesday",
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.originCity).toBe("Los Angeles");
      expect(result.value.pickupDate).toBe("2026-11-10");
      expect(result.value.weightLbs).toBe(44000);
    }
  });

  it("keeps flatbed distinct from dry van", () => {
    const result = parseRateRequestText(
      "Flatbed, Dallas TX to Atlanta GA, 46,000 lbs, pickup 2026-11-18. Commodity: steel coil.",
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.equipment).toBe("flatbed");
      expect(result.value.commodity).toBe("steel coil");
    }
  });

  it("rejects an email that is not a rate request", () => {
    const result = parseRateRequestText("hello, can you call me back?", NOW);
    expect(result.ok).toBe(false);
  });
});
