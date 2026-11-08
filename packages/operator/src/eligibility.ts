import type { Carrier, EquipmentType, UsState } from "@freight/schema";

export type CarrierConsideration = {
  id: string;
  name: string;
  mcNumber: string;
  eligible: boolean;
  reason: string;
  safetyRating: Carrier["safetyRating"];
};

const SAFETY_RANK: Record<Carrier["safetyRating"], number> = {
  satisfactory: 0,
  none: 1,
  conditional: 2,
  unsatisfactory: 3,
};

export function considerCarrier(
  carrier: Carrier,
  equipment: EquipmentType,
  originState: UsState,
  destinationState: UsState,
): CarrierConsideration {
  const base = {
    id: carrier.id,
    name: carrier.name,
    mcNumber: carrier.mcNumber,
    safetyRating: carrier.safetyRating,
  };
  if (carrier.authorityStatus !== "authorized") {
    return {
      ...base,
      eligible: false,
      reason: `Authority is ${carrier.authorityStatus}.`,
    };
  }
  if (carrier.insuranceStatus !== "active") {
    return {
      ...base,
      eligible: false,
      reason: `Insurance is ${carrier.insuranceStatus}.`,
    };
  }
  if (carrier.safetyRating === "unsatisfactory") {
    return {
      ...base,
      eligible: false,
      reason: "Safety rating is unsatisfactory.",
    };
  }
  if (!carrier.equipment.includes(equipment)) {
    return {
      ...base,
      eligible: false,
      reason: `Does not run ${equipment.replaceAll("_", " ")}.`,
    };
  }
  const servesOrigin = carrier.serviceStates.includes(originState);
  const servesDestination = carrier.serviceStates.includes(destinationState);
  if (!servesOrigin || !servesDestination) {
    return {
      ...base,
      eligible: false,
      reason: `Does not cover ${originState} to ${destinationState}.`,
    };
  }
  return {
    ...base,
    eligible: true,
    reason:
      carrier.safetyRating === "conditional"
        ? "Eligible, with a conditional safety rating."
        : "Authority authorized, insurance active, equipment and states match.",
  };
}

export function chooseCarrier(
  carriers: Carrier[],
  equipment: EquipmentType,
  originState: UsState,
  destinationState: UsState,
): { selected: Carrier | null; considered: CarrierConsideration[] } {
  const considered = carriers.map((carrier) =>
    considerCarrier(carrier, equipment, originState, destinationState),
  );
  const ranked = [...considered].sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    const safety =
      SAFETY_RANK[left.safetyRating] - SAFETY_RANK[right.safetyRating];
    if (safety !== 0) return safety;
    return left.name.localeCompare(right.name);
  });
  const winner = ranked.find((item) => item.eligible);
  const selected = winner
    ? (carriers.find((carrier) => carrier.id === winner.id) ?? null)
    : null;
  return { selected, considered };
}

export function describeCarrierChoice(input: {
  selected: Carrier | null;
  considered: CarrierConsideration[];
}): string {
  const skipped = input.considered.filter((item) => !item.eligible);
  if (!input.selected) {
    const why = skipped
      .map((item) => `${item.name}: ${item.reason}`)
      .join(" ");
    return `No eligible carrier. ${why}`.trim();
  }
  const chosen = input.considered.find((item) => item.id === input.selected?.id);
  const nearMisses = skipped.length;
  return `Selected ${input.selected.name} (${input.selected.mcNumber}): ${chosen?.reason ?? "Eligible."} Passed over ${nearMisses} carrier${nearMisses === 1 ? "" : "s"}.`;
}
