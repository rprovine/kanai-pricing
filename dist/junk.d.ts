/**
 * Junk removal pricing — 2026 Kanai's rate sheet.
 *
 * Single source of truth for:
 *   - Truckload pricing (15 CY truck, Minimum → Full)
 *   - Environmental fees (mattress, freon, e-waste, tires, batteries, etc.)
 *   - Other rates (carpet demo, hot tubs, pianos, towing, etc.)
 *   - Dump location per-ton rates
 *   - Labor calc (included vs extra crew hours)
 *   - Free Estimate Closing Bonus tier table
 *   - Free Estimate vs Est&Rem distinction (only free estimates earn
 *     the bonus per the EOD repo's rule)
 *
 * Customer-facing booking, the crew app's on-site quote, and
 * /api/estimates respond all flow through these helpers. Owners can
 * override any rate in /settings → Junk pricing (per-app); the
 * defaults below are the printed rate-sheet values.
 */
export declare const LOAD_PRICES: Record<string, number>;
export declare const FRACTION_VALUES: Record<string, number>;
export declare const FRACTION_OPTIONS: readonly ["None", "Minimum", "1/8", "1/6", "1/4", "1/3", "3/8", "1/2", "5/8", "2/3", "3/4", "5/6", "7/8", "Full"];
export declare const DUMPSTER_PRICES: {
    readonly "15yd": {
        readonly short: 800;
        readonly long: 850;
        readonly label: "15 Yard (1-2 day: $800 / 3-5 day: $850)";
    };
    readonly "20yd": {
        readonly short: 850;
        readonly long: 900;
        readonly label: "20 & 25 Yard (1-2 day: $850 / 3-5 day: $900)";
    };
    readonly "25yd": {
        readonly short: 850;
        readonly long: 900;
        readonly label: "20 & 25 Yard (1-2 day: $850 / 3-5 day: $900)";
    };
    readonly "30yd": {
        readonly short: 950;
        readonly long: 1000;
        readonly label: "30 Yard (1-2 day: $950 / 3-5 day: $1,000)";
    };
};
export declare const ENV_FEES: {
    readonly freon: 52.5;
    readonly ewaste: 1;
    readonly mattressSingle: 50;
    readonly mattressSet: 100;
    readonly tire: 36.75;
    readonly tireNoRim: 31.5;
    readonly tireSemiTractor: 150;
    readonly bike: 10.5;
    readonly battery: 20;
    readonly dirtbike: 150;
    readonly motorcycle: 250;
    readonly carTruck: 250;
    readonly fluorescentLight: 2.5;
    readonly wetPaint1gal: 25;
    readonly wetPaint5gal: 75;
    readonly waterHeater: 42;
    readonly waterHeaterLarge: 90;
};
export declare const OTHER_RATES: {
    readonly carpetDemo: 3;
    readonly basketballHoop: 125;
    readonly bedBugs: 600;
    readonly carTowing: 200;
    readonly constructionDebris: 100;
    readonly golfCart: 500;
    readonly greenWaste: 100;
    readonly haulingPerHour: 100;
    readonly hotTub: 500;
    readonly paintedConcrete: 400;
    readonly pianoRemoval: 250;
    readonly fridgeCleanOut: 200;
    readonly shedDemo: 400;
};
export declare const DUMP_LOCATIONS: Record<string, {
    perTon: number;
    label: string;
}>;
export declare const LABOR_RATE = 100;
export declare const INCLUDED_HOURS = 2;
export declare const INCLUDED_CREW = 2;
export type Difficulty = "easy" | "moderate" | "difficult";
/** Hours of labor a full crew is expected to take per truck fraction. */
export declare const LABOR_HOURS_BY_FRACTION: Record<string, number>;
/** Multiplier applied on top of the base hours from LABOR_HOURS_BY_FRACTION. */
export declare const DIFFICULTY_LABOR_MULTIPLIERS: Record<Difficulty, number>;
/**
 * Auto-estimate labor hours for a given truck fraction + difficulty.
 * Multi-load aware: each full load adds 2 hours, then the remainder
 * fraction adds its own LABOR_HOURS_BY_FRACTION lookup. Returns a
 * value rounded to 0.1.
 */
