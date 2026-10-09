from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SourceFile
from app.services.queries.types import ImportCounts, ImportFile, ImportStatus, parse_warnings


def import_status(session: Session) -> ImportStatus:
    files = session.scalars(select(SourceFile).order_by(SourceFile.source_key)).all()
    counts = Counter(file.status for file in files)
    return ImportStatus(
        last_imported_at=max((file.last_imported_at for file in files), default=None),
        counts=ImportCounts(
            imported=counts["imported"], failed=counts["failed"], missing=counts["missing"]
        ),
        files=[
            ImportFile(
                source_key=file.source_key,
                status=file.status,
                warnings=parse_warnings(file.warnings),
                last_imported_at=file.last_imported_at,
                error_message=file.error_message,
            )
            for file in files
        ],
    )
