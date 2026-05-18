"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BONUS_QUALIFICATION_PCT = exports.ESTIMATE_BONUS_TIERS = exports.HI_TAX_PERCENT = exports.HI_TAX_RATE = exports.DIFFICULTY_LABOR_MULTIPLIERS = exports.LABOR_HOURS_BY_FRACTION = exports.INCLUDED_CREW = exports.INCLUDED_HOURS = exports.LABOR_RATE = exports.DUMP_LOCATIONS = exports.OTHER_RATES = exports.ENV_FEES = exports.DUMPSTER_PRICES = exports.FRACTION_OPTIONS = exports.FRACTION_VALUES = exports.LOAD_PRICES = void 0;
exports.estimateLaborHours = estimateLaborHours;
exports.calculateLaborCost = calculateLaborCost;
exports.estimateWeight = estimateWeight;
exports.calculateDumpFee = calculateDumpFee;
exports.bonusForRevenue = bonusForRevenue;
exports.calculateJunkEstimate = calculateJunkEstimate;
// ─── Truckload pricing ───────────────────────────────────────────────
// 15 Cubic Yard Truck Load Pricing (12' L × 7' W × 4' H)
exports.LOAD_PRICES = {
    Minimum: 187,
    "1/8": 315,
    "1/6": 385,
    "1/4": 455,
    "1/3": 525,
    "3/8": 595,
    "1/2": 675,
    "5/8": 745,
    "2/3": 795,
    "3/4": 855,
    "5/6": 895,
    "7/8": 935,
    Full: 980,
};
exports.FRACTION_VALUES = {
    None: 0,
    Minimum: 0.0625,
    "1/8": 0.125,
    "1/6": 0.167,
    "1/4": 0.25,
    "1/3": 0.333,
    "3/8": 0.375,
    "1/2": 0.5,
    "5/8": 0.625,
    "2/3": 0.667,
    "3/4": 0.75,
    "5/6": 0.833,
    "7/8": 0.875,
    Full: 1.0,
};
exports.FRACTION_OPTIONS = [
    "None", "Minimum", "1/8", "1/6", "1/4", "1/3", "3/8",
    "1/2", "5/8", "2/3", "3/4", "5/6", "7/8", "Full",
];
// ─── Dumpster rental (same as dispatch_tasks pricing — kept here so
// the on-site estimator can quote a dumpster alongside a haul) ───────
exports.DUMPSTER_PRICES = {
    "15yd": { short: 800, long: 850, label: "15 Yard (1-2 day: $800 / 3-5 day: $850)" },
    "20yd": { short: 850, long: 900, label: "20 & 25 Yard (1-2 day: $850 / 3-5 day: $900)" },
    "25yd": { short: 850, long: 900, label: "20 & 25 Yard (1-2 day: $850 / 3-5 day: $900)" },
    "30yd": { short: 950, long: 1000, label: "30 Yard (1-2 day: $950 / 3-5 day: $1,000)" },
};
// ─── Environmental fees (per the 2026 rate sheet) ────────────────────
exports.ENV_FEES = {
    freon: 52.50, // per unit (AC, refrigerator, water dispenser, mini fridge, freezer)
    ewaste: 1.00, // per lb (TV, computer, etc.)
    mattressSingle: 50.00, // per mattress OR box spring
    mattressSet: 100.00, // mattress + box spring as a pair
    tire: 36.75, // standard with rim
    tireNoRim: 31.50,
    tireSemiTractor: 150.00,
    bike: 10.50,
    battery: 20.00, // car battery (golf-cart+ starts at $40 — handled in OTHER_RATES)
    dirtbike: 150.00, // starting
    motorcycle: 250.00, // moped / motorcycle, starting
    carTruck: 250.00, // car/truck removal starting
    fluorescentLight: 2.50, // per bulb
    wetPaint1gal: 25.00,
    wetPaint5gal: 75.00,
    waterHeater: 42.00,
    waterHeaterLarge: 90.00, // industrial, starting
};
exports.OTHER_RATES = {
    carpetDemo: 3.00, // per sq ft
    basketballHoop: 125.00,
    bedBugs: 600.00, // starting (job-specific quote required)
    carTowing: 200.00, // starting
    constructionDebris: 100.00, // additional
    golfCart: 250.00, // starting (or larger battery)
    greenWaste: 100.00, // additional per load
    haulingPerHour: 100.00, // per person per hour, 3-hour minimum
    hotTub: 500.00, // starting
    paintedConcrete: 400.00, // additional
    pianoRemoval: 250.00, // starting (piano size-dependent)
    fridgeCleanOut: 200.00, // when refrigerator has spoiled food
    shedDemo: 400.00, // starting (size-dependent)
};
// ─── Dump locations & per-ton rates ─────────────────────────────────
// Subset of dispatch_dump_locations that's commonly used by the junk
// side. The dispatch table holds the canonical address + minimum-tons
// per site; these are the rate-sheet defaults so the estimator can
// compute a quote without a DB roundtrip.
exports.DUMP_LOCATIONS = {
    "H-Power": { perTon: 100, label: "H-Power ($100/ton)" },
    "Keehi": { perTon: 124, label: "Keehi ($124/ton)" },
    "ABC": { perTon: 140, label: "ABC ($140/ton)" },
    "West Oahu": { perTon: 17, label: "West Oahu ($17/ton)" },
    "Hawaiian Earth": { perTon: 80, label: "Hawaiian Earth ($80/ton)" },
    "Metals": { perTon: 40, label: "Metals — credit $40/ton" },
    "PVT": { perTon: 105, label: "PVT ($105/ton)" },
    "Island Demo": { perTon: 90, label: "Island Demo ($90/ton)" },
};
// ─── Labor & weight ─────────────────────────────────────────────────
const FULL_TRUCK_LBS = 3500;
exports.LABOR_RATE = 100; // $/hour/person beyond the included
exports.INCLUDED_HOURS = 2; // hours of labor included in a full truck
exports.INCLUDED_CREW = 2; // people included in the labor pool
/** Hours of labor a full crew is expected to take per truck fraction. */
exports.LABOR_HOURS_BY_FRACTION = {
    None: 0,
    Empty: 0,
    Minimum: 0.5,
    "1/8": 0.5,
    "1/6": 0.5,
    "1/4": 0.75,
    "1/3": 1.0,
    "3/8": 1.0,
    "1/2": 1.25,
    "5/8": 1.5,
    "2/3": 1.5,
    "3/4": 1.75,
    "5/6": 1.75,
    "7/8": 2.0,
    Full: 2.0,
};
/** Multiplier applied on top of the base hours from LABOR_HOURS_BY_FRACTION. */
exports.DIFFICULTY_LABOR_MULTIPLIERS = {
    easy: 1.0,
    moderate: 1.3,
    difficult: 1.7,
};
/**
 * Auto-estimate labor hours for a given truck fraction + difficulty.
 * Multi-load aware: each full load adds 2 hours, then the remainder
 * fraction adds its own LABOR_HOURS_BY_FRACTION lookup. Returns a
 * value rounded to 0.1.
 */