export declare function estimateLaborHours(truckFraction: string | null | undefined, truckFullLoads?: number | string | null | undefined, difficulty?: Difficulty | string | null | undefined): number;
/**
 * Cost of labor BEYOND the included 2hrs × 2-crew baseline.
 *   - Extra hours past the included 2 are billed at LABOR_RATE per
 *     person, for up to INCLUDED_CREW people.
 *   - Crew members beyond INCLUDED_CREW are billed at LABOR_RATE for
 *     all estimated hours (not just the extra portion).
 * Returns dollars, rounded to the cent.
 */
export declare function calculateLaborCost(estimatedHours: number | string | null | undefined, crewSize?: number | string | null | undefined): number;
/** Decimal form, for multiplication (e.g. subtotal * HI_TAX_RATE). */
export declare const HI_TAX_RATE = 0.04712;
/** Percentage form, for display (e.g. "Tax (4.712%)"). */
export declare const HI_TAX_PERCENT = 4.712;
export declare const ESTIMATE_BONUS_TIERS: {
    min: number;
    max: number;
    bonus: number;
}[];
export declare const BONUS_QUALIFICATION_PCT = 0.3;
export declare function estimateWeight(truckFraction: string | null | undefined, truckFullLoads: number | string | null | undefined): number;
export declare function calculateDumpFee(location: string | null | undefined, weightLbs: number): number;
/**
 * Bonus tier lookup. Returns the dollar payout for a single won
 * estimate at the given job revenue. The monthly qualification
 * percentage is enforced separately by the bonus calc job that
 * walks an estimator's monthly tracker history.
 */
export declare function bonusForRevenue(jobRevenue: number): number;
/**
 * Inputs the on-site wizard collects + bookings forms send. Mirrors
 * the EstimateWizard's form-data shape so the existing form can be
 * pointed at /api/estimates with minimal payload changes.
 */
export type JunkEstimateInput = {
    truckFraction?: string;
    truckFullLoads?: number | string;
    dumpster15Count?: number | string;
    dumpster20Count?: number | string;
    dumpster25Count?: number | string;
    dumpster30Count?: number | string;
    freonCount?: number | string;
    ewasteLbs?: number | string;
    mattressSingleCount?: number | string;
    mattressSetCount?: number | string;
    tireWithRimCount?: number | string;
    tireNoRimCount?: number | string;
    tireSemiCount?: number | string;
    bikeCount?: number | string;
    batteryCount?: number | string;
    dirtbikeCount?: number | string;
    motorcycleCount?: number | string;
    carTruckCount?: number | string;
    /** Golf cart count — flat $500/cart per OTHER_RATES.golfCart. */
    golfCartCount?: number | string;
    fluorescentCount?: number | string;
    wetPaint1galCount?: number | string;
    wetPaint5galCount?: number | string;
    waterHeaterCount?: number | string;
    waterHeaterLargeCount?: number | string;
    greenWasteCount?: number | string;
    carpetDemoSqft?: number | string;
    crewSize?: number | string;
    estimatedHours?: number | string;
    /**
     * Optional. When set AND `estimatedHours` is not, hours are auto-
     * estimated via `estimateLaborHours(truckFraction, truckFullLoads,
     * difficulty)`. If `estimatedHours` is also set, it wins and
     * difficulty is informational only.
     */
    difficulty?: Difficulty | string;
    dumpLocation?: string;
    overrideWeight?: number | string;
    discount?: number | string;
};
export type JunkEstimateResult = {
    basePrice: number;
    truckPrice: number;
    dumpsterPrice: number;
    envFees: number;
    envBreakdown: Record<string, number>;
    laborCost: number;
    /**
     * Estimated operational dump cost. NEVER charged to the customer
     * and NEVER rolled into subtotal/tax/total. Returned for internal
     * accounting / margin tracking only. The actual dump cost is
     * captured per-receipt at job completion and isn't known at
     * quote time.
     */
    dumpFee: number;
    weightLbs: number;
    discount: number;
    /** basePrice + envFees + laborCost − discount. Dump fee excluded. */
    subtotal: number;
    tax: number;
    total: number;
};
/**
 * The canonical junk-removal estimator. Returns a complete breakdown
 * so /q/[slug] can render every line item and /api/estimates can
 * persist the components alongside the headline total.
 *
 * Never throws — returns a zeroed result on bad input so the caller
 * doesn't have to wrap every render in try/catch.
 */
export declare function calculateJunkEstimate(input: JunkEstimateInput): JunkEstimateResult;
//# sourceMappingURL=junk.d.ts.map