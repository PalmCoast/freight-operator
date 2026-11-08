import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { pool, db } from "./client";
import { embedCase } from "./embed";
import { carriers, expertExamples, laneRates } from "./schema";
import { SEED_CARRIERS, SEED_EXAMPLES, SEED_LANES } from "./seed-data";

export async function seed(): Promise<void> {
  for (const carrier of SEED_CARRIERS) {
    await db
      .insert(carriers)
      .values(carrier)
      .onConflictDoUpdate({
        target: carriers.mcNumber,
        set: {
          name: carrier.name,
          dotNumber: carrier.dotNumber,
          equipment: carrier.equipment,
          insuranceStatus: carrier.insuranceStatus,
          authorityStatus: carrier.authorityStatus,
          safetyRating: carrier.safetyRating,
          serviceStates: carrier.serviceStates,
        },
      });
  }

  for (const lane of SEED_LANES) {
    await db
      .insert(laneRates)
      .values(lane)
      .onConflictDoUpdate({
        target: [
          laneRates.originCity,
          laneRates.originState,
          laneRates.destinationCity,
          laneRates.destinationState,
          laneRates.equipment,
        ],
        set: {
          mileage: lane.mileage,
          ratePerMileCents: lane.ratePerMileCents,
          fuelSurchargePerMileCents: lane.fuelSurchargePerMileCents,
          marginBps: lane.marginBps,
        },
      });
  }

  await db.delete(expertExamples).where(eq(expertExamples.source, "seed"));
  await db.insert(expertExamples).values(
    SEED_EXAMPLES.map((example) => ({
      ...example,
      source: "seed" as const,
      embedding: embedCase(example),
    })),
  );

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(laneRates);
  const count = counted[0]?.count ?? 0;
  console.log(
    `seeded ${SEED_CARRIERS.length} carriers, ${count} lane rates, ${SEED_EXAMPLES.length} expert examples`,
  );
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (invokedDirectly) {
  seed()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
