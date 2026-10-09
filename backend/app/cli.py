import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from app import config
from app.db.base import SessionLocal, init_db
from app.services.ingestion import ImportReport, sync_folder


def print_report(report: ImportReport) -> None:
    for file in report.files:
        print(f"{file.outcome:<10}{file.source_key}  {file.message.replace('\n', '\n' + ' ' * 12)}")
        for warning in file.warnings:
            print(f"{'':<12}warning: {warning}")
    for source_key in report.missing:
        print(f"{'missing':<10}{source_key}  no longer in the inputs folder; result kept")
    for folder in report.skipped:
        print(f"{'skipped':<10}{folder}/  folder name is not rev<number>")
    print(
        f"Total: {report.inserted} inserted, {report.updated} updated, "
        f"{report.unchanged} unchanged, {report.failed} failed, "
        f"{len(report.missing)} missing, {len(report.skipped)} skipped"
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    import_parser = commands.add_parser("import", help="sync the inputs folder into the database")
    import_parser.add_argument("--inputs", type=Path, default=config.INPUTS_DIR)
    import_parser.add_argument("--project", default=config.DEFAULT_PROJECT_NAME)
    args = parser.parse_args(argv)
    if not args.inputs.is_dir():
        parser.error(f"inputs folder not found: {args.inputs}")

    init_db()
    with SessionLocal() as session:
        report = sync_folder(session, args.inputs, args.project)
    print_report(report)
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
