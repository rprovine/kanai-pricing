/**
 * Dumpster-rental pricing — 2026 Kanai's Rolloff rate sheet.
 *
 * Single source of truth for:
 *   - Per-agreement-type rental tables (residential, construction,
 *     roofing, government, NAN Inc)
 *   - 7yd material-specific pricing (the public website's booking
 *     flow charges by material on a 7yd, not by agreement type)
 *   - Included-tons rules per size + agreement
 *   - Overage rate, dump fee passthrough for roofing/NAN
 *   - Surcharges (mixed debris, out-of-district, extension days)
 *   - Pure rental-total + overage + dump-fee calculators
 *
 * Tax constants and the calculateDumpFee helper live alongside the
 * junk module — `HI_TAX_RATE` is re-imported here.
 *
 * What does NOT live here:
 *   - Stripe SDK / payment intent creation (per-app Node concern)
 *   - Settings overrides loaders (per-app, DB-coupled)
 *
 * All helpers accept optional `overrides` objects so consumers that
 * persist owner-configurable rates can pass them in without
 * duplicating any math.
 */

import { HI_TAX_RATE } from "./junk";

// ─── Agreement types ───────────────────────────────────────────────
export type AgreementType = "residential" | "construction" | "roofing" | "government" | "nan";

// ─── Rental price tables (base before tax) ─────────────────────────
export const PRICE_BY_AGREEMENT: Record<AgreementType, Record<string, { short: number; long: number }>> = {
  residential: {
    "15yd": { short: 800, long: 850 },
    "20yd": { short: 850, long: 900 },
    "25yd": { short: 850, long: 900 },
    "30yd": { short: 950, long: 1000 },
  },
  construction: {
    "7yd":  { short: 600, long: 675 },
    "15yd": { short: 900, long: 900 },   // all-day flat
    "20yd": { short: 949, long: 949 },
    "25yd": { short: 949, long: 949 },
    "30yd": { short: 1000, long: 1000 },
  },
  roofing: {
    // Flat $450 rental for all sizes; dump fees are billed separately on
    // completion as ROOFING_DUMP_RATE_PER_TON × tons_dumped.
    "15yd": { short: 450, long: 450 },
    "20yd": { short: 450, long: 450 },
    "25yd": { short: 450, long: 450 },
    "30yd": { short: 450, long: 450 },
  },
  government: {
    "15yd": { short: 837.70, long: 890.05 }, // gov rates already include tax
    "20yd": { short: 890.05, long: 942.41 },
    "25yd": { short: 890.05, long: 942.41 },
    "30yd": { short: 994.76, long: 1047.12 },
  },
  // NAN Inc — $400 flat rental for any size; we pass actual dump fees (cost
  // from the receiving facility, no markup) on top at completion. Always
  // invoiced — never charged to a card on file.
  nan: {
    "15yd": { short: 400, long: 400 },
    "20yd": { short: 400, long: 400 },
    "25yd": { short: 400, long: 400 },
    "30yd": { short: 400, long: 400 },
  },
};

// ─── 7yd material-specific pricing ─────────────────────────────────
// The public booking flow on kanai-website prices 7yd by material
// (not by agreement type), since a website customer hasn't picked an
// agreement yet. Concrete and dirt are heavier than household debris;
// roofing waste needs special routing. Anything else falls back to
// the construction 7yd base rate.
export const SEVEN_YD_BY_MATERIAL: Record<string, number> = {
  concrete: 450,
  dirt: 450,
  roofing: 500,
};
export const SEVEN_YD_DEFAULT_PRICE = 400;

/**
 * Resolve a 7yd price from the customer's selected material. Falls
 * back to SEVEN_YD_DEFAULT_PRICE for unknown materials.
 */
export function priceForSevenYdByMaterial(
  material: string | null | undefined,
  overrides?: { seven_yd_by_material?: Record<string, number>; seven_yd_default?: number },
): number {
  if (!material) return overrides?.seven_yd_default ?? SEVEN_YD_DEFAULT_PRICE;
  const table = overrides?.seven_yd_by_material ?? SEVEN_YD_BY_MATERIAL;
  return table[material.toLowerCase()] ?? overrides?.seven_yd_default ?? SEVEN_YD_DEFAULT_PRICE;
}

