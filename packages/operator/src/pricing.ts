import { formatUsd, type LaneRate } from "@freight/schema";

export type PriceBreakdown = {
  linehaulCents: number;
  fuelSurchargeCents: number;
  marginCents: number;
  allInCents: number;
};

/**
 * The rate card is the system of record. The model does not invent the price.
 * linehaul = miles * rate per mile
 * fuel = miles * fuel per mile
 * margin = round(subtotal * marginBps / 10_000)
 */
export function priceLane(
  lane: Pick<
    LaneRate,
    "mileage" | "ratePerMileCents" | "fuelSurchargePerMileCents" | "marginBps"
  >,
): PriceBreakdown {
  const linehaulCents = lane.mileage * lane.ratePerMileCents;
  const fuelSurchargeCents = lane.mileage * lane.fuelSurchargePerMileCents;
  const subtotal = linehaulCents + fuelSurchargeCents;
  const marginCents = Math.round((subtotal * lane.marginBps) / 10_000);
  return {
    linehaulCents,
    fuelSurchargeCents,
    marginCents,
    allInCents: subtotal + marginCents,
  };
}

export function describePrice(
  lane: Pick<
    LaneRate,
    | "originCity"
    | "originState"
    | "destinationCity"
    | "destinationState"
    | "mileage"
    | "ratePerMileCents"
    | "fuelSurchargePerMileCents"
    | "marginBps"
  >,
  price: PriceBreakdown,
): string {
  const marginPct = (lane.marginBps / 100).toFixed(1).replace(/\.0$/, "");
  return `${lane.originCity}, ${lane.originState} → ${lane.destinationCity}, ${lane.destinationState}: ${lane.mileage} miles at ${formatUsd(lane.ratePerMileCents)}/mi plus ${formatUsd(lane.fuelSurchargePerMileCents)}/mi fuel. Linehaul ${formatUsd(price.linehaulCents)}, fuel ${formatUsd(price.fuelSurchargeCents)}, ${marginPct}% margin ${formatUsd(price.marginCents)}, all-in ${formatUsd(price.allInCents)}.`;
}
