# Decisions

The choices worth questioning, the assumptions behind them, and what was left out.

## Open questions for a domain expert
I have no CAE background; each item is what the app does today and what I'd ask.

| Topic | What the app does | Question |
| --- | --- | --- |
| Data below 5 Hz | Files start at 5 Hz; existing samples are assessed. | Does "0–50 Hz" pass with nothing simulated below 5 Hz? |
| Grid mismatch | rev1 uses a slightly different grid (37.6 vs 37.8 Hz); flagged, not resampled. | Resample to a common grid, or is the shift a meshing artefact? |
| Project vs component | The CSVs are three components of one project ("Demo Product"). | Is each CSV its own project? Where does the project name come from? |
| Borderline | 15.0 mm and 50.0 Hz are inclusive, with no tolerance. | Should results near the limit be flagged as borderline? |

## Assessment
- Pass when the peak over 0–50 Hz inclusive is ≤ 15.0 mm. Samples above 50 Hz are plotted, never assessed.
- Measured samples only. Interpolating would invent the number being judged.
- No sample ≤ 50 Hz is an error, never a pass. Ties go to the lower frequency.
- Each result stores the limit and cutoff it was assessed with, so history stays correct if the rule changes.

## Data model
- Seven tables. `results (component_id, revision_id)` is unique, so a re-import updates a result in place and never duplicates it.
- Demands anchor to `component_id`, so one demand follows its component across revisions.
- Demand history is derived on read, never stored: a new revision joins it automatically and can't disagree with the results.
- The origin finding is frozen at creation, so re-importing rev1 doesn't change it.
- No auto-resolve. A later pass sets a "passes now, awaiting review" flag; only a user changes status.
- Constraints live in the database (CHECKs, foreign keys). `create_all` instead of Alembic: one schema version, no data to migrate.

## Ingestion
- The DB is the source of truth; the API never reads a CSV. `ingest_file` takes bytes, so a future upload reuses it.
- SHA-256 change detection: unchanged files are skipped, changed ones update in place.
- One transaction per file. A broken file is reported and skipped, and a broken re-import never erases the last good result.
- A removed file is marked missing, never deleted, because demands may point at its result.
- Errors name the file, row and reason. The CLI exits 1 on any failure and 2 if the folder is missing.
- Component images are the one static-file exception.
- Known limits: `source_files` has no project column; the import report lists every file (needs pagination at scale).

## Comparison
- Deltas and trends are computed on request, so they can never go stale.
- Grid mismatch is flagged, not resampled, because the assessed peak sits on the differing points.
- A missing result shows "No data", never a blank that reads as a pass.

## API and layering
- Thin routes, logic in `services/`, and services never import from `api/`. The CLI and API share the same code.
- 422 for a malformed request, 400 for a broken business rule (e.g. a demand from a passing result), 404 for unknown ids.
- Units are in field names (`peak_magnitude_mm`).

## Frontend
- Feature folders plus `shared/`. `api/` holds pure fetchers; each feature's `queries.ts` owns its hooks and keys.
- QueryClient defaults: `retry: 1`, recovery polling from 5 s backing off to 30 s, set once.
- The URL holds all selection, so every view is a shareable link. Server data lives in the query cache, with no client store.
- Bad or stale data is shown as such, never as a pass. Verdicts use icon plus word, never colour alone.
- Desktop-first: degrades at narrow widths, not redesigned for phones.

## Stack
- SQLite + sync SQLAlchemy for a single-user MVP. The path is Postgres + async.
- One row per sample. The scale path is columnar storage plus server-side downsampling (LTTB).
- Recharts over D3: the band, limit line and peak marker come built in.

## Left out on purpose
- Auth, deployment, migrations.
- File upload: an import can be triggered from the UI, but files can't be uploaded.
- The UI import re-syncs the configured folder only and takes no path, so the browser can't point the server at an arbitrary directory.

## Future improvements
- Versioned review rules; a project column on `source_files`; upload in the UI.
- Alembic, then Postgres; downsampled overlays; cached demand history.
- Borderline and no-change tolerances once an expert sets them.
- End-to-end browser tests (current tests use a mocked API).
