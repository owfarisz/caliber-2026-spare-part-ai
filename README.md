# CALIBER Spare Part Intelligence

An English-language decision-support MVP for the CALIBER 2026 final case. It forecasts **recorded material issues** for the next 30 days, tests stock-policy assumptions, and demonstrates a technician-to-inventory PR review. The overview, predictive-monitoring, inventory, insight-graph, continuity and model-evidence pages use the six supplied **curated** workbook tabs. The case data is synthetic; vendor ratings and PR drafts are explicitly labeled demo assumptions/examples. For the full `dev` revision handoff, read [`handoff.md`](handoff.md).

## Run locally

Requirements: Python 3.12 or newer, Node 20 or newer. The deployed API uses only Python's standard library. To rebuild the model, install the separate offline dependencies:

```bash
rtk python3 -m pip install -r requirements-train.txt
rtk npm install
rtk python3 -m pipeline.ingest
rtk python3 -m pipeline.train
```

The included `data/caliber.sqlite`, `data/model_report.json`, and `data/model.joblib` are already generated. In this environment, prefix commands with `rtk` per `AGENTS.md`. For the full local API, run these in two terminals:

```bash
rtk python3 -m api.index
```

```bash
rtk npm run dev
```

Open `http://127.0.0.1:5173`. The Vite server proxies `/api` to the Python API at port 8000. The optional Vercel config serves `dist` and a read-only Python function. Forecasts are calculated offline and stored per material; interactive scenarios use lightweight policy calculations at request time.

## Public GitHub Pages demo

The `dev` branch publishes a self-contained demo at [GitHub Pages](https://owfarisz.github.io/caliber-2026-spare-part-ai/) from the [new project repository](https://github.com/owfarisz/caliber-2026-spare-part-ai). The Pages build uses `VITE_STATIC_DEMO=true`: `scripts/export_static.py` exports the Excel-derived overview, continuity exceptions, five featured material records, model evidence, and supplier advice to `web/public/case-data.json`. The browser runs a deterministic mirror of the Python inventory-policy simulator in `web/src/static-api.js`. No Python API or Vercel login is needed for the public demo. The full source SQLite catalog remains in the repository; the Pages search intentionally offers only the five judge-facing stories and labels that limit in the UI.

To refresh the published data after changing ingestion, forecasts, or sourcing logic, run `rtk python3 scripts/export_static.py`, inspect the JSON/source labels, then run `rtk proxy env VITE_STATIC_DEMO=true VITE_SITE_BASE=/caliber-2026-spare-part-ai/ npm run build` and `rtk proxy env VITE_STATIC_DEMO=true npm run test:e2e`. Commit the refreshed JSON on `dev`; `.github/workflows/pages.yml` deploys it on push. The browser simulator uses the same policy assumptions and safeguards as Python but a different deterministic random-number generator, so individual Monte Carlo risk estimates can differ slightly. The public site is a case-timeline demo, not a live ERP system. This deployment does not replace the existing Vercel production baseline.

## Evidence and model choice

The data loader reads only `CURATED_MATERIAL_STOCK`, `CURATED_BOM_MAP`, `CURATED_FUNCLOC`, `CURATED_MOVEMENT`, `CURATED_PR_PO`, `CURATED_NOTIF`, and `CURATED_MPLAN`. It preserves their different grains in SQLite and reconciles row counts. The 7,481 material stock records are never multiplied by the 20,423 location-part mappings. The movement tab contributes 17,518 issue rows through 30 September 2026; exact repeated rows remain authoritative because no movement transaction ID proves duplication. A separate sensitivity analysis removes them hypothetically.

The target is 30-day material issue quantity and the probability of at least one issue. Only materials with an issue **before** a forecast cutoff enter backtesting. Features use events strictly before that cutoff; current stock, procurement promises, notifications, and future maintenance plans are not leaked into demand training. The comparison covers a zero forecast, trailing rates, tuned Teunter–Syntetos–Babai (TSB), and a pooled two-stage gradient-boosted tree. Validation (June–July 2026) selects a hybrid: the tree's expected quantity plus TSB's occurrence probability. The untouched test is August–September 2026, across 3,719 material-cutoff observations. The final model is refit on available history for an October 2026 forecast.

| Test metric | Selected hybrid | Always zero | Trailing 90 days |
|---|---:|---:|---:|
| Normalized MAE ↓ | **0.250** | 0.264 | 0.298 |
| Brier score ↓ | **0.056** | 0.127 | 0.068 |
| F1 at 50% threshold ↑ | **0.715** | 0.000 | 0.655 |
| Normalized bias | −0.117 | −0.264 | +0.037 |

Normalized MAE divides each material-cutoff absolute error by that material's historical mean positive issue-day size before averaging; it avoids adding kilograms, pieces, and litres. The model improves error and occurrence quality over these baselines but still **underforecasts on average**. F1 is a diagnostic for whether any issue occurs at a fixed 50% cutoff, not a stock-policy objective. `data/model_report.json` contains all candidates, split counts, definitions, and unit-specific diagnostics.

## Scenario interpretation

The simulator accepts on-hand stock, lead/review days, target cycle service, demand intensity, and confirmed demand. It samples an intermittent lead-demand distribution from the chosen forecast and observed material-specific issue-day sizes, then reports a reorder point, safety stock, order-up-to level, order quantity, and modeled shortage risks. Count-unit policy levels and order quantities round up to whole units. An optional IDR unit price and **user-assumed** stockout penalty enable an illustrative cost frontier across selected stock levels; it is not a measured savings estimate or a proven global optimum. The same material's stock is counted once across all mapped locations.

For 5,551 materials without observed issues, the site shows no trained forecast and requires manual 30-day quantity and occurrence estimates before operational use. The featured cold-start scenario preloads **demo assumptions** of 2 units and 0.35 any-issue probability for an intuitive what-if demonstration. The stock snapshot date is unknown. PR-to-promised-PO intervals are planning lead-time proxies, not actual receipts. There are no reliable open orders, historical stockout outcomes, verified criticality severity order, part-level maintenance requirements, or downtime costs. Use the outputs for planner review before changing an ERP policy.

Five source-backed material stories now guide the demo: urgent replenishment, long-lead exposure, overstock review, active demand, and cold start. The scenario page shows an AI decision brief and can create a browser-only PR draft. A draft is capped under the existing Max when the modeled target conflicts with that policy; inventory sees the conflict and reviews the request. Supplier advice uses same-material IDR PR/PO history and a clearly assumed demo rating. Since no material has more than one observed IDR supplier, the historical incumbent is a quote candidate, not a competitive winner. The proposed price band is the historical 25th percentile to median; negotiation dates are a case-timeline planning heuristic. The continuity page lists actual flagged record IDs. The animated graph explains joins and downstream decisions, not real-time plant activity.

## Checks and deployment

```bash
rtk python3 -m unittest discover -s tests -v
rtk npm run build
rtk npm run test:e2e
```

The Playwright tests exercise the six-page workflow and write screenshots to `output/qa/`. The existing Vercel production site still serves the baseline. SQLite is read-only on the optional Python runtime; GitHub Pages uses a generated JSON snapshot. Neither mode persists scenario edits, and demo PR state remains in the browser session. The original case brief is available from the model-evidence page.

Project files are in `pipeline/` (ingest, feature engineering, tuning, evaluation), `core/` (stock policy), `api/` (read-only service), `web/` (UI), `data/` (generated database and report), and `tests/`.
