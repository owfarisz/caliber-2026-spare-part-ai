# Product context

## Purpose
An inventory planner uses this MVP to inspect synthetic spare-part issue history, compare demand forecasts, and test reorder decisions before operational review.

## Platform and stack
Web application for Vercel. React/Vite frontend, a small Python API, a bundled read-only SQLite case database, and an offline Python training pipeline. Stack choice delegated by the user's fully automatic instruction.

## Durable facts
- The CALIBER final-case data is synthetic.
- Material issue quantity is the measured demand target. Failure, downtime, actual receipt, and historical stockout outcomes are absent.
- Material inventory is one row per material, even when BoM maps it to multiple functional locations.
- The user needs a clear English dashboard and a comprehensive interactive scenario page.
- Prototype submission calls for a Vercel MVP, SQLite, a source/database zip, and a timestamped deployed screenshot.

## Assumptions
- Primary user is an inventory planner or maintenance/procurement analyst; the case brief does not name a specific persona.
- Scenarios are decision support and do not persist writes in the deployed read-only database.
