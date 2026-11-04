# CALIBER Spare Part Intelligence

An English-language decision-support MVP for the CALIBER 2026 final case. It forecasts **recorded material issues** for the next 30 days and lets a planner test stock-policy assumptions for one material at a time. The dashboard, scenario studio, and model-evidence page use the six supplied **curated** workbook tabs. The case data is synthetic.

## Run locally

Requirements: Python 3.12 or newer, Node 20 or newer. The deployed API uses only Python's standard library. To rebuild the model, install the separate offline dependencies:

```bash
python3 -m pip install -r requirements-train.txt
npm install
python3 -m pipeline.ingest
python3 -m pipeline.train
```

The included `data/caliber.sqlite`, `data/model_report.json`, and `data/model.joblib` are already generated. In two terminals, run:

```bash
python3 -m api.index
```

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite server proxies `/api` to the Python API at port 8000. Build the static site with `npm run build`. The Vercel config serves `dist` and the Python function from `api/index.py`, bundling read-only SQLite and the model report. Forecasts are calculated offline and stored per material; interactive scenarios use lightweight Python calculations at request time.

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

For 5,551 materials without observed issues, the site shows no trained forecast and requires manual 30-day quantity and occurrence estimates before simulating. The stock snapshot date is unknown. PR-to-promised-PO intervals are planning lead-time proxies, not actual receipts. There are no reliable open orders, historical stockout outcomes, verified criticality severity order, part-level maintenance requirements, or downtime costs. Use the outputs for planner review before changing an ERP policy.

## Checks and deployment

```bash
python3 -m unittest discover -s tests -v
npm run test:e2e
```

The Playwright smoke tests exercise all three pages and write screenshots to `output/qa/`. Deploy the project root with Vercel (`vercel --prod` after project authentication). Its SQLite file is read-only on the serverless runtime; scenario requests do not persist edits. The original case brief is available from the model-evidence page.

Project files are in `pipeline/` (ingest, feature engineering, tuning, evaluation), `core/` (stock policy), `api/` (read-only service), `web/` (UI), `data/` (generated database and report), and `tests/`.
