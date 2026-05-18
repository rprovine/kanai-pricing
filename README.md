# @kanai/pricing

Shared pricing constants and calculators for the Kanai ecosystem. Single source of truth for both junk-removal and dumpster-rental math, consumed by every Kanai app via `npm install`.

**Current version: 0.3.0** ([release tag](https://github.com/rprovine/kanai-pricing/releases/tag/pricing-v0.3.0))

## Why this exists

Before this package, the same pricing math was hand-ported between four repos:

- `kanai-dispatch/src/lib/junk-pricing.ts` + `src/lib/pricing.ts` + the pricing surface of `src/lib/stripe.ts`
- `kanai-estimator-form/src/lib/priceCalculations.js`
- `kanai-estimator-tool/src/utils/priceCalculator.js`
- inline tables inside `kanai-website/src/app/api/book/route.ts`

Drift was inevitable. Today every consumer depends on this package; the math is byte-identical because it's the same compiled file.

## What's in here

### Junk removal (`src/junk.ts`)

**Constants:**
- `LOAD_PRICES`, `FRACTION_VALUES`, `FRACTION_OPTIONS` — truckload rate table
- `DUMPSTER_PRICES` — kept here so the on-site estimator can quote a dumpster alongside a haul
- `ENV_FEES` — per-unit environmental disposal fees (freon, mattresses, tires, batteries, etc.)
- `OTHER_RATES` — carpet demo, hot tub, piano, towing, hauling-per-hour, etc.
- `DUMP_LOCATIONS` — per-ton rates for each dump site
- `LABOR_RATE`, `INCLUDED_HOURS`, `INCLUDED_CREW` — labor baseline
- `HI_TAX_RATE` (decimal `0.04712`) + `HI_TAX_PERCENT` (`4.712` for display)
- `ESTIMATE_BONUS_TIERS`, `BONUS_QUALIFICATION_PCT` — Free-Estimate closing-bonus payouts

**Labor-difficulty model** (promoted from Kilo in v0.3):
- `LABOR_HOURS_BY_FRACTION` — base hours per truck fraction
- `DIFFICULTY_LABOR_MULTIPLIERS` — `easy` 1.0 / `moderate` 1.3 / `difficult` 1.7
- `Difficulty` type
- `estimateLaborHours(truckFraction, truckFullLoads, difficulty)`
- `calculateLaborCost(estimatedHours, crewSize)`

**Functions:**
- `estimateWeight(truckFraction, truckFullLoads)` → lbs
- `calculateDumpFee(location, weightLbs)` → operational cost (junk-side; never customer-billed)
- `bonusForRevenue(jobRevenue)` → tech closing bonus
- `calculateJunkEstimate(input)` → full breakdown (basePrice, envFees, laborCost, dumpFee, subtotal, tax, total). Accepts optional `difficulty` — when set and `estimatedHours` isn't, hours auto-estimate from the labor-difficulty model.

> **Junk dump-fee rule (v0.2+):** `dumpFee` is **NEVER** rolled into `subtotal`/`tax`/`total`. The field is returned on the result for internal margin tracking only. Customers never see junk dump fees on any document. Real cost only known at the dump receipt after the job. **This rule does NOT apply to the dumpster module** — roofing/NAN per-ton dump fees there ARE customer-billable.

### Dumpster rental (`src/dumpster.ts`)

**Constants:**
- `AgreementType` — `'residential' | 'construction' | 'roofing' | 'government' | 'nan'`
- `PRICE_BY_AGREEMENT` — per-agreement / per-size rental table
- `SEVEN_YD_BY_MATERIAL`, `SEVEN_YD_DEFAULT_PRICE` — material-specific 7yd pricing for the public booking flow
- `INCLUDED_TONS`
- `OVERAGE_RATE` ($160/ton)
- `ROOFING_DUMP_RATE_PER_TON` ($180/T)
- `EXTENSION_RATE` ($50/day)
- `MIXED_DEBRIS_SURCHARGE` ($150)
- `OUT_OF_DISTRICT_SURCHARGE` ($100)

**Functions:**
- `priceFor(size, duration, agreement, overrides?)` — base rental, with the 7yd construction-fallback rule
- `priceForSevenYdByMaterial(material, overrides?)` — concrete/dirt/roofing/default
- `includedTonsFor(size, customerType?, materialType?, agreementType?, overrides?)` — with the construction-15yd bonus and the roofing/NAN dump-passthrough rule
- `calculateRentalTotal(params)` — base + surcharges + tax. **Takes tax in decimal form** (e.g. `0.04712`), not percentage.
- `calculateOverage(size, tonsDumped, ...)` — overage tons × rate
- `calculateAgreementDumpFee(params)` — roofing $180/T or NAN passthrough (customer-billable, unlike junk-side)
- `calculateDumpCost(ratePerTon, tonsDumped, minimumTons?)` — honors per-site minimum tons
- `isRevenueGeneratingType(taskType)` — which task types initiate a billable rental

All calculators accept an optional `overrides` object so apps that persist owner-configurable rates can pass them in without duplicating any math.

## Consumers

| App | Status | Notes |
|---|---|---|
| **kanai-dispatch** | ✅ v0.3 wired | `src/lib/pricing.ts` is a thin re-export shim. `src/lib/stripe.ts` keeps the Stripe SDK + a `calculateRentalTotal` wrapper that bridges dispatch's **percentage** tax convention (`HI_TAX_RATE = 4.712`, stored in DB columns) to the package's **decimal** convention. |
| **kanai-estimator-form** | ✅ v0.3 wired | `src/lib/priceCalculations.js` deleted. All calculations through `calculateJunkEstimate`. |
| **kanai-estimator-tool** (Kilo) | ✅ v0.3 wired | Sources labor-difficulty model + constants from package. Local `getBasePrice`, `estimateLaborHours`, `calculateFullEstimate` stay because they accept Kilo's structured `fraction` object with `{ label, value, fullLoads }` for multi-load labels (`"2 + 3/4"`). |
| **kanai-website** | ✅ v0.3 wired | `/api/book` uses `priceFor` + `priceForSevenYdByMaterial`. No inline pricing tables anywhere. |

## Tax-convention notes (important)

The package standardizes on **decimal** (`HI_TAX_RATE = 0.04712`). All package math expects decimal.

But **kanai-dispatch internally uses percentage** (`4.712`) because:
- DB columns (`dispatch_tasks.tax_rate`, `dispatch_settings.surcharge_overrides.hi_tax_rate`) store percentage values
- The settings UI edits the rate as a percentage with `%` suffix
- Three inline math sites (`/api/portal/extend`, `/api/invoices/generate`, `/invoice/[taskId]`) compute `subtotal * (HI_TAX_RATE / 100)`

So in dispatch: `HI_TAX_RATE` imported from `@/lib/stripe` is **4.712** (percentage), and the dispatch-local `calculateRentalTotal` wrapper converts percentage→decimal at the boundary before calling the package's calculator. Do not "fix" this without migrating every DB row and every caller.

In every other app (estimator-form, Kilo, website, package itself), use decimal directly.

## Install

```bash
npm install git+https://github.com/rprovine/kanai-pricing.git
```

Pinned to a specific release (recommended for production):

```bash
npm install git+https://github.com/rprovine/kanai-pricing.git#pricing-v0.3.0
```

**Use the explicit `git+https://` URL, not the `github:` short form.** Vercel's build environment doesn't carry an SSH key. `npm install github:rprovine/kanai-pricing` resolves to `git+ssh://` on a developer's machine (because they have SSH keys configured), then fails on Vercel with "Permission denied (publickey)". This applies to BOTH `package.json` AND the `package-lock.json`'s `resolved` field. If you see `git+ssh://` in the lockfile after a fresh `npm install`, run:

```bash
sed -i.bak 's|git+ssh://git@github.com/rprovine/kanai-pricing.git|git+https://github.com/rprovine/kanai-pricing.git|g' package-lock.json && rm package-lock.json.bak
```

## Use

```ts
import {
  // junk
  calculateJunkEstimate,
  estimateLaborHours,
  ENV_FEES,
  FRACTION_OPTIONS,
  // dumpster
  priceFor,
  priceForSevenYdByMaterial,
  calculateRentalTotal,
  calculateOverage,
  calculateAgreementDumpFee,
  // shared
  HI_TAX_RATE,
  HI_TAX_PERCENT,
  type AgreementType,
  type Difficulty,
} from "@kanai/pricing";

// Junk: full truck on moderate difficulty
const r = calculateJunkEstimate({
  truckFraction: "Full",
  difficulty: "moderate",
  mattressSetCount: 1,
});
// → { total: 1230.46, subtotal: 1175.00, laborCost: 120, envFees: 100, dumpFee: 0, ... }

// Dumpster: residential 20yd long
priceFor("20yd", "long", "residential"); // → 900

// Dumpster: 7yd concrete (public booking flow)
priceForSevenYdByMaterial("concrete"); // → 450

// Dumpster: rental total with surcharges
calculateRentalTotal({ rentalPrice: 850, mixedDebris: true });
// → { subtotal: 1000, tax: 47.12, total: 1047.12 }
```

## Versioning + release flow

Semver:

- **patch** — bug fix that doesn't change customer-facing pricing (e.g. clamp-to-zero edge case)
- **minor** — new exports, new helpers, new constants (additive)
- **major** — rate changes that affect customer totals, breaking type changes, removed exports

To bump rates:

1. Edit the relevant file in `src/`.
2. Bump version in `package.json`.
3. `git tag pricing-vX.Y.Z && git push --tags`.
4. In each consumer: `npm install git+https://github.com/rprovine/kanai-pricing.git#pricing-vX.Y.Z` to pin to the tag. (For now consumers track `main` unpinned, so a `main` commit rolls in on next install.)

## Local development

```bash
npm install
npm run build         # tsc compile to dist/
npm run typecheck     # tsc --noEmit
```

The `prepare` lifecycle runs `tsc` automatically when this package is installed as a git dependency, so consumers don't need to compile manually.

To test changes against a consumer locally:

```bash
cd /Users/renoprovine/Development/kanai-pricing
npm link

cd /Users/renoprovine/Development/kanai-dispatch
npm link @kanai/pricing
# now imports resolve to your local working copy
```

When done, `npm unlink @kanai/pricing` and reinstall to restore the git-URL dep.

## What does NOT belong here

- App-specific selectors, hooks, or React components.
- Database access — this is pure math.
- Settings/override loaders (per-app, since they read each app's DB).
- Anything that requires Node-only APIs — the package must work in browsers, Workers, and Node alike.
- Stripe SDK — per-app Node concern.

## Smoke-test values

For sanity-checking after refactors:

- `calculateJunkEstimate({ truckFraction: 'Full' })` → total **$1026.18** (980 + 4.712% tax). `dumpFee = 0` since no `dumpLocation`.
- `calculateJunkEstimate({ truckFraction: 'Full', dumpLocation: 'PVT' })` → total still **$1026.18** (dump fee internal-only, NEVER in customer total). `dumpFee = 183.75`.
- `calculateJunkEstimate({ truckFraction: 'Full', difficulty: 'moderate' })` → labor $120 added.
- `priceFor('20yd', 'long', 'residential')` → **$900**.
- `priceForSevenYdByMaterial('concrete')` → **$450**. Unknown material → **$400** default.
- `calculateRentalTotal({ rentalPrice: 850, mixedDebris: true })` → total **$1047.12**.
- `calculateOverage('20yd', 5, 'residential', null, 'residential')` → 2 over, **$320 fee**.
- `calculateAgreementDumpFee({ agreement: 'roofing', size: '20yd', tonsDumped: 3 })` → **$540** (customer-billable on dumpster-side, unlike junk dump fees).
