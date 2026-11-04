# CALIBER 2026 — development handoff

Last updated: 4 November 2026 (Asia/Jakarta). Working branch: **`dev`** in the nested Git repository at this project root. `main` contains the previously delivered baseline MVP. The `dev` branch contains the focused demonstration and workflow revision requested in the current session. Do not merge or deploy `dev` over production without reviewing the differences and refreshing screenshots.

## 1. What this project solves

CALIBER Case 03 asks for a practical spare-part decision-support prototype. The implementation forecasts **recorded material issues** over the next 30 days, estimates the chance of at least one issue, simulates inventory policy under editable assumptions, and explains a potential material request before inventory/procurement review. It does **not** predict verified equipment failures, actual downtime or realized savings, because those labels are not present in the supplied data.

The prior baseline already had a visually inspected case PDF, curated Excel ingestion, a tuned and evaluated intermittent-demand model, a read-only SQLite/API service, Vercel deployment, an overview dashboard, a what-if simulator, and a model-evidence page. This `dev` revision turns that model into a clearer judge-facing journey:

1. See **five distinct material stories** instead of a 7,481-item default queue.
2. Open **Predictive monitoring**, inspect a model-backed **AI decision brief**, change what-if assumptions and submit a demo PR draft.
3. In **Inventory review**, inspect the same draft, source-backed supplier/price history, an explicitly assumed demo vendor rating, a proposed unit-price band and negotiation dates; mark the draft ready or return it.
4. Follow the animated **Insight graph** from Excel source rows through material/BoM joins, demand model, policy decision and human review.
5. Open **Data continuity** for actual flagged record IDs, not a day-by-day replay.

The UI is in English because the case deliverable is English. User communication was in Indonesian. The user explicitly requested fully automatic execution and, later, said dedicated mobile work can wait; prioritize desktop demo quality.

## 2. Branch, repository and deployment state

- Project root: `/Users/owfaris/Documents/lomba/bcc/caliber/final without prd`.
- This root is a **new nested Git repository** so the unrelated parent `/Users/owfaris/Documents/lomba` repository is unaffected.
- Initial commit on `main`: `a91f85b baseline: calibrated spare-part intelligence MVP`.
- Requested work belongs on **`dev`**. Check `git status --short --branch` before editing. At the time of writing, this handoff is being finalized on `dev`.
- Previously deployed production baseline: `https://caliber-spare-part-intelligence.vercel.app`. This revision has **not** replaced that deployment. The separate public repository for this work is `https://github.com/owfarisz/caliber-2026-spare-part-ai`, with a self-contained GitHub Pages build from `dev` at `https://owfarisz.github.io/caliber-2026-spare-part-ai/`.
- The user-provided `AGENTS.md` points to `/Users/owfaris/.codex/RTK.md`; in this environment, prefix shell commands with `rtk` (for example, `rtk npm run build`).
- `.gitignore` excludes `output/`, `node_modules/`, `dist/`, `.vercel/`, test results, caches and `.DS_Store`. Screenshots under `output/qa/` are local QA artifacts and can be regenerated.

## 3. Source documents and data lineage

The case PDF is `CALIBER 2026 - Final Case Brief.pdf` at the project root. It was read with both text extraction and rendered-page inspection in the baseline work, because diagrams, frameworks, matrices and visual scoring elements should not be inferred from `pdftotext` alone. The revised code does not change that interpretation. Six synthetic QAQC workbooks are under `dataset/`; ingestion deliberately reads **curated** tabs only, not every worksheet:

| SQLite table | Curated Excel tab | Row grain | Rows |
|---|---|---|---:|
| `materials` | `CURATED_MATERIAL_STOCK` in BoM workbook | one material stock row | 7,481 |
| `bom_map` | `CURATED_BOM_MAP` in BoM workbook | one location–material mapping | 20,423 |
| `issues` | `CURATED_MOVEMENT` in Movement Material | one recorded material movement | 17,518 |
| `procurement` | `CURATED_PR_PO` in PR PO | one PR item | 6,189 |
| `locations` | `CURATED_FUNCLOC` in FuncLoc | one functional location | 14,484 |
| `maintenance` | `CURATED_MPLAN` in Mitem & Mplan | one maintenance item | 10,153 |
| `notifications` | `CURATED_NOTIF` in Notif History | one notification | 5,795 |

