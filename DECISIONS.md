# Decisions

Ingestion takes file contents, not paths, so the folder sync and a future UI upload share one validated code path. The database is the source of truth; raw files are kept only for audit and re-import.”