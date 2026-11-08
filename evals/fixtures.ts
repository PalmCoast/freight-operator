import type { EquipmentType } from "@freight/schema";

/**
 * Historical desk. The expert all-in is written down here on purpose.
 * It is not computed from the pricing function at score time. A unit test
 * checks that these numbers still match the rate card, so a formula change
 * has to be an explicit edit to the expert record.
 *
 * Weekday fixtures are resolved against 2026-11-09T15:00:00Z (a Monday).
 */
export const EVAL_NOW = "2026-11-09T15:00:00.000Z";
export const QUOTE_BAND = 0.1;

export type EvalFixture = {
  id: string;
  rawText: string;
  equipment: EquipmentType;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  weightLbs: number;
  pickupDate: string;
  commodity?: string;
  expertAllInCents: number;
};

export const FIXTURES: EvalFixture[] = [
  {
    id: "chi-dal",
    rawText:
      "Need a quote, dry van, Chicago IL to Dallas TX, 42,000 lbs, pickup 2026-11-10",
    equipment: "dry_van",
    originCity: "Chicago",
    originState: "IL",
    destinationCity: "Dallas",
    destinationState: "TX",
    weightLbs: 42000,
    pickupDate: "2026-11-10",
    expertAllInCents: 293480,
  },
  {
    id: "atl-mia",
    rawText:
      "Reefer please. Atlanta, GA to Miami, FL. Weight 38,000 pounds. Pickup on 2026-11-12. Commodity: frozen poultry.",
    equipment: "reefer",
    originCity: "Atlanta",
    originState: "GA",
    destinationCity: "Miami",
    destinationState: "FL",
    weightLbs: 38000,
    pickupDate: "2026-11-12",
    commodity: "frozen poultry",
    expertAllInCents: 235950,
  },
  {
    id: "lax-phx",
    rawText:
      "Can you rate a dry van Los Angeles CA to Phoenix AZ, 44000 lbs, pickup Tuesday",
    equipment: "dry_van",
    originCity: "Los Angeles",
    originState: "CA",
    destinationCity: "Phoenix",
    destinationState: "AZ",
    weightLbs: 44000,
    pickupDate: "2026-11-10",
    expertAllInCents: 109890,
  },
  {
    id: "dal-atl",
    rawText:
      "Flatbed, Dallas TX to Atlanta GA, 46,000 lbs, pickup 2026-11-18. Commodity: steel coil.",
    equipment: "flatbed",
    originCity: "Dallas",
    originState: "TX",
    destinationCity: "Atlanta",
    destinationState: "GA",
    weightLbs: 46000,
    pickupDate: "2026-11-18",
    commodity: "steel coil",
    expertAllInCents: 263827,
  },
  {
    id: "chi-atl",
    rawText:
      "Dry van from Chicago IL to Atlanta GA, 20,000 lbs, pickup 2026-11-11",
    equipment: "dry_van",
    originCity: "Chicago",
    originState: "IL",
    destinationCity: "Atlanta",
    destinationState: "GA",
    weightLbs: 20000,
    pickupDate: "2026-11-11",
    expertAllInCents: 221760,
  },
  {
    id: "ewr-clt",
    rawText:
      "from Newark NJ to Charlotte NC, dry van, 35000 lbs, pickup Friday",
    equipment: "dry_van",
    originCity: "Newark",
    originState: "NJ",
    destinationCity: "Charlotte",
    destinationState: "NC",
    weightLbs: 35000,
    pickupDate: "2026-11-13",
    expertAllInCents: 207680,
  },
  {
    id: "hou-den",
    rawText:
      "Reefer Houston TX to Denver CO, 41,000 lbs, pickup 2026-11-20. Commodity: produce.",
    equipment: "reefer",
    originCity: "Houston",
    originState: "TX",
    destinationCity: "Denver",
    destinationState: "CO",
    weightLbs: 41000,
    pickupDate: "2026-11-20",
    commodity: "produce",
    expertAllInCents: 360294,
  },
  {
    id: "sea-pdx",
    rawText:
      "Need a dry van, Seattle WA to Portland OR, 15,000 lbs, pickup 2026-11-09",
    equipment: "dry_van",
    originCity: "Seattle",
    originState: "WA",
    destinationCity: "Portland",
    destinationState: "OR",
    weightLbs: 15000,
    pickupDate: "2026-11-09",
    expertAllInCents: 65450,
  },
  {
    id: "mem-cmh",
    rawText:
      "dry van Memphis TN to Columbus OH, 43,000 lbs, pickup Wednesday",
    equipment: "dry_van",
    originCity: "Memphis",
    originState: "TN",
    destinationCity: "Columbus",
    destinationState: "OH",
    weightLbs: 43000,
    pickupDate: "2026-11-11",
    expertAllInCents: 159159,
  },
  {
    id: "mci-chi",
    rawText:
      "Flatbed Kansas City MO to Chicago IL, 48,000 lbs, pickup 2026-11-16",
    equipment: "flatbed",
    originCity: "Kansas City",
    originState: "MO",
    destinationCity: "Chicago",
    destinationState: "IL",
    weightLbs: 48000,
    pickupDate: "2026-11-16",
    expertAllInCents: 175358,
  },
];
