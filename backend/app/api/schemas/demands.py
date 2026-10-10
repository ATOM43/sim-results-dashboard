from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from .common import NamedRef, Schema, Verdict

__all__ = ["DemandCreate", "DemandDetail", "DemandHistoryEntry", "DemandStatus", "DemandUpdate"]

DemandStatus = Literal["Open", "In Progress", "Resolved"]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class DemandCreate(BaseModel):
    """Either a finding (`origin_result_id`) or a manual (`component_id`) body.

    The ids are optional here so the route can answer a wrong combination with 400.
    """

    origin_type: Literal["finding", "manual"] | None = None
    origin_result_id: int | None = None
    component_id: int | None = None
    description: Description


class DemandUpdate(BaseModel):
    # Extra fields are kept so the route can reject them with 400 instead of dropping them.
    model_config = ConfigDict(extra="allow")

    description: Description | None = None
    status: DemandStatus | None = None


class DemandHistoryEntry(Schema):
    revision_id: int
    revision_label: str
    result_id: int | None
    peak_magnitude_mm: float | None
    verdict: Verdict | None


class DemandDetail(Schema):
    id: int
    description: str
    status: DemandStatus
    component: NamedRef
    project: NamedRef
    origin_type: Literal["finding", "manual"]
    origin_revision_label: str | None
    origin_metric: str | None
    origin_value_mm: float | None
    origin_frequency_hz: float | None
    origin_limit_mm: float | None
    origin_assess_max_hz: float | None
    origin_source_key: str | None
    created_at: datetime
    history: list[DemandHistoryEntry]
    latest_result: DemandHistoryEntry | None
    latest_passes_but_open: bool
