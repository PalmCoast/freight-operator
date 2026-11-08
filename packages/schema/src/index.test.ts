import { describe, expect, it } from "vitest";
import {
  ApprovalCommand,
  ApprovalStatus,
  ParsedRateRequest,
  Quote,
  formatUsd,
  formatZodError,
  isIsoDate,
} from "./index";

describe("schema contracts", () => {
  it("accepts a parsed rate request and rejects a bad date", () => {
    const parsed = ParsedRateRequest.parse({
      equipment: "dry_van",
      originCity: "Chicago",
      originState: "IL",
      destinationCity: "Dallas",
      destinationState: "TX",
      weightLbs: 42000,
      pickupDate: "2026-11-10",
    });
    expect(parsed.originState).toBe("IL");
    expect(isIsoDate("2026-02-31")).toBe(false);
    const bad = ParsedRateRequest.safeParse({
      ...parsed,
      pickupDate: "2026-02-31",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(formatZodError(bad.error)).toMatch(/pickupDate/);
    }
  });

  it("rejects an overweight trailer at the schema boundary", () => {
    const result = ParsedRateRequest.safeParse({
      equipment: "dry_van",
      originCity: "Chicago",
      originState: "IL",
      destinationCity: "Dallas",
      destinationState: "TX",
      weightLbs: 90_000,
      pickupDate: "2026-11-10",
    });
    expect(result.success).toBe(false);
  });

  it("models approval as pending until a human acts", () => {
    expect(ApprovalStatus.options).toEqual([
      "pending",
      "approved",
      "rejected",
      "edited",
    ]);
    const edit = ApprovalCommand.parse({
      runId: "11111111-1111-4111-8111-111111111111",
      action: "edit",
      editedAllInCents: 280000,
      note: "Shipper cap",
    });
    expect(edit.action).toBe("edit");
    expect(
      ApprovalCommand.safeParse({
        runId: "11111111-1111-4111-8111-111111111111",
        action: "edit",
        editedAllInCents: -1,
      }).success,
    ).toBe(false);
  });

  it("round-trips a quote and formats money from integer cents", () => {
    const quote = Quote.parse({
      id: "22222222-2222-4222-8222-222222222222",
      loadId: "33333333-3333-4333-8333-333333333333",
      runId: "44444444-4444-4444-8444-444444444444",
      carrierId: null,
      linehaulCents: 230000,
      fuelSurchargeCents: 36800,
      marginCents: 26680,
      allInCents: 293480,
      currency: "USD",
      approvalStatus: "pending",
      editedAllInCents: null,
      validUntil: "2026-11-10",
      reasoning: "Rate card.",
      sentAt: null,
      createdAt: "2026-11-09T15:00:00.000Z",
    });
    expect(quote.currency).toBe("USD");
    expect(formatUsd(293480)).toBe("$2,934.80");
  });
});
