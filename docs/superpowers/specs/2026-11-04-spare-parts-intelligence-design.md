# Spare Parts Intelligence MVP — design

## Intent
Give an inventory planner a defensible 30-day material-demand forecast and a transparent stock decision simulator for the synthetic CALIBER final case. The application must answer demand predictability and dynamic cost–availability tradeoffs, in English, with a live Vercel MVP backed by SQLite.

## Ground truth and limits
- Use the curated workbook tabs, preserving material-level stock separately from material–functional-location mappings.
- Forecast **material issue quantity**, not verified equipment failures or realized production loss. Keep all 17,518 issue rows, including exact-repeat candidates, in the authoritative case; run a deduplicated sensitivity case.
- Historical window is 2025-05-06 through 2026-09-30. The stock snapshot has no timestamp. Historical stock and actual receipt dates are absent.
- Maintenance plans have no direct material mapping. Notification orders are incomplete and one-to-many. Neither may create a material-demand label or future feature in backtesting.
- A/B/C/S criticality order and downtime consequences have no validated mapping. Never rank them numerically. Use an explicit scenario service target and optional user-entered outage cost.
- Mixed physical units and currencies must not be summed. Per-unit PO prices can be used only in their own currency, with a visible missing-price state.

## Approach and alternatives
Compare trailing-rate and TSB intermittent-demand forecasts with a compact global tree model trained on lagged, material-normalized issue history. Select by untouched time-based test performance, foregrounding normalized MAE, occurrence Brier score, bias, and cohort coverage. No LLM or elaborate architecture is needed for this structured, sparse data. Forecasting stays separate from a transparent reorder-policy calculation using demand uncertainty and user-supplied lead time and service target.

## Product
- **Overview:** synthetic-data disclosure, model validity card, demand and inventory-health distributions, ranked review queue, observed item details, provenance and caveats.
- **Scenario studio:** choose material; edit on-hand, lead time, review period, service target, demand multiplier, known planned demand, unit cost, annual holding rate, and optional stockout cost. Show forecast, demand interval, reorder point, safety stock, order-up-to, suggested order quantity, simulated shortage likelihood, and cost–risk curve. Changes recompute immediately and show assumptions.
- **Methodology:** data grains, cleaning rules, temporal backtest, model comparison, limitations, and source references.
- Search/filter tables; responsive desktop and mobile UI; real interactive API, not a static HTML mockup.

## Acceptance
- All six curated sources ingested into a reproducible SQLite database and reconciled to source row counts.
- No target leakage; training and test windows never overlap; test cohort eligibility uses history available at each cutoff.
- Model choice, tuning grid, time split, metrics, and per-unit/cohort results saved as artifacts.
- Scenario calculations have unit tests and remain monotonic for stock and demand changes where expected.
- Build, tests, browser smoke test, desktop/mobile visual inspection, and Vercel deployment checked. Source plus database zip and deployed timestamp screenshot if deployment credentials allow.
