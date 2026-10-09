from datetime import datetime

from .common import ResultSource, Schema

__all__ = ["ImportCounts", "ImportFile", "ImportStatus"]


class ImportCounts(Schema):
    imported: int
    failed: int
    missing: int


class ImportFile(ResultSource):
    error_message: str | None


class ImportStatus(Schema):
    last_imported_at: datetime | None
    counts: ImportCounts
    files: list[ImportFile]