`pipeline/ingest.py` uses the dependency-free `pipeline/xlsx_stream.py` reader, checks these exact counts and preserves the native grains. A shared material's stock is counted once in `materials`, regardless of how many BoM locations map to it. The `source_counts` table records the source workbook filenames and row counts; dashboard aggregate charts and module counts use these tables. Avoid joining `materials` to `bom_map` and summing stock without grouping back to material grain.

The source PR/PO tab contains supplier name/code, PR date, requested date, PO promised delivery date, PR quantity, PO item amount and currency. It does **not** contain an actual receipt date, formal vendor performance rating or verified past-collaboration score. All 6,189 PR dates fall on or before the case decision date of 30 September 2026; the latest PR date is 22 September 2026. The demo uses `PO-Item Amount` as the dataset's per-unit IDR price reference (consistent with the baseline QAQC interpretation); verify its ERP semantics before real implementation. Never mix IDR with USD/JPY/EUR/SGD when deriving a price band.

## 4. Model and evaluation

Offline training is in `pipeline/forecast.py` and `pipeline/train.py`; the already generated outputs are `data/model.joblib`, `data/model_report.json` and `material_forecasts` in `data/caliber.sqlite`. The model's target is **30-day material issue quantity** and **probability of at least one issue**, not observed failure. Features at each cutoff use only prior issues. Current stock, procurement dates, notifications and future maintenance details are excluded from historical demand features to prevent leakage. A material enters backtesting only after its first observed issue.

Candidate comparison included always-zero, trailing issue rates, tuned TSB intermittent-demand probability, and a compact pooled gradient-boosted tree for expected quantity. Validation in June–July 2026 selected the **hybrid tree quantity + TSB occurrence probability** (tree `max_leaf_nodes=15`, TSB `alpha=0.005`, `beta=0.1`). The untouched August–September 2026 test used 3,719 material-cutoff examples:

| Metric | Hybrid | Interpretation |
|---|---:|---|
| Normalized MAE | 0.249910 | Lower is better; MAE divided by each material's historical mean positive issue-day quantity. Do not sum mixed physical units. |
| Brier score | 0.055984 | Lower is better; probability quality for any issue within 30 days. |
| F1 at fixed 0.50 threshold | 0.715376 | Diagnostic of occurrence classification, not the optimization objective. |
| Precision / recall at 0.50 | 0.738739 / 0.693446 | Threshold-specific diagnostics. |
| Normalized bias | −0.117452 | Negative means the model still underforecasts on average. |

The final fitted model uses available history through 30 September 2026 for an October 2026 case forecast. There are 1,930 materials with observed issues and 5,551 without. The latter cannot be called zero-demand: they have no trained forecast. The cold-start demo preloads an **assumed** 30-day quantity of 2 and any-issue probability of 0.35, visibly labeled as a demonstration input that must be replaced before operational use. The other featured material forecasts and issue-history charts come from the trained model/source.

`core/policy.py` is a transparent compound-Poisson **approximation** for a what-if stock decision, seeded deterministically for stable demos. It uses the model's occurrence probability/mean, material-specific observed positive issue-day sizes, editable stock, lead/review periods, target cycle service and known demand. It returns lead/protection risks, reorder point, safety stock, order-up-to, a model order quantity and a small cost-risk frontier. Count units round up to whole units. Cost claims require both a comparable IDR price and a **user-assumed** stockout penalty; no realized savings are claimed. PR-to-promised-PO days are only a **planning interval proxy**, not actual receipt lead time.

### Important policy conflict guardrail

For some high-demand materials the model's 95% service target yields an order-up-to level greater than the Excel `Max.Qty`. The model output remains visible, but `review_draft_qty` is capped to `max(0, existing Max − scenario stock)` for a Stock Item and `policy_conflict=true` is returned. The UI warns that the capped draft **does not meet** the modeled service target and requires inventory policy review; the technician cannot submit a larger draft through this demo button. Do not remove this distinction when refactoring. Tests cover it.

## 5. Five featured stories and why they were chosen

These are deliberately curated examples, **not** a random sample or an estimate of catalog-wide prevalence. The full material search remains for audit. IDs resolve to exact rows in the material master:

