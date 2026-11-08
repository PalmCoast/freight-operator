import { describe, expect, it } from "vitest";
import {
  advanceRun,
  countCorrections,
  decideApproval,
  startRun,
} from "./workflow";

const NOW = new Date("2026-11-09T15:00:00.000Z");
const CHICAGO =
  "Need a quote, dry van, Chicago IL to Dallas TX, 42,000 lbs, pickup 2026-11-10";

async function hold(rawText: string) {
  const started = await startRun(rawText);
  return advanceRun(started.id, "test", NOW);
}

describe("operator workflow", () => {
  it("prices the lane, holds for a human, and does not send", async () => {
    const detail = await hold(CHICAGO);
    expect(detail.status).toBe("waiting_approval");
    expect(detail.quote?.sentAt).toBeNull();
    expect(detail.quote?.allInCents).toBe(293480);
    expect(detail.quote?.approvalStatus).toBe("pending");
    expect(detail.carrier?.name).toBe("Northwind Transport");
    expect(detail.steps.find((step) => step.name === "finalize")?.status).toBe(
      "pending",
    );
    expect(detail.decisions.some((decision) => decision.stepName === "finalize")).toBe(
      false,
    );
    const draft = detail.decisions.find((decision) => decision.stepName === "draft_quote");
    expect(draft?.reasoning).toMatch(/rate card|Held/i);
    expect(draft?.reasoning).toMatch(/example/i);
    const again = await advanceRun(detail.id, "test", NOW);
    expect(again.quote?.id).toBe(detail.quote?.id);
    expect(again.status).toBe("waiting_approval");
  });

  it("resolves a weekday pickup and still waits", async () => {
    const detail = await hold(
      "Can you rate a dry van Los Angeles CA to Phoenix AZ, 44000 lbs, pickup Tuesday",
    );
    expect(detail.status).toBe("waiting_approval");
    expect(detail.load?.pickupDate).toBe("2026-11-10");
    expect(detail.quote?.allInCents).toBe(109890);
  });

  it("approves once and records a simulated send", async () => {
    const detail = await hold(CHICAGO);
    const approved = await decideApproval(
      { runId: detail.id, action: "approve", note: "Ship it" },
      "test",
      NOW,
    );
    expect(approved.status).toBe("completed");
    expect(approved.quote?.approvalStatus).toBe("approved");
    expect(approved.quote?.sentAt).toBeTruthy();
    expect(approved.load?.status).toBe("quoted");
    const again = await decideApproval(
      { runId: detail.id, action: "approve" },
      "test",
      NOW,
    );
    expect(again.quote?.sentAt).toBe(approved.quote?.sentAt);
  });

  it("rejects without sending", async () => {
    const detail = await hold(
      "Reefer please. Atlanta, GA to Miami, FL. Weight 38,000 pounds. Pickup on 2026-11-12. Commodity: frozen poultry.",
    );
    const rejected = await decideApproval(
      { runId: detail.id, action: "reject", note: "Too high" },
      "test",
      NOW,
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.quote?.sentAt).toBeNull();
    expect(rejected.quote?.approvalStatus).toBe("rejected");
    expect(rejected.load?.status).toBe("cancelled");
  });

  it("saves an edited quote as an expert example and sends the edited amount", async () => {
    const detail = await hold(
      "Flatbed, Dallas TX to Atlanta GA, 46,000 lbs, pickup 2026-11-18. Commodity: steel coil.",
    );
    const edited = await decideApproval(
      {
        runId: detail.id,
        action: "edit",
        editedAllInCents: 250000,
        note: "Shipper cap",
      },
      "test",
      NOW,
    );
    expect(edited.status).toBe("completed");
    expect(edited.quote?.approvalStatus).toBe("edited");
    expect(edited.quote?.editedAllInCents).toBe(250000);
    expect(edited.quote?.allInCents).toBe(263827);
    expect(edited.quote?.sentAt).toBeTruthy();
    expect(await countCorrections(detail.id)).toBe(1);
    await decideApproval(
      {
        runId: detail.id,
        action: "edit",
        editedAllInCents: 240000,
      },
      "test",
      NOW,
    );
    expect(await countCorrections(detail.id)).toBe(1);
  });

  it("fails a lane that is not on the rate card and does not send", async () => {
    const detail = await hold(
      "Need a dry van, Boston MA to Miami FL, 10,000 lbs, pickup 2026-11-10",
    );
    expect(detail.status).toBe("failed");
    expect(detail.quote).toBeNull();
    expect(detail.lastError).toMatch(/rate card/i);
  });

  it("fails an email that is not a rate request", async () => {
    const detail = await hold("hello, can you call me back?");
    expect(detail.status).toBe("failed");
    expect(detail.quote).toBeNull();
    expect(detail.lastError).toMatch(/validation/i);
  });
});
