# CALIBER 2026 final-case handoff

- Live production MVP: https://caliber-spare-part-intelligence.vercel.app
- Source, curated workbooks, trained model, and SQLite database: `output/CALIBER2026-source-and-database.zip`
- Archive SHA-256: see `output/archive-manifest.json`
- Timestamped live screenshots: `output/qa/live-overview-timestamped.png` and `output/qa/live-scenario-timestamped.png`
- Method and implementation instructions: `README.md`

The MVP forecasts 30-day **material issue demand**, not confirmed failures or downtime. On the untouched August–September 2026 test (3,719 material-cutoff examples), the selected hybrid achieved normalized MAE **0.250**, Brier score **0.056**, and occurrence F1 at a 50% threshold **0.715**. The model underforecasts on average (normalized bias **−0.117**). The scenario page is a decision aid using explicit assumptions, not a live ERP writeback or a measured savings claim.

The source ZIP includes the original case PDF and six curated QAQC workbooks. The running Vercel function bundles a read-only SQLite database; the offline training pipeline can regenerate the model and report from the curated workbooks.
