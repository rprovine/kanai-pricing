# @kanai/pricing

Shared pricing constants and calculators for the Kanai ecosystem.

Single source of truth for:

- **Junk removal** — truckload pricing, environmental fees, other rates (carpet, hot tubs, etc.), dump-location per-ton rates, labor, Hawaii tax, free-estimate closing-bonus tier table, `calculateJunkEstimate()`.
- **Dumpster rental** — *follow-up*. Currently still in kanai-dispatch (`src/lib/pricing.ts`, `src/lib/stripe.ts`). Will land here in v0.2.

## Why this exists

Before this package, junk-pricing math was copy-pasted between:

- `kanai-estimator-form/src/lib/priceCalculations.js` (original)
- `kanai-dispatch/src/lib/junk-pricing.ts` (port with the `// Lifted from kanai-estimator-form…` header)

Drift was inevitable. Now both repos depend on this package; the math is byte-identical because it's the same compiled file.

## Install

```bash
npm install github:rprovine/kanai-pricing
```

Pinned to a commit (recommended for production):

```bash
npm install github:rprovine/kanai-pricing#<commit-sha>
```

## Use

```ts
import {
  calculateJunkEstimate,
  ENV_FEES,
  FRACTION_OPTIONS,
  LOAD_PRICES,
  DUMP_LOCATIONS,
  bonusForRevenue,
  type JunkEstimateInput,
  type JunkEstimateResult,
} from "@kanai/pricing";

const result = calculateJunkEstimate({
  truckFraction: "1/2",
  truckFullLoads: 0,
  mattressSingleCount: 2,
  freonCount: 1,
});
// → { total: 887.69, subtotal: 847.50, envFees: 152.50, ... }
```

## Consumers

| App | Where it imports from | Notes |
|---|---|---|
| **kanai-dispatch** | `@kanai/pricing` | On-site crew pricing sheet, estimate wizard, `/api/junk-pricing/calculate`, `CreateJobModal`. |
| **kanai-estimator-tool** (Kilo) | `@kanai/pricing` (planned) | Currently still on its local `priceCalculations.js`. Migration ticket: replace local copy with `import from "@kanai/pricing"` and delete the local file. |
| **kanai-estimator-form** | `@kanai/pricing` (planned) | Same story — replace `priceCalculations.js`. |
| **kanai-website** | `@kanai/pricing` (planned) | Chatbot quote estimator. |

## Versioning

Semver. Bump:

- **patch** — bug fix that doesn't change pricing (e.g. clamp-to-zero edge case)
- **minor** — new rates, new helpers, new exports (additive)
- **major** — rate changes that affect customer-facing totals, breaking type changes, removed exports

When rates change (annual rate-sheet revision), tag a release: `git tag pricing-v0.2.0 && git push --tags`. Then bump consumer apps to that tag.

## Local development

```bash
npm install
npm run build         # one-shot tsc compile to dist/
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
- Database access. This is pure math.
- Settings/override loaders (those live per-app since they read each app's DB).
- Anything that would require Node-only APIs — the package must work in browsers, Workers, and Node alike.