function estimateLaborHours(truckFraction, truckFullLoads = 0, difficulty = "easy") {
    const fullLoads = Number(truckFullLoads) || 0;
    let baseHours = fullLoads * 2;
    const remainderKey = truckFraction || "None";
    if (remainderKey !== "None" && remainderKey !== "Empty") {
        baseHours += exports.LABOR_HOURS_BY_FRACTION[remainderKey] ?? exports.LABOR_HOURS_BY_FRACTION["1/2"];
    }
    const multiplier = exports.DIFFICULTY_LABOR_MULTIPLIERS[(difficulty || "easy")] ?? 1.0;
    return Math.round(baseHours * multiplier * 10) / 10;
}
/**
 * Cost of labor BEYOND the included 2hrs × 2-crew baseline.
 *   - Extra hours past the included 2 are billed at LABOR_RATE per
 *     person, for up to INCLUDED_CREW people.
 *   - Crew members beyond INCLUDED_CREW are billed at LABOR_RATE for
 *     all estimated hours (not just the extra portion).
 * Returns dollars, rounded to the cent.
 */
function calculateLaborCost(estimatedHours, crewSize = exports.INCLUDED_CREW) {
    const hours = Number(estimatedHours) || 0;
    const crew = Number(crewSize) || exports.INCLUDED_CREW;
    if (hours <= 0)
        return 0;
    const extraHours = Math.max(0, hours - exports.INCLUDED_HOURS);
    const extraCrew = Math.max(0, crew - exports.INCLUDED_CREW);
    const extraHoursCost = extraHours * Math.min(crew, exports.INCLUDED_CREW) * exports.LABOR_RATE;
    const extraCrewCost = hours * extraCrew * exports.LABOR_RATE;
    return Math.round((extraHoursCost + extraCrewCost) * 100) / 100;
}
// ─── Hawaii tax ─────────────────────────────────────────────────────
/** Decimal form, for multiplication (e.g. subtotal * HI_TAX_RATE). */
exports.HI_TAX_RATE = 0.04712;
/** Percentage form, for display (e.g. "Tax (4.712%)"). */
exports.HI_TAX_PERCENT = 4.712;
// ─── Free-Estimate closing bonus tiers (per the EOD repo) ───────────
// Bonus is paid to the tech who gave the FREE estimate, regardless
// of who did the removal. Est&Rem (estimate-and-removal combos)
// don't qualify for the bonus — only standalone free estimates.
//
// Monthly qualification: tech must close 30%+ of their decided
// estimates (won + lost + expired + cancelled) to earn ANY bonus.
// Open estimates don't count toward the ratio.
exports.ESTIMATE_BONUS_TIERS = [
    { min: 0, max: 500, bonus: 10 },
    { min: 500, max: 1000, bonus: 15 },
    { min: 1000, max: 2500, bonus: 25 },
    { min: 2500, max: 5000, bonus: 40 },
    { min: 5000, max: 10000, bonus: 60 },
    { min: 10000, max: 25000, bonus: 100 },
    { min: 25000, max: 50000, bonus: 150 },
    { min: 50000, max: Infinity, bonus: 200 },
];
exports.BONUS_QUALIFICATION_PCT = 0.30;
// ─── Helpers ────────────────────────────────────────────────────────
function estimateWeight(truckFraction, truckFullLoads) {
    const fracVal = exports.FRACTION_VALUES[truckFraction || "None"] || 0;
    const fullLoadLbs = (Number(truckFullLoads) || 0) * FULL_TRUCK_LBS;
    return Math.round(fracVal * FULL_TRUCK_LBS + fullLoadLbs);
}
function calculateDumpFee(location, weightLbs) {
    if (!location || !exports.DUMP_LOCATIONS[location])
        return 0;
    const tons = weightLbs / 2000;
    return Math.round(exports.DUMP_LOCATIONS[location].perTon * tons * 100) / 100;
}
/**
 * Bonus tier lookup. Returns the dollar payout for a single won
 * estimate at the given job revenue. The monthly qualification
 * percentage is enforced separately by the bonus calc job that
 * walks an estimator's monthly tracker history.
 */
