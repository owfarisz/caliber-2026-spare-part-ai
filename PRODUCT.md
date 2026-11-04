# Product context

## Purpose
An inventory planner uses this MVP to inspect synthetic spare-part issue history, compare demand forecasts, and test reorder decisions before operational review.

## Platform and stack
Web application for Vercel. React/Vite frontend, a small Python API, a bundled read-only SQLite case database, and an offline Python training pipeline. Stack choice delegated by the user's fully automatic instruction.

## Durable facts
- The CALIBER final-case data is synthetic.
- Material issue quantity is the measured demand target. Failure, downtime, actual receipt, and historical stockout outcomes are absent.
- Material inventory is one row per material, even when BoM maps it to multiple functional locations.
- The user needs a clear English dashboard, five representative material stories, a comprehensive interactive scenario page, and a technician-to-inventory demo PR path.
- Vendor rating is generated as an explicitly assumed demo input; source PR/PO history contains no formal performance score or multi-supplier comparison for one material.
- The insight graph is animated automatically to show source joins, model evidence and downstream decisions.
- Prototype submission calls for a Vercel MVP, SQLite, a source/database zip, and a timestamped deployed screenshot.

## Assumptions
- Primary user is an inventory planner or maintenance/procurement analyst; the case brief does not name a specific persona.
- Scenarios are decision support and do not persist writes in the deployed read-only database; demo PR drafts use browser session storage only.
- Desktop demo quality is the current priority; dedicated mobile improvements are deferred per user instruction.
