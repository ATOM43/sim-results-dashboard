import json
from dataclasses import dataclass
from datetime import datetime

__all__ = ["ResultSource", "parse_warnings"]


def parse_warnings(text: str | None) -> list[str]:
    """`source_files.warnings` stores JSON text."""
    return json.loads(text or "[]")


@dataclass(frozen=True)
class ResultSource:
    source_key: str
    status: str
    warnings: list[str]
    last_imported_at: datetime
