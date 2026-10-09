from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

__all__ = ["ResultSource", "SampleOut", "Schema", "Verdict"]

Verdict = Literal["PASS", "FAIL"]


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SampleOut(Schema):
    frequency_hz: float
    magnitude_mm: float
    assessed: bool


class ResultSource(Schema):
    source_key: str
    status: str
    warnings: list[str]
    last_imported_at: datetime