function bonusForRevenue(jobRevenue) {
    for (const tier of exports.ESTIMATE_BONUS_TIERS) {
        if (jobRevenue >= tier.min && jobRevenue < tier.max)
            return tier.bonus;
    }
    return 0;
}
/**
 * The canonical junk-removal estimator. Returns a complete breakdown
 * so /q/[slug] can render every line item and /api/estimates can
 * persist the components alongside the headline total.
 *
 * Never throws — returns a zeroed result on bad input so the caller
 * doesn't have to wrap every render in try/catch.
 */
function calculateJunkEstimate(input) {
    try {
        const fraction = input.truckFraction || "None";
        const fullLoads = Number(input.truckFullLoads) || 0;
        let truckPrice = 0;
        if (fraction !== "None" && exports.LOAD_PRICES[fraction] != null) {
            truckPrice += exports.LOAD_PRICES[fraction];
        }
        if (fullLoads > 0)
            truckPrice += fullLoads * exports.LOAD_PRICES.Full;
        // Dumpsters use the 3-5 day (long) rate as the default estimate.
        const d15 = (Number(input.dumpster15Count) || 0) * exports.DUMPSTER_PRICES["15yd"].long;
        const d20 = (Number(input.dumpster20Count) || 0) * exports.DUMPSTER_PRICES["20yd"].long;
        const d25 = (Number(input.dumpster25Count) || 0) * exports.DUMPSTER_PRICES["25yd"].long;
        const d30 = (Number(input.dumpster30Count) || 0) * exports.DUMPSTER_PRICES["30yd"].long;
        const dumpsterPrice = d15 + d20 + d25 + d30;
        const basePrice = truckPrice + dumpsterPrice;
        const envBreakdown = {
            freon: (Number(input.freonCount) || 0) * exports.ENV_FEES.freon,
            ewaste: (Number(input.ewasteLbs) || 0) * exports.ENV_FEES.ewaste,
            mattressSingle: (Number(input.mattressSingleCount) || 0) * exports.ENV_FEES.mattressSingle,
            mattressSet: (Number(input.mattressSetCount) || 0) * exports.ENV_FEES.mattressSet,
            tireWithRim: (Number(input.tireWithRimCount) || 0) * exports.ENV_FEES.tire,
            tireNoRim: (Number(input.tireNoRimCount) || 0) * exports.ENV_FEES.tireNoRim,
            tireSemi: (Number(input.tireSemiCount) || 0) * exports.ENV_FEES.tireSemiTractor,
            bikes: (Number(input.bikeCount) || 0) * exports.ENV_FEES.bike,
            batteries: (Number(input.batteryCount) || 0) * exports.ENV_FEES.battery,
            dirtbikes: (Number(input.dirtbikeCount) || 0) * exports.ENV_FEES.dirtbike,
            motorcycles: (Number(input.motorcycleCount) || 0) * exports.ENV_FEES.motorcycle,
            carTruck: (Number(input.carTruckCount) || 0) * exports.ENV_FEES.carTruck,
            fluorescent: (Number(input.fluorescentCount) || 0) * exports.ENV_FEES.fluorescentLight,
            wetPaint1gal: (Number(input.wetPaint1galCount) || 0) * exports.ENV_FEES.wetPaint1gal,
            wetPaint5gal: (Number(input.wetPaint5galCount) || 0) * exports.ENV_FEES.wetPaint5gal,
            waterHeater: (Number(input.waterHeaterCount) || 0) * exports.ENV_FEES.waterHeater,
            waterHeaterLarge: (Number(input.waterHeaterLargeCount) || 0) * exports.ENV_FEES.waterHeaterLarge,
            greenWaste: (Number(input.greenWasteCount) || 0) * exports.OTHER_RATES.greenWaste,
            carpetDemo: (Number(input.carpetDemoSqft) || 0) * exports.OTHER_RATES.carpetDemo,
        };
        const envFees = Object.values(envBreakdown).reduce((s, v) => s + v, 0);
        // Labor — 2 hours of 2-person labor is included with a full truck.
        // Beyond that, $100/hr per extra person.
        //
        // If the caller didn't pass estimatedHours but DID pass a
        // difficulty, auto-estimate via the labor-difficulty model
        // (v0.3+, originally from Kilo). Explicit estimatedHours always
        // wins. Default difficulty is "easy" which produces the same
        // numbers as v0.2 for typical inputs (a Full truck on easy =
        // 2 hours = INCLUDED_HOURS, so labor cost stays $0).
        const crewSize = Number(input.crewSize) || exports.INCLUDED_CREW;
        const explicitHours = parseFloat(String(input.estimatedHours || "0")) || 0;
        const estimatedHours = explicitHours > 0
            ? explicitHours
            : (input.difficulty != null
                ? estimateLaborHours(input.truckFraction, input.truckFullLoads, input.difficulty)
                : 0);
        const laborCost = calculateLaborCost(estimatedHours, crewSize);
        const weightLbs = estimateWeight(fraction, input.truckFullLoads);
        // Dump fee is operational — Kanai's cost, never charged to the
        // customer. Computed here so the breakdown can show it to
        // dispatch for margin tracking, but explicitly EXCLUDED from
        // subtotal/tax/total. (Per business rule: estimated dump cost
        // is meaningless at quote time anyway — the real number comes
        // off the receipt at the dump after the job's done.)
        const dumpFee = calculateDumpFee(input.dumpLocation, Number(input.overrideWeight) || weightLbs);
        const discount = Number(input.discount) || 0;
        const subtotal = Math.max(0, basePrice + envFees + laborCost - discount);
        const tax = Math.round(subtotal * exports.HI_TAX_RATE * 100) / 100;
        const total = Math.round((subtotal + tax) * 100) / 100;
        return {
            basePrice, truckPrice, dumpsterPrice,
            envFees, envBreakdown,
            laborCost,
            dumpFee, weightLbs,
            discount, subtotal, tax, total,
        };
    }
    catch {
        return {
            basePrice: 0, truckPrice: 0, dumpsterPrice: 0,
            envFees: 0, envBreakdown: {},
            laborCost: 0,
            dumpFee: 0, weightLbs: 0,
            discount: 0, subtotal: 0, tax: 0, total: 0,
        };
    }
}
//# sourceMappingURL=junk.js.map