| Story | Material ID | Material | Source/model reason |
|---|---|---|---|
| Urgent replenishment | `4100091472` | Lithium grease NLGI 3, 16KG | Zero stock below Min; 112 issue days; model any-issue probability about 99.7%; 34 IDR PR rows. |
| Long lead exposure | `4100073394` | Insulating castable refractory 1600°C | Zero stock below Min; PR-to-promised interval about 71.5 days; 22 IDR PR rows. |
| Overstock review | `4100000924` | Ball bearing 7208BDB | 97 EA on hand versus Max 2 EA; sparse issue history; demonstration of holding/review rather than an automatic PR. |
| Active demand | `4200004671` | LED lamp 18W E27 | 156 issue days; stock 27 EA is within historical Min–Max; 55 IDR PR rows. |
| Cold start | `4100028090` | 1/2-inch CS pipe | No observed issue history; 2 LG on hand and 3 IDR PR rows; what-if requires explicit assumed demand/probability. |

The five choices are defined in `api/service.py::FOCUS` and exposed by `overview.focus_scenarios` and `GET /api?route=focus`. Each carries its source unit and a plain-language rationale. To replace a scenario, audit candidate stock, issue days, procurement history and limitations first; update the `FOCUS` constant, associated demo-rating fixture if needed, and tests/hand-off text together.

## 6. Supplier, rating, price and date logic

`api/service.py::supplier_advice` examines **same-material** PR/PO rows with `pr_date <= decision_date`. It restricts price comparisons to positive **IDR** item amounts. With at least three comparable rows, it proposes a unit-price negotiation band from the historical 25th percentile to median (linear interpolation, rounded to IDR); it is a target for discussion, **not** a quote or guaranteed achievable price. The observed min/max and sample count are returned for context. The historical PR-to-promised-date median is a planning proxy, never actual delivery performance.

The dataset has **zero materials with multiple IDR suppliers**. Therefore the service returns the most frequently observed same-material supplier as a **historical incumbent to quote**, not as a competitive winner. Alternative RFQs and supplier qualification are recommended before award. If no same-material IDR history exists, the service offers no target band and says to qualify a new supplier.

The user explicitly requested generated vendor ratings because the workbooks have none. `DEMO_VENDOR_EVALUATIONS` in `api/service.py` supplies five named incumbent ratings (3.9–4.6 out of 5) and collaboration notes as **synthetic assumed inputs**. These are separate from the Excel data, are labeled “Demo vendor rating / assumed input” in Inventory review, and do not pretend to measure actual on-time delivery, quality or partnership. With no same-material alternative vendor, they are context for what a future evaluative field could look like, not a ranking model. In real deployment, replace the fixture with an approved supplier scorecard and its provenance/date, and add actual receipts/quality events before performance scoring.

Negotiation dates are based on the **case decision date** (30 September 2026), not today's date. For `Reorder now`, the demo proposes 1–3 October 2026 for an RFQ start; for `Monitor`, 1–7 October for an optional price check; for overstock review, no purchase window. These are explicitly labeled planning heuristics, not contract deadlines or historical data. If the demo is reused after the case timeline, make the decision date editable and refresh the forecast before producing present-day advice.

## 7. UI pages and workflow state

`web/src/main.jsx` is the React/Vite single-page application; `web/src/styles.css` holds the existing warm operations-ledger design and new page styles. Routes use hashes:

| Route | Page | Data and interaction |
|---|---|---|
| `#/overview` | Overview | Excel-derived catalog, issue, stock-policy, procurement, category and source-count aggregates; issue activity bar chart, forecast-coverage donut, policy bars; five curated stories and AI decision brief. Full catalog is searchable. |
| `#/scenario` | Predictive monitoring | Five story tabs; material evidence, editable what-if, risk curve, model policy and an AI decision brief with material-request quantity. |
| `#/inventory` | Inventory review | Two model-generated example drafts on first browser session plus new technician drafts; source PR/PO aggregates, supplier/price/date advice and demo vendor ratings; local review status. |
| `#/graph` | Insight graph | Self-running, animated SVG data-lineage graph. Source counts, material join, equipment context, model output and human handoff are shown; pause/play and step buttons support a live demo. Motion is explanatory, not real-time ingestion. |
| `#/continuity` | Data continuity | Excel-derived counts and actual PR/item, movement source-row and functional-location IDs for anomalous dates, possible exact-repeat issues, and missing location criticality. No daily replay. |
| `#/method` | Model & evidence | Baselines, test metrics, time split, source counts and interpretation guardrails. |

