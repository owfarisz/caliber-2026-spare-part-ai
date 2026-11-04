# Spare Parts Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a measured demand model and interactive inventory decision MVP for the CALIBER final case.

**Architecture:** Python offline pipeline reads curated XLSX, trains/evaluates models, and stores material forecasts and source views in SQLite. A small Python API reads that database and computes scenario policy; a Vite/React frontend displays overview, item detail, methodology, and simulator. Vercel hosts the frontend/API with a bundled read-only SQLite snapshot.

**Tech Stack:** Python 3.12, pandas, scikit-learn, SQLite standard library, React/Vite, CSS, Vercel Python functions.

**Spec:** `docs/superpowers/specs/2026-11-04-spare-parts-intelligence-design.md`

## Global Constraints

- Use curated tabs, not every tab.
- Never multiply material stock by BoM location count or issue quantity by notification join fan-out.
- Never mix UoM or currency in monetary/quantity totals.
- Label the synthetic data and distinguish assumed from observed values.
- Historical backtests use only fields known by each cutoff.

## Review Focus

- A material with no observed issue must show insufficient demand history, not zero risk.
- All quantity computations retain the material's unit.
- A non-IDR price must not enter IDR totals.
- Blank or impossible lead-time dates must not create negative lead times.
- Scenario input changes must recompute recommendations and remain bounded at zero.

## Tasks

### Task 1: Curated data pipeline
**Files:** `pipeline/xlsx_stream.py`, `pipeline/ingest.py`, `tests/test_ingest.py`, `data/caliber.sqlite`.
**Interfaces:** `iter_sheet(path, sheet_name) -> rows`; `build_database(dataset_dir, db_path) -> counts`.

- [ ] Write tests for shared strings, blank cells, Excel dates, source counts, and no stock fan-out.
- [ ] Run tests and observe expected failure.
- [ ] Implement streamed XLSX reads and normalized SQLite tables.
- [ ] Run tests and source reconciliation.

### Task 2: Forecast training and evidence
**Files:** `pipeline/forecast.py`, `pipeline/train.py`, `tests/test_forecast.py`, `data/model_report.json`, `data/model.joblib` or compact selected-model parameters.
**Interfaces:** `make_examples(issue_rows, cutoffs, horizon_days)`, `evaluate_candidates(...)`, `forecast_material(...)`.

- [ ] Write tests for cutoff leakage, sparse demand, baseline/TSB calculations, and metric denominators.
- [ ] Observe test failure.
- [ ] Implement temporal features, candidate comparison, validation tuning, final test, and current forecasts.
- [ ] Run tests and training; inspect cohort and unit-level results, repeat-row sensitivity.

### Task 3: Inventory policy and API
**Files:** `api/index.py`, `core/policy.py`, `tests/test_policy.py`, `tests/test_api.py`.
**Interfaces:** `recommend(forecast, empirical_demand, scenario) -> dict`; GET `/api/overview`, GET `/api/materials`, GET `/api/material/<id>`, POST `/api/scenario`.

- [ ] Write tests for stock, lead time, service target, missing cost, and input validation.
- [ ] Observe test failure.
- [ ] Implement transparent quantile/Monte Carlo policy using stored forecast and historic demand.
- [ ] Run tests and live API smoke checks.

### Task 4: Dashboard and scenario studio
**Files:** `web/src/*`, `web/package.json`, `vercel.json`, `README.md`.

- [ ] Write browser-oriented functional smoke checks for navigation, search, scenario updates, and no-data states.
- [ ] Observe failure before UI exists.
- [ ] Build responsive dashboard, simulator, and methodology with API data.
- [ ] Run build and smoke checks; inspect desktop/mobile screenshots and fix issues.

### Task 5: Delivery
**Files:** `output/caliber-source-and-database.zip`, `output/vercel-latest.png` if deployed.

- [ ] Verify full test/build/reconciliation suite and source files.
- [ ] Deploy to Vercel, check live API and UI, capture timestamp screenshot.
- [ ] Package complete source and SQLite database; document actual metrics and assumptions.
