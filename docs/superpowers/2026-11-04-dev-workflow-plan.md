# Dev revision plan — focused decision workflow

## User outcome
Make the CALIBER case demonstrable in five representative material scenarios, with populated Excel-derived module aggregates, model-backed technician recommendations, a browser-only PR draft handoff to inventory, evidence-bounded vendor and price negotiation advice, and record-level continuity anomalies. Deliver a comprehensive `handoff.md` on a new `dev` branch.

## Data and claim boundaries
- The seven SQLite tables preserve curated Excel grains. Their aggregate counts and charts are source-derived; only forecast, risk, and suggested order quantities come from the trained model and policy simulator.
- The five featured materials are curated examples, not a statistical sample of all 7,481 materials. Keep catalog search for audit but foreground only five.
- No actual receipt, vendor performance rating, multi-vendor comparison per material, open PO, MOQ, live stock timestamp, or measured downtime exists. An observed supplier is an incumbent candidate, never a verified winner. A price target is an historical IDR unit-price interquartile/median planning band, not a quoted or guaranteed price.
- Example PR drafts are generated from model outputs and persist in the browser only. They are not submitted to an ERP.
- Dates are explicitly anchored to the case decision date of 30 Sep 2026; the negotiation window is a planning heuristic and should be labeled as such.

## Build sequence
1. Add failing service tests for focus stories, supplier evidence, negotiation window and continuity records. Use deterministic queries and calculations.
2. Implement read-only service endpoints; make the API return the same fields used across modules and ensure no cross-currency price pooling.
3. Add focused dashboard and predictive-monitoring/what-if journey. Technician can create a PR draft from the current simulation, with a high-visibility brief.
4. Add inventory review of example/new drafts, supplier and negotiation evidence, and local-only review state. Add continuity anomaly cards/records instead of replay.
5. Verify Python tests, frontend build, Playwright journeys, visual desktop/mobile captures, then write complete handoff and commit on `dev`.

## Acceptance
- Five material chips all load; dashboard charts have nonempty source values and visible provenance.
- Predictive monitoring and scenario changes update the recommendation and PR quantity. Inventory receives draft with same material and quantity; can review and label status.
- Supplier panel never calls historical procurement a supplier performance rating; missing rating is clear. A same-currency IDR price band and proposed negotiation date range appear where supported.
- Continuity lists actual anomaly record identifiers with counts and source fields, no daily replay.
- The model's test metrics and known limitations remain visible.
