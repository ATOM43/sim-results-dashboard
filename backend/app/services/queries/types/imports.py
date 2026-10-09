from dataclasses import dataclass
from datetime import datetime

from .common import ResultSource

__all__ = ["ImportCounts", "ImportFile", "ImportStatus"]


@dataclass(frozen=True)
class ImportCounts:
    imported: int
    failed: int
    missing: int


@dataclass(frozen=True)
class ImportFile(ResultSource):
    error_message: str | None


@dataclass(frozen=True)
class ImportStatus:
    last_imported_at: datetime | None
    counts: ImportCounts
    files: list[ImportFile]
