"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUT_OF_DISTRICT_SURCHARGE = exports.MIXED_DEBRIS_SURCHARGE = exports.EXTENSION_RATE = exports.ROOFING_DUMP_RATE_PER_TON = exports.OVERAGE_RATE = exports.INCLUDED_TONS = exports.PROBUILT_INCLUDED_TONS = exports.SEVEN_YD_DEFAULT_PRICE = exports.SEVEN_YD_BY_MATERIAL = exports.PRICE_BY_AGREEMENT = void 0;
exports.priceForSevenYdByMaterial = priceForSevenYdByMaterial;
exports.priceFor = priceFor;
exports.isRevenueGeneratingType = isRevenueGeneratingType;
exports.includedTonsFor = includedTonsFor;
exports.calculateRentalTotal = calculateRentalTotal;
exports.calculateOverage = calculateOverage;
exports.calculateAgreementDumpFee = calculateAgreementDumpFee;
exports.calculateDumpCost = calculateDumpCost;
const junk_1 = require("./junk");
// ─── Rental price tables (base before tax) ─────────────────────────
exports.PRICE_BY_AGREEMENT = {
    residential: {
        "15yd": { short: 800, long: 850 },
        "20yd": { short: 850, long: 900 },
        "25yd": { short: 850, long: 900 },
        "30yd": { short: 950, long: 1000 },
    },
    construction: {
        "7yd": { short: 600, long: 675 },
        "15yd": { short: 900, long: 900 }, // all-day flat
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
    // Davey's — Jovoni Carbullido's tree service, agreement effective 08/20/26.
    // Covers ONE thing: the standing Friday 15yd green-waste bin, $950 for a 1-5
    // day rental (the agreement caps rentals at 5 days, so there is no long tier
    // — day 6 onward is the $50/day extension like everyone else). 2 tons
    // included and $180/ton after are already the house defaults, so the rate is
    // the only thing this agreement actually changes.
    //
    // The other sizes mirror RESIDENTIAL on purpose, and this is the important
    // line. Davey's covers the Friday 15s and nothing else, so picking it on a
    // 30yd must not silently reprice work the agreement never mentioned — and
    // Jovoni runs a lot of 30yd work billed residential today. Left undefined,
    // priceFor() falls through to CONSTRUCTION, which would quietly move his
    // 30yd from $950 to $1,000. That fallthrough is exactly how ProBuilt's 7yd
    // went out at the construction $675 against a dropdown quoting $990
    // (T1376). Mirroring residential makes selecting Davey's on a non-Friday
    // bin a no-op rather than a surprise.
    davey: {
        "15yd": { short: 950, long: 950 }, // the agreement
        // ── everything below is residential's row, not a negotiated rate ──
        "20yd": { short: 850, long: 900 },
        "25yd": { short: 850, long: 900 },
        "30yd": { short: 950, long: 1000 },
    },
    probuilt: {
        // ProBuilt Roofing — negotiated agreement effective 08/01/26.
        // ONE flat $990 across every size for a 1-5 day rental, 3 tons included on
        // each, $180/ton after. Structurally unlike the other flat tiers: roofing
        // and NAN bill every ton separately and include none, while ProBuilt is a
        // flat rate WITH an allowance, closer to residential but size-independent.
        // "Any size" includes the 7yd (Reno 2026-08-29). The other flat tiers let
        // 7yd fall through to construction because their structures genuinely stop
        // at 15yd; ProBuilt's does not, and the fallthrough was billing a 7yd at
        // the construction $600/$675 while the New Task dropdown offered $990 —
        // Tiony Laupapa T1376 went out invoiced at $990 against a schedule that
        // said $675.
        "7yd": { short: 990, long: 990 },
        "15yd": { short: 990, long: 990 },
        "20yd": { short: 990, long: 990 },
        "25yd": { short: 990, long: 990 },
        "30yd": { short: 990, long: 990 },
    },
};
// ─── 7yd material-specific pricing ─────────────────────────────────
// The public booking flow on kanai-website prices 7yd by material
// (not by agreement type), since a website customer hasn't picked an
// agreement yet. Concrete and dirt are heavier than household debris;
// roofing waste needs special routing. Anything else falls back to
// the construction 7yd base rate.
// One material per 7yd bin — aggregate never mixes (the dump site sorts +
// charges each type separately). Each heavy material is priced individually
// so the public booking flow quotes a per-material 7yd; renting more than one
// material means more than one 7yd bin.
exports.SEVEN_YD_BY_MATERIAL = {
    concrete: 450,
    asphalt: 450,
    dirt: 450,
    rock: 450,
    sand: 450,
    tile: 450,
    brick: 450,
    roofing: 500,
};
exports.SEVEN_YD_DEFAULT_PRICE = 400;
/**
 * Resolve a 7yd price from the customer's selected material. Falls
 * back to SEVEN_YD_DEFAULT_PRICE for unknown materials.
 */
function priceForSevenYdByMaterial(material, overrides) {
    if (!material)
        return overrides?.seven_yd_default ?? exports.SEVEN_YD_DEFAULT_PRICE;
    const table = overrides?.seven_yd_by_material ?? exports.SEVEN_YD_BY_MATERIAL;
    return table[material.toLowerCase()] ?? overrides?.seven_yd_default ?? exports.SEVEN_YD_DEFAULT_PRICE;
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
function priceFor(size, duration, agreement, overrides) {
    if (!size || !duration || !agreement)
        return null;
    const overrideTier = overrides?.[agreement]?.[size];
    let tier = overrideTier ?? exports.PRICE_BY_AGREEMENT[agreement]?.[size];
    // Fall back to construction's row when the chosen agreement doesn't
    // define one for this size (the 7yd case, primarily).
    if (!tier)
        tier = overrides?.construction?.[size] ?? exports.PRICE_BY_AGREEMENT.construction[size];
    if (!tier)
        return null;
    return duration === "long" ? tier.long : tier.short;
}
// ─── Revenue-generating task types ─────────────────────────────────
// Tasks that initiate a billable rental. Pickups, dumps, and live_loads
// either bill nothing or bill incrementally elsewhere.
const REVENUE_GENERATING_TYPES = new Set(["drop_off", "swap", "dump_and_return"]);
function isRevenueGeneratingType(taskType) {
    return !!taskType && REVENUE_GENERATING_TYPES.has(taskType);
}
// ─── Included tons by size ─────────────────────────────────────────
// Matches the agreement pricing tables and what's printed on the
// customer agreements.
/** ProBuilt's allowance is a flat 3 tons on 15/20/25/30 — not size-scaled. */
exports.PROBUILT_INCLUDED_TONS = 3;
exports.INCLUDED_TONS = {
    "7yd": 4,
    "15yd": 2,
    "20yd": 3,
    "25yd": 3,
    // 30yd dropped 5 -> 3 (Kana'i 2026-08-22). A 30 was the only size whose
    // allowance rose with volume, and a 30 filled with anything dense blew past
    // 5 tons routinely — the extra two tons were being given away on exactly the
    // loads that cost the most to dump. Overage ($180/ton) now starts at 3 like
    // the 20 and 25.
    //
    // Everything that bills or quotes tonnage reads includedTonsFor(), so the
    // overage auto-charge at completion, the AI's pricing answers and the
    // customer's overage SMS all follow from this line. Only the printed
    // agreement schedules state it in prose and had to be edited by hand.
    //
    // Not retroactive: overage is computed at completion and frozen into
    // dispatch_tasks.overage_fee, so rentals already closed keep what they were
    // billed. It applies to every 30yd completed from here on.
    "30yd": 3,
};
/**
 * Construction agreements include extra tonnage on 15yd. Roofing
 * and NAN have "dump fee separate" — we treat those as no overage
 * applies (dump cost passes through outside the rental price via
 * calculateAgreementDumpFee). 7yd is the exception: it always uses
 * construction tonnage rules even on a roofing/NAN agreement,
 * because the roofing/NAN flat-rate structures don't extend to 7yd.
 */
function includedTonsFor(size, customerType, materialType, agreementType, overrides) {
    const tons = (k) => overrides?.included_tons?.[k] ?? exports.INCLUDED_TONS[k] ?? 0;
    // ProBuilt is decided FIRST, ahead of both branches below.
    //
    // Ahead of the material check because they are a roofing company hauling
    // roofing debris, and that branch returns Infinity — every ton past the
    // allowance silently forgiven, the $180/ton their agreement charges never
    // billed.
    //
    // Ahead of the 7yd bypass because their allowance is size-independent: a 7yd
    // ProBuilt bin was taking the generic 7yd allowance of 4 tons against an
    // agreement that grants 3 on every size, the same way its price was taking
    // the construction 7yd rate against a flat $990.
    if (agreementType === "probuilt")
        return exports.PROBUILT_INCLUDED_TONS;
    // Davey's 15yd is 2 tons by contract. Pinned here, ahead of the branches
    // below, for the same reason ProBuilt is: both of them would otherwise be
    // decided by something other than the agreement. The material check returns
    // Infinity and would forgive every ton; the commercial/construction branch
    // would hand a 15yd 3 tons instead of 2. Jovoni hauls green waste on a
    // `standard` customer_type today, so neither fires — but the agreement's
    // number shouldn't depend on two unrelated fields staying put.
    //
    // Scoped to the 15yd deliberately. Davey's other sizes mirror residential
    // (see PRICE_BY_AGREEMENT) and must keep residential's allowances too — a
    // blanket 2 would quietly cut a Davey's 30yd from 3 tons to 2.
    if (agreementType === "davey" && size === "15yd")
        return tons("15yd");
    if (size === "7yd")
        return tons("7yd"); // construction-fallback bypass
    if (materialType === "roofing")
        return Number.POSITIVE_INFINITY;
    if (agreementType === "roofing" || agreementType === "nan")
        return Number.POSITIVE_INFINITY;
    if (customerType === "commercial" || customerType === "construction") {
        if (size === "15yd")
            return overrides?.included_tons_construction_15yd ?? 3;
    }
    return tons(size);
}
// ─── Rates + surcharges ────────────────────────────────────────────
exports.OVERAGE_RATE = 160;
exports.ROOFING_DUMP_RATE_PER_TON = 180;
exports.EXTENSION_RATE = 50;
exports.MIXED_DEBRIS_SURCHARGE = 150;
exports.OUT_OF_DISTRICT_SURCHARGE = 100;
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
function calculateRentalTotal(params) {
    const mixed = params.overrides?.mixed_debris_surcharge ?? exports.MIXED_DEBRIS_SURCHARGE;
    const ood = params.overrides?.out_of_district_surcharge ?? exports.OUT_OF_DISTRICT_SURCHARGE;
    const ext = params.overrides?.extension_rate ?? exports.EXTENSION_RATE;
    const taxRate = params.taxRate ?? params.overrides?.hi_tax_rate ?? junk_1.HI_TAX_RATE;
    const subtotal = params.rentalPrice +
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
function calculateOverage(size, tonsDumped, customerType, materialType, agreementType, overrides) {
    const included = includedTonsFor(size, customerType, materialType, agreementType, overrides);
    if (!Number.isFinite(included))
        return { overageTons: 0, overageFee: 0 };
    const overageTons = Math.max(0, tonsDumped - included);
    const rate = overrides?.overage_rate ?? exports.OVERAGE_RATE;
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
 *   - probuilt → 0, deliberately. Their $180/ton starts only AFTER the 3-ton
 *               allowance, so it is an OVERAGE (calculateOverage), not a
 *               per-ton pass-through. Adding them beside roofing here would
 *               bill every ton twice — once inside the flat $990 and again
 *               as a dump fee.
 *   - davey   → 0, for the identical reason: $180/ton starts after the 2-ton
 *               allowance on the Friday 15yd, so calculateOverage owns it.
 *
 * This is a DUMPSTER-side calculator. It runs at task completion and
 * the result IS customer-billable (unlike the junk-removal dump fee,
 * which is operational only). Do not confuse these two flows.
 */
function calculateAgreementDumpFee(params) {
    const agreement = params.agreement || "";
    const size = params.size || "";
    const tons = Number(params.tonsDumped || 0);
    if (size === "7yd")
        return 0;
    if (agreement === "roofing") {
        const rate = params.overrides?.roofing_dump_rate ?? exports.ROOFING_DUMP_RATE_PER_TON;
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
function calculateDumpCost(ratePerTon, tonsDumped, minimumTons = 0) {
    const billableTons = Math.max(tonsDumped, minimumTons);
    return Math.round(ratePerTon * billableTons * 100) / 100;
}
//# sourceMappingURL=dumpster.js.map