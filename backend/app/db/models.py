from datetime import UTC, datetime

from sqlalchemy import (
    REAL,
    CheckConstraint,
    Dialect,
    ForeignKey,
    Index,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware datetime stored as ISO-8601 UTC text."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime is not allowed; use a timezone-aware value")
        return value.astimezone(UTC).isoformat()

    def process_result_value(self, value: str | None, dialect: Dialect) -> datetime | None:
        return None if value is None else datetime.fromisoformat(value)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)

    components: Mapped[list["Component"]] = relationship(back_populates="project")
    revisions: Mapped[list["Revision"]] = relationship(back_populates="project")


class Component(Base):
    __tablename__ = "components"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="components")
    results: Mapped[list["Result"]] = relationship(back_populates="component")
    demands: Mapped[list["Demand"]] = relationship(back_populates="component")


class Revision(Base):
    __tablename__ = "revisions"
    __table_args__ = (UniqueConstraint("project_id", "label"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    label: Mapped[str] = mapped_column(Text)
    sort_key: Mapped[int]

    project: Mapped[Project] = relationship(back_populates="revisions")


class SourceFile(Base):
    """A CSV that was offered for import.

    `source_key` is the logical identity (`rev2/Bracket.csv`), not the physical path, so a
    re-upload for the same component and revision counts as a change, not a duplicate.

    A CSV that disappears from `Inputs/` gets status `missing`; its row is kept.
    """

    __tablename__ = "source_files"
    __table_args__ = (
        CheckConstraint("source_type IN ('folder','upload')", name="ck_source_files_source_type"),
        CheckConstraint("status IN ('imported','failed','missing')", name="ck_source_files_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(Text)
    source_key: Mapped[str] = mapped_column(Text, unique=True)
    original_filename: Mapped[str] = mapped_column(Text)
    stored_path: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int]
    status: Mapped[str] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    warnings: Mapped[str | None] = mapped_column(Text)
    first_imported_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_imported_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Result(Base):
    """The assessed outcome of one component in one revision.

    The component and the revision must belong to the same project. SQL cannot enforce
    this; the ingestion service checks it.

    A result and its samples are never deleted when the source CSV goes missing, because
    demands reference them.
    """

    __tablename__ = "results"
    __table_args__ = (
        UniqueConstraint("component_id", "revision_id"),
        CheckConstraint("verdict IN ('PASS','FAIL')", name="ck_results_verdict"),
        Index("idx_results_revision", "revision_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    component_id: Mapped[int] = mapped_column(ForeignKey("components.id"))
    revision_id: Mapped[int] = mapped_column(ForeignKey("revisions.id"))
    source_file_id: Mapped[int] = mapped_column(ForeignKey("source_files.id"), unique=True)
    sample_count: Mapped[int]
    min_frequency_hz: Mapped[float] = mapped_column(REAL)
    max_frequency_hz: Mapped[float] = mapped_column(REAL)
    peak_magnitude_mm: Mapped[float] = mapped_column(REAL)
    peak_frequency_hz: Mapped[float] = mapped_column(REAL)
    overall_peak_magnitude_mm: Mapped[float] = mapped_column(REAL)
    overall_peak_frequency_hz: Mapped[float] = mapped_column(REAL)
    limit_mm: Mapped[float] = mapped_column(REAL)
    assess_max_hz: Mapped[float] = mapped_column(REAL)
    verdict: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    component: Mapped[Component] = relationship(back_populates="results")
    revision: Mapped[Revision] = relationship()
    source_file: Mapped[SourceFile] = relationship()
    samples: Mapped[list["Sample"]] = relationship(
        back_populates="result",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Sample.frequency_hz",
    )


class Sample(Base):
    __tablename__ = "samples"
    __table_args__ = (
        CheckConstraint("frequency_hz >= 0", name="ck_samples_frequency_hz"),
        CheckConstraint("magnitude_mm >= 0", name="ck_samples_magnitude_mm"),
        {"sqlite_with_rowid": False},
    )

    result_id: Mapped[int] = mapped_column(
        ForeignKey("results.id", ondelete="CASCADE"), primary_key=True
    )
    frequency_hz: Mapped[float] = mapped_column(REAL, primary_key=True)
    magnitude_mm: Mapped[float] = mapped_column(REAL)

    result: Mapped[Result] = relationship(back_populates="samples")


class Demand(Base):
    """A follow-up action on a component.

    The `origin_*` columns are a frozen copy of the finding that raised the demand, so later
    re-imports of the result do not change what the demand was raised against.
    """

    __tablename__ = "demands"
    __table_args__ = (
        CheckConstraint("status IN ('Open','In Progress','Resolved')", name="ck_demands_status"),
        CheckConstraint("origin_type IN ('finding','manual')", name="ck_demands_origin_type"),
        CheckConstraint(
            "origin_type = 'manual' OR ("
            "origin_result_id IS NOT NULL AND origin_revision_label IS NOT NULL AND "
            "origin_metric IS NOT NULL AND origin_value_mm IS NOT NULL AND "
            "origin_frequency_hz IS NOT NULL AND origin_limit_mm IS NOT NULL AND "
            "origin_assess_max_hz IS NOT NULL)",
            name="ck_demands_finding_origin",
        ),
        Index("idx_demands_component", "component_id"),
        Index("idx_demands_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    component_id: Mapped[int] = mapped_column(ForeignKey("components.id"))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="Open", server_default="Open")
    origin_type: Mapped[str] = mapped_column(Text)
    origin_result_id: Mapped[int | None] = mapped_column(ForeignKey("results.id"))
    origin_revision_label: Mapped[str | None] = mapped_column(Text)
    origin_metric: Mapped[str | None] = mapped_column(Text)
    origin_value_mm: Mapped[float | None] = mapped_column(REAL)
    origin_frequency_hz: Mapped[float | None] = mapped_column(REAL)
    origin_limit_mm: Mapped[float | None] = mapped_column(REAL)
    origin_assess_max_hz: Mapped[float | None] = mapped_column(REAL)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    component: Mapped[Component] = relationship(back_populates="demands")
