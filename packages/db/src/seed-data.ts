import type { EquipmentType } from "@freight/schema";

export type SeedCarrier = {
  id: string;
  name: string;
  mcNumber: string;
  dotNumber: string;
  equipment: EquipmentType[];
  insuranceStatus: "active" | "expired" | "pending";
  authorityStatus: "authorized" | "revoked" | "pending";
  safetyRating: "satisfactory" | "conditional" | "unsatisfactory" | "none";
  serviceStates: string[];
};

export type SeedLane = {
  id: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  equipment: EquipmentType;
  mileage: number;
  ratePerMileCents: number;
  fuelSurchargePerMileCents: number;
  marginBps: number;
};

export type SeedExample = {
  id: string;
  rawText: string;
  originState: string;
  destinationState: string;
  equipment: EquipmentType;
  quoteAllInCents: number;
  notes: string;
};

export const SEED_CARRIERS: SeedCarrier[] = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    name: "Northwind Transport",
    mcNumber: "MC-100201",
    dotNumber: "2100201",
    equipment: ["dry_van"],
    insuranceStatus: "active",
    authorityStatus: "authorized",
    safetyRating: "satisfactory",
    serviceStates: ["IL", "TX", "GA", "NJ", "NC", "TN", "OH", "CA", "AZ"],
  },
  {
    id: "11111111-1111-4111-8111-111111111102",
    name: "Red Mesa Logistics",
    mcNumber: "MC-100202",
    dotNumber: "2100202",
    equipment: ["dry_van", "flatbed"],
    insuranceStatus: "expired",
    authorityStatus: "authorized",
    safetyRating: "satisfactory",
    serviceStates: ["TX", "CO", "GA"],
  },
  {
    id: "11111111-1111-4111-8111-111111111103",
    name: "Prairie Flatbed Co",
    mcNumber: "MC-100203",
    dotNumber: "2100203",
    equipment: ["flatbed"],
    insuranceStatus: "active",
    authorityStatus: "authorized",
    safetyRating: "satisfactory",
    serviceStates: ["TX", "GA", "MO", "IL", "KS"],
  },
  {
    id: "11111111-1111-4111-8111-111111111104",
    name: "Harbor Reefer Lines",
    mcNumber: "MC-100204",
    dotNumber: "2100204",
    equipment: ["reefer"],
    insuranceStatus: "active",
    authorityStatus: "authorized",
    safetyRating: "satisfactory",
    serviceStates: ["GA", "FL", "TX", "CO"],
  },
  {
    id: "11111111-1111-4111-8111-111111111105",
    name: "Sound Freight",
    mcNumber: "MC-100205",
    dotNumber: "2100205",
    equipment: ["dry_van"],
    insuranceStatus: "active",
    authorityStatus: "authorized",
    safetyRating: "satisfactory",
    serviceStates: ["WA", "OR"],
  },
  {
    id: "11111111-1111-4111-8111-111111111106",
    name: "Cinder Haul",
    mcNumber: "MC-100206",
    dotNumber: "2100206",
    equipment: ["dry_van"],
    insuranceStatus: "active",
    authorityStatus: "pending",
    safetyRating: "none",
    serviceStates: ["TN", "OH"],
  },
  {
    id: "11111111-1111-4111-8111-111111111107",
    name: "Milemarker Freight",
    mcNumber: "MC-100207",
    dotNumber: "2100207",
    equipment: ["dry_van"],
    insuranceStatus: "active",
    authorityStatus: "authorized",
    safetyRating: "conditional",
    serviceStates: ["IL", "TX"],
  },
];

export const SEED_LANES: SeedLane[] = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    originCity: "Chicago",
    originState: "IL",
    destinationCity: "Dallas",
    destinationState: "TX",
    equipment: "dry_van",
    mileage: 920,
    ratePerMileCents: 250,
    fuelSurchargePerMileCents: 40,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    originCity: "Atlanta",
    originState: "GA",
    destinationCity: "Miami",
    destinationState: "FL",
    equipment: "reefer",
    mileage: 660,
    ratePerMileCents: 280,
    fuelSurchargePerMileCents: 45,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    originCity: "Los Angeles",
    originState: "CA",
    destinationCity: "Phoenix",
    destinationState: "AZ",
    equipment: "dry_van",
    mileage: 370,
    ratePerMileCents: 230,
    fuelSurchargePerMileCents: 40,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    originCity: "Dallas",
    originState: "TX",
    destinationCity: "Atlanta",
    destinationState: "GA",
    equipment: "flatbed",
    mileage: 780,
    ratePerMileCents: 260,
    fuelSurchargePerMileCents: 42,
    marginBps: 1200,
  },
  {
    id: "22222222-2222-4222-8222-222222222205",
    originCity: "Chicago",
    originState: "IL",
    destinationCity: "Atlanta",
    destinationState: "GA",
    equipment: "dry_van",
    mileage: 720,
    ratePerMileCents: 240,
    fuelSurchargePerMileCents: 40,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222206",
    originCity: "Newark",
    originState: "NJ",
    destinationCity: "Charlotte",
    destinationState: "NC",
    equipment: "dry_van",
    mileage: 640,
    ratePerMileCents: 255,
    fuelSurchargePerMileCents: 40,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222207",
    originCity: "Houston",
    originState: "TX",
    destinationCity: "Denver",
    destinationState: "CO",
    equipment: "reefer",
    mileage: 1030,
    ratePerMileCents: 270,
    fuelSurchargePerMileCents: 48,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222208",
    originCity: "Seattle",
    originState: "WA",
    destinationCity: "Portland",
    destinationState: "OR",
    equipment: "dry_van",
    mileage: 175,
    ratePerMileCents: 300,
    fuelSurchargePerMileCents: 40,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222209",
    originCity: "Memphis",
    originState: "TN",
    destinationCity: "Columbus",
    destinationState: "OH",
    equipment: "dry_van",
    mileage: 530,
    ratePerMileCents: 235,
    fuelSurchargePerMileCents: 38,
    marginBps: 1000,
  },
  {
    id: "22222222-2222-4222-8222-222222222210",
    originCity: "Kansas City",
    originState: "MO",
    destinationCity: "Chicago",
    destinationState: "IL",
    equipment: "flatbed",
    mileage: 510,
    ratePerMileCents: 265,
    fuelSurchargePerMileCents: 42,
    marginBps: 1200,
  },
];

/** Historical desk quotes. Amounts match the rate card on purpose. */
export const SEED_EXAMPLES: SeedExample[] = [
  {
    id: "33333333-3333-4333-8333-333333333301",
    rawText:
      "Need a quote, dry van, Chicago IL to Dallas TX, 40,000 lbs, pickup 2026-01-06",
    originState: "IL",
    destinationState: "TX",
    equipment: "dry_van",
    quoteAllInCents: 293480,
    notes: "Desk accepted the rate card on this lane last winter.",
  },
  {
    id: "33333333-3333-4333-8333-333333333302",
    rawText:
      "Reefer Atlanta GA to Miami FL, 36000 lbs, pickup 2026-02-02, commodity frozen juice",
    originState: "GA",
    destinationState: "FL",
    equipment: "reefer",
    quoteAllInCents: 235950,
    notes: "Reefer desk held the card rate. No fuel exception.",
  },
  {
    id: "33333333-3333-4333-8333-333333333303",
    rawText: "Dry van Seattle WA to Portland OR, 12000 lbs, pickup 2026-03-11",
    originState: "WA",
    destinationState: "OR",
    equipment: "dry_van",
    quoteAllInCents: 65450,
    notes: "Short-haul. Desk did not discount the per-mile minimum.",
  },
];
