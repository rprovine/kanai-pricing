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
export type AgreementType = "residential" | "construction" | "roofing" | "government" | "nan";
export declare const PRICE_BY_AGREEMENT: Record<AgreementType, Record<string, {
    short: number;
    long: number;
}>>;
export declare const SEVEN_YD_BY_MATERIAL: Record<string, number>;
export declare const SEVEN_YD_DEFAULT_PRICE = 400;
/**
 * Resolve a 7yd price from the customer's selected material. Falls
 * back to SEVEN_YD_DEFAULT_PRICE for unknown materials.
 */
export declare function priceForSevenYdByMaterial(material: string | null | undefined, overrides?: {
    seven_yd_by_material?: Record<string, number>;
    seven_yd_default?: number;
}): number;
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
export declare function priceFor(size: string | null | undefined, duration: string | null | undefined, agreement: AgreementType | string | null | undefined, overrides?: Record<string, Record<string, {
    short: number;
    long: number;
}>> | null): number | null;
export declare function isRevenueGeneratingType(taskType: string | null | undefined): boolean;
export declare const INCLUDED_TONS: Record<string, number>;
/**
 * Construction agreements include extra tonnage on 15yd. Roofing
 * and NAN have "dump fee separate" — we treat those as no overage
 * applies (dump cost passes through outside the rental price via
 * calculateAgreementDumpFee). 7yd is the exception: it always uses
 * construction tonnage rules even on a roofing/NAN agreement,
 * because the roofing/NAN flat-rate structures don't extend to 7yd.
 */
export declare function includedTonsFor(size: string, customerType?: string | null, materialType?: string | null, agreementType?: string | null, overrides?: {
    included_tons?: Record<string, number>;
    included_tons_construction_15yd?: number;
}): number;
export declare const OVERAGE_RATE = 160;
export declare const ROOFING_DUMP_RATE_PER_TON = 180;
export declare const EXTENSION_RATE = 50;
export declare const MIXED_DEBRIS_SURCHARGE = 150;
export declare const OUT_OF_DISTRICT_SURCHARGE = 100;
/**
 * Calculate total price for a dumpster rental.
 *
 * Tax is applied in decimal form (subtotal * HI_TAX_RATE). Callers
 * passing `taxRate` should pass the DECIMAL rate (0.04712), not the
 * percentage (4.712). The `overrides.hi_tax_rate` field is the same —
 * decimal. (Previously kanai-dispatch used the percentage convention
 * and divided by 100; in v0.3 we standardized on decimal everywhere.)
 */
export declare function calculateRentalTotal(params: {
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
}): {
    subtotal: number;
    tax: number;
    total: number;
};
/**
 * Calculate overage fee after pickup. Pass customer/material type to apply
 * the contract-specific included tonnage (construction 15yd has 3 tons vs
 * residential's 2; roofing has no overage at all because dump cost passes
 * through separately).
 */
export declare function calculateOverage(size: string, tonsDumped: number, customerType?: string | null, materialType?: string | null, agreementType?: string | null, overrides?: {
    included_tons?: Record<string, number>;
    included_tons_construction_15yd?: number;
    overage_rate?: number;
}): {
    overageTons: number;
    overageFee: number;
};
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
export declare function calculateAgreementDumpFee(params: {
    agreement?: string | null;
    size?: string | null;
    tonsDumped?: number | null;
    dumpCost?: number | null;
    overrides?: {
        roofing_dump_rate?: number;
    };
}): number;
/**
 * Calculate dump cost from location rate × tons. Honors a per-location
 * minimum-tons floor (e.g. Hawaiian Earth has a 4-ton minimum).
 */
export declare function calculateDumpCost(ratePerTon: number, tonsDumped: number, minimumTons?: number): number;
//# sourceMappingURL=dumpster.d.ts.map