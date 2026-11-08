import { describe, expect, it } from "vitest";
import { cosineSimilarity, embedCase, embedText } from "./embed";

describe("hashing embedder", () => {
  it("is deterministic and unit length", () => {
    const first = embedText("dry van Chicago IL Dallas TX");
    const second = embedText("dry van Chicago IL Dallas TX");
    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("ranks the same lane above a different one", () => {
    const query = embedCase({
      rawText: "Need a quote, dry van, Chicago IL to Dallas TX, 42,000 lbs",
      equipment: "dry_van",
      originState: "IL",
      destinationState: "TX",
    });
    const sameLane = embedCase({
      rawText: "dry van Chicago IL to Dallas TX 40000 lbs pickup Monday",
      equipment: "dry_van",
      originState: "IL",
      destinationState: "TX",
    });
    const otherLane = embedCase({
      rawText: "dry van Seattle WA to Portland OR 15000 lbs",
      equipment: "dry_van",
      originState: "WA",
      destinationState: "OR",
    });
    expect(cosineSimilarity(query, sameLane)).toBeGreaterThan(
      cosineSimilarity(query, otherLane),
    );
  });
});