/**
 * Resolve the rental base price for an agreement/size/duration combo.
 * Returns null if any input is unknown.
 *
 * Size-fallback rule: 7yd is only stocked at construction job sites and
 * only the construction table has 7yd pricing. A roofing or NAN customer
 * renting a 7yd still bills at the construction 7yd rate ($600 / $675).
 * The customer segment doesn't change with bin size, but the flat-rate
 * structures of roofing/NAN don't extend to 7yd.
 *
 * Optional `overrides` lets callers pass a per-agreement / per-size
 * map of `{ short, long }` tiers (e.g. `dispatch_settings.pricing_overrides`)
 * so owner-configured rates win over the defaults without redeploying.
 */
export function priceFor(
  size: string | null | undefined,
  duration: string | null | undefined,
  agreement: AgreementType | string | null | undefined,
  overrides?: Record<string, Record<string, { short: number; long: number }>> | null,
): number | null {
  if (!size || !duration || !agreement) return null;
  const overrideTier = overrides?.[agreement as string]?.[size];
  let tier = overrideTier ?? PRICE_BY_AGREEMENT[agreement as AgreementType]?.[size];
  // Fall back to construction's row when the chosen agreement doesn't
  // define one for this size (the 7yd case, primarily).
  if (!tier) tier = overrides?.construction?.[size] ?? PRICE_BY_AGREEMENT.construction[size];
  if (!tier) return null;
  return duration === "long" ? tier.long : tier.short;
}

// ─── Revenue-generating task types ─────────────────────────────────
// Tasks that initiate a billable rental. Pickups, dumps, and live_loads
// either bill nothing or bill incrementally elsewhere.
const REVENUE_GENERATING_TYPES = new Set(["drop_off", "swap", "dump_and_return"]);

export function isRevenueGeneratingType(taskType: string | null | undefined): boolean {
  return !!taskType && REVENUE_GENERATING_TYPES.has(taskType);
}

// ─── Included tons by size ─────────────────────────────────────────
// Matches the agreement pricing tables and what's printed on the
// customer agreements.
export const INCLUDED_TONS: Record<string, number> = {
  "7yd": 4,
  "15yd": 2,
  "20yd": 3,
  "25yd": 3,
  "30yd": 5,
};

/**
 * Construction agreements include extra tonnage on 15yd. Roofing
 * and NAN have "dump fee separate" — we treat those as no overage
 * applies (dump cost passes through outside the rental price via
 * calculateAgreementDumpFee). 7yd is the exception: it always uses
 * construction tonnage rules even on a roofing/NAN agreement,
 * because the roofing/NAN flat-rate structures don't extend to 7yd.
 */
export function includedTonsFor(
  size: string,
  customerType?: string | null,
  materialType?: string | null,
  agreementType?: string | null,
  overrides?: { included_tons?: Record<string, number>; included_tons_construction_15yd?: number },
): number {
  const tons = (k: string) => overrides?.included_tons?.[k] ?? INCLUDED_TONS[k] ?? 0;
  if (size === "7yd") return tons("7yd"); // construction-fallback bypass
  if (materialType === "roofing") return Number.POSITIVE_INFINITY;
  if (agreementType === "roofing" || agreementType === "nan") return Number.POSITIVE_INFINITY;
  if (customerType === "commercial" || customerType === "construction") {
    if (size === "15yd") return overrides?.included_tons_construction_15yd ?? 3;
  }
  return tons(size);
}

// ─── Rates + surcharges ────────────────────────────────────────────
export const OVERAGE_RATE = 160;
export const ROOFING_DUMP_RATE_PER_TON = 180;
export const EXTENSION_RATE = 50;
export const MIXED_DEBRIS_SURCHARGE = 150;
export const OUT_OF_DISTRICT_SURCHARGE = 100;

// ─── Calculators ───────────────────────────────────────────────────