The two initial inventory drafts are generated **from the same scenario model**, not hardcoded quantities, and labeled `Model-generated demo example`. On the local Python site the scenario API runs `core/policy.py`; on GitHub Pages `web/src/static-api.js` mirrors that policy with a deterministic browser-local simulation. The random-number generators differ, so sampled risk estimates may vary slightly even though assumptions and guardrails match. Technician-created drafts carry the current what-if quantity, forecast, risk and assumptions. If the model says `Monitor`, a positive quantity is labeled a technician manual override; if stock is above the existing Max, this demo holds purchasing and disables PR creation. State persists in `sessionStorage` for that browser session only (`caliber-demo-drafts`, `caliber-drafts-seeded`, `caliber-material`). Inventory statuses `Pending inventory review`, `Ready for procurement check` and `Returned to technician` are prototype labels. There is no authenticated workflow, database write, real PR issuance or SAP integration. Do not present the button as actual submission.

All explanatory AI panels use the requested copy: **“AI decision brief”** and **“✦ AI-assisted, explainable recommendation”**. These summaries are deterministic, evidence-based text, not claims that a generative language model independently verified the business recommendation.

The Insight graph uses source-backed counts from `source_counts`, the first focus material's model output, and a step timer. Its equipment-context edge means a BoM location can connect to maintenance and notifications; those records provide context only. Maintenance plans lack direct part requirements, notifications do not prove failure, and unvalidated A/B/C/S criticality codes are not used as severity weights. Playwright verifies autoplay advances and pause works.

## 8. Continuity logic and record safety

`api/service.py::continuity` calculates:

- **2** PR items with promised PO date before PR date. Such intervals are excluded from lead-time proxy computation; source records are not deleted.
- **324** PR items with requested date before PR creation. These may reflect late PR entry rather than an error and require workflow verification.
- **863** extra exact-repeat movement rows under a source-field grouping. Because no unique transaction ID establishes whether they are true duplicates, they remain in the authoritative issue history. The model report separately measures forecast sensitivity to hypothetical removal: 400 of 1,930 modeled materials change, 205 by at least 10%.
- **33** functional-location records without criticality. Their severity stays unclassified; no A/B/C/S ordering is invented.

The endpoint returns only a short exception queue with source identifiers, evidence and a recommended investigation. This is an exception lens, not an automated correction pipeline.

## 9. API contracts and code map

`api/index.py` is the Python standard-library HTTP handler used locally and on Vercel. `api/service.py` uses a read-only SQLite URI (`mode=ro`). Important endpoints:

| Method + route | Payload / purpose |
|---|---|
| `GET /api?route=overview` | Source counts, dashboard aggregates, focus stories, procurement health, model report excerpt. |
| `GET /api?route=materials&q=...&limit=...` | Search material master. |
| `GET /api?route=material&id=...` | Material, observed demand history, BoM/maintenance context and model forecast. |
| `GET /api?route=focus` | The five featured material stories. |
| `GET /api?route=supplier&id=...&decision_date=2026-09-30&action=Reorder%20now` | Same-material sourcing evidence, demo rating, IDR band, planning date window and caveat. |
| `GET /api?route=continuity` | Record-level exception counts and sample records. |
| `POST /api?route=scenario` | JSON `{ "material_id": "...", "scenario": { ... } }`; returns model-based policy, risk curve, order quantity, `review_draft_qty` and conflict flag. |

Other key paths:

- `pipeline/ingest.py`: curated-tab mapping, schema, reconciliation.
- `pipeline/xlsx_stream.py`: streaming XLSX reader using the standard library.
- `pipeline/forecast.py`, `pipeline/train.py`: causal feature windows, candidate fitting, temporal evaluation, report and final forecast generation.
- `core/policy.py`: what-if policy and conflict guardrail.
- `data/caliber.sqlite`, `data/model_report.json`, `data/model.joblib`: generated artifacts already included.
- `tests/`: Python ingestion, model, policy and service tests.
- `web/tests/smoke.spec.js`: Playwright browser journeys and screenshots.
- `playwright.config.js`, `vite.config.js`, `vercel.json`: local/browser/deployment wiring.
- `scripts/audit_focus.py`: read-only candidate audit used to choose five materials; can rerun to inspect source distributions.
- `scripts/export_static.py`, `web/public/case-data.json`, `web/src/static-api.js`: generated snapshot and browser-local API/policy for GitHub Pages. Refresh the JSON after changing source data or backend logic.
- `.github/workflows/pages.yml`: builds and deploys the `dev` branch to the separate public GitHub Pages site.
- `docs/superpowers/2026-11-04-dev-workflow-plan.md`: implementation plan and acceptance criteria for this revision.
- `README.md`, `PRODUCT.md`, `DESIGN.md`, `SUBMISSION.md`: baseline project context; update them if the revision becomes the new delivered baseline.

