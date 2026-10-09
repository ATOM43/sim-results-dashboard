# Decisions

Ingestion takes file contents, not paths, so the folder sync and a future UI upload share one validated code path. The database is the source of truth; raw files are kept only for audit and re-import.”

row-per-sample is chosen for queryability at this scale; at production scale you’d move to a time-series store or array storage, and the frontend would need downsampling like LTTB before the database does.

## Schema is created with `create_all`, no Alembic

Tables are created on startup with `Base.metadata.create_all()`. This is an MVP decision: there is one schema version and no deployed data to migrate. A schema change currently means deleting the database file and re-importing; Alembic is the next step once that stops being acceptable.