/**
 * Calculate total price for a dumpster rental.
 *
 * Tax is applied in decimal form (subtotal * HI_TAX_RATE). Callers
 * passing `taxRate` should pass the DECIMAL rate (0.04712), not the
 * percentage (4.712). The `overrides.hi_tax_rate` field is the same —
 * decimal. (Previously kanai-dispatch used the percentage convention
 * and divided by 100; in v0.3 we standardized on decimal everywhere.)
 */
export function calculateRentalTotal(params: {
  rentalPrice: number;
  mixedDebris?: boolean;
  outOfDistrict?: boolean;
  extensionDays?: number;
  taxRate?: number;
  overrides?: {
    mixed_debris_surcharge?: number;
    out_of_district_surcharge?: number;
    extension_rate?: number;
    hi_tax_rate?: number;
  };
}): { subtotal: number; tax: number; total: number } {
  const mixed = params.overrides?.mixed_debris_surcharge ?? MIXED_DEBRIS_SURCHARGE;
  const ood = params.overrides?.out_of_district_surcharge ?? OUT_OF_DISTRICT_SURCHARGE;
  const ext = params.overrides?.extension_rate ?? EXTENSION_RATE;
  const taxRate = params.taxRate ?? params.overrides?.hi_tax_rate ?? HI_TAX_RATE;

  const subtotal =
    params.rentalPrice +
    (params.mixedDebris ? mixed : 0) +
    (params.outOfDistrict ? ood : 0) +
    (params.extensionDays || 0) * ext;

  const tax = subtotal * taxRate;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

/**
 * Calculate overage fee after pickup. Pass customer/material type to apply
 * the contract-specific included tonnage (construction 15yd has 3 tons vs
 * residential's 2; roofing has no overage at all because dump cost passes
 * through separately).
 */
export function calculateOverage(
  size: string,
  tonsDumped: number,
  customerType?: string | null,
  materialType?: string | null,
  agreementType?: string | null,
  overrides?: { included_tons?: Record<string, number>; included_tons_construction_15yd?: number; overage_rate?: number },
): { overageTons: number; overageFee: number } {
  const included = includedTonsFor(size, customerType, materialType, agreementType, overrides);
  if (!Number.isFinite(included)) return { overageTons: 0, overageFee: 0 };
  const overageTons = Math.max(0, tonsDumped - included);
  const rate = overrides?.overage_rate ?? OVERAGE_RATE;
  return { overageTons, overageFee: overageTons * rate };
}

/**
 * Compute the dump-fee pass-through that gets added to the customer
 * invoice at completion. Returns 0 for agreement types that include
 * dump fees in the base rental (residential, construction, government —
 * overage handles the over-cap portion separately via calculateOverage).
 *
 *   - roofing → ROOFING_DUMP_RATE_PER_TON × tons on every ton dumped
 *   - nan     → actual facility cost passes through with no markup;
 *               caller must supply `dumpCost`
 *
 * This is a DUMPSTER-side calculator. It runs at task completion and
 * the result IS customer-billable (unlike the junk-removal dump fee,
 * which is operational only). Do not confuse these two flows.
 */
export function calculateAgreementDumpFee(params: {
  agreement?: string | null;
  size?: string | null;
  tonsDumped?: number | null;
  dumpCost?: number | null;
  overrides?: { roofing_dump_rate?: number };
}): number {
  const agreement = params.agreement || "";
  const size = params.size || "";
  const tons = Number(params.tonsDumped || 0);
  if (size === "7yd") return 0;
  if (agreement === "roofing") {
    const rate = params.overrides?.roofing_dump_rate ?? ROOFING_DUMP_RATE_PER_TON;
    return Math.round(tons * rate * 100) / 100;
  }
  if (agreement === "nan") {
    return Math.round(Number(params.dumpCost || 0) * 100) / 100;
  }
  return 0;
}

/**
 * Calculate dump cost from location rate × tons. Honors a per-location
 * minimum-tons floor (e.g. Hawaiian Earth has a 4-ton minimum).
 */
export function calculateDumpCost(
  ratePerTon: number,
  tonsDumped: number,
  minimumTons: number = 0,
): number {
  const billableTons = Math.max(tonsDumped, minimumTons);
  return Math.round(ratePerTon * billableTons * 100) / 100;
}