## 10. Reproducing and verifying

The checked-in data artifacts are sufficient for the web demo. In this Codex environment, use the `rtk` prefix:

```bash
rtk npm install
rtk python3 -m api.index
```

In a second terminal:

```bash
rtk npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to Python on port 8000. For verification:

```bash
rtk python3 -m unittest discover -s tests -v
rtk npm run build
rtk npm run test:e2e
rtk git status --short --branch
```

The Python suite covers causal feature boundaries, zero-demand behavior, scenario monotonicity and max-policy draft guardrail, source-grain reconciliation, vendor evidence and continuity anomalies. Playwright exercises overview, simulator, methodology, desktop/mobile smoke, technician-to-inventory PR handoff, overstock/cold-start stories, continuity and graph autoplay/pause. Screenshots are regenerated in `output/qa/`. Inspect desktop captures visually after changing UI; mobile-specific refinement is deferred per user instruction.

For the public static demo, regenerate and verify the exported case snapshot:

```bash
rtk python3 scripts/export_static.py
rtk proxy env VITE_STATIC_DEMO=true VITE_SITE_BASE=/caliber-2026-spare-part-ai/ npm run build
rtk proxy env VITE_STATIC_DEMO=true npm run test:e2e
```

The JSON export contains source-derived aggregates and the five featured material details. Its model forecasts were trained offline. Pages offers those five in search; the full 7,481-material catalog remains in SQLite for local/API use. The static simulator runs with a seeded 4,000-draw compound-Poisson approximation and the Python policy's stock caps/conflict logic. Supplier ratings remain visibly synthetic assumptions. The Pages workflow triggers on `dev` push and deploys under `/caliber-2026-spare-part-ai/`; check the GitHub Actions run, Pages settings and a public HTTP 200 after publishing.

To rebuild the offline model, use the appropriate Python version/environment and `requirements-train.txt`, then run `rtk python3 -m pipeline.ingest` and `rtk python3 -m pipeline.train`. This overwrites generated data/model artifacts; compare row counts and untouched-test metrics before committing. Do not rerun training casually merely to change UI.

## 11. Known limitations and safe next steps

1. The source is synthetic and the stock snapshot lacks a timestamp. Refresh from ERP before operational use.
2. Historical issue movement is a demand proxy; it may be affected by stockout censoring and repeat-row ambiguity. There is no measured failure/downtime or stockout label.
3. The 95% cycle-service target and compound-Poisson approximation are policy assumptions, not calibrated service-outcome guarantees. The model has negative test bias; consider conservative planner review and prospective monitoring.
4. No actual receipt dates, open orders, supplier capacity, MOQ/pack size, verified vendor scorecard or contract prices are supplied. These are required before production PR automation or supplier ranking.
5. The five material stories are intentionally selected for narrative coverage, not statistical representativeness. Do not infer catalog-wide rates from them.
6. Vendor ratings and collaboration notes are generated demo assumptions. Replace them with governed source fields and rating dates; preserve “assumed” labeling until then.
7. Browser `sessionStorage` is demonstration state; it has no cross-user consistency, audit trail or server persistence. A real PR flow needs authenticated roles, revision history, API write controls and ERP confirmation.
8. The negotiation date range is anchored to the Sep 2026 case timeline. For a live date, refresh demand and supply data first.
9. Visual mobile polishing is intentionally deferred. Desktop is the judge-facing priority; existing responsive layout remains usable for smoke tests.
10. Production Vercel still serves the baseline. The independent GitHub Pages demo publishes the `dev` source without changing that deployment. Verify the public Pages route and static JSON after each data refresh.

## 12. Immediate continuation checklist

1. Confirm `dev` branch, remote URL and clean commit state.
2. Run the Python, standard frontend and static Pages checks above; inspect `output/qa/overview-desktop.png`, `scenario-desktop.png`, `inventory-desktop.png`, `continuity-desktop.png`, and `graph-desktop.png` after UI changes.
3. If any data assertion changes, verify the corresponding curated Excel tab, regenerate `web/public/case-data.json`, and maintain source-vs-assumption labels.
4. Keep all requested revisions on `dev`; leave the unrelated `owfarisz/caliber-final` repository and the existing production Vercel deployment untouched.
