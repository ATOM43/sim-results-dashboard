import { useState } from "react";
import {
  useApiError,
  useImportStatus,
  useProjects,
  useRunImport,
  useSelectedProject,
} from "./queries";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const warning = "border-warning-border bg-warning text-warning-foreground";

function ProjectSelect() {
  const projects = useProjects();
  const [project, setProject] = useSelectedProject();
  const placeholder = projects.isPending
    ? "Loading projects…"
    : projects.isError
      ? "Projects unavailable"
      : "No projects";

  return (
    <Select
      value={project ? String(project.id) : ""}
      onValueChange={setProject}
      disabled={!project}
    >
      <SelectTrigger
        aria-label="Project"
        className="min-w-40 transition-colors"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {projects.data?.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ImportBadge() {
  const { data, isPending } = useImportStatus();
  // A cached report is not shown while the API is failing: it may no longer be true.
  const down = useApiError() !== undefined;
  const run = useRunImport();
  const [open, setOpen] = useState(false);
  // An open dialog stays open through an outage, so an import error or summary is not lost.
  if (!data || (down && !open)) {
    return (
      <Badge variant="outline">
        Import: {isPending && !down ? "loading…" : "unavailable"}
      </Badge>
    );
  }

  const { imported, failed, missing } = data.counts;
  const bad = failed + missing > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Badge
          asChild
          variant="outline"
          className={
            bad && !down ? `${warning} hover:bg-warning/85` : "hover:bg-muted"
          }
        >
          <button type="button">
            {down
              ? "Import: unavailable"
              : bad
                ? `Import: ${failed} failed, ${missing} missing`
                : `Import: ${imported} files`}
          </button>
        </Badge>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import report</DialogTitle>
          <DialogDescription>
            {imported} imported, {failed} failed, {missing} missing
          </DialogDescription>
        </DialogHeader>
        {run.data && (
          <p role="status">
            {run.data.inserted} imported · {run.data.updated} updated ·{" "}
            {run.data.unchanged} unchanged · {run.data.failed} failed ·{" "}
            {run.data.missing.length} missing
          </p>
        )}
        {run.error && (
          <p role="alert" className="text-destructive">
            {run.error.message}
          </p>
        )}
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
          {/* Failed and missing files first, so they are never below the fold. */}
          {data.files
            .toSorted(
              (a, b) =>
                Number(a.status === "imported") -
                Number(b.status === "imported"),
            )
            .map((file) => (
              <li key={file.source_key} className="space-y-1 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs break-all">
                    {file.source_key}
                  </span>
                  <Badge
                    variant="outline"
                    className={file.status === "imported" ? undefined : warning}
                  >
                    {file.status}
                  </Badge>
                </div>
                {/* A stale message is kept in the database after the file disappears; only a failure shows it. */}
                {file.status === "failed" && file.error_message && (
                  <p className="whitespace-pre-line text-destructive">
                    {file.error_message}
                  </p>
                )}
                {file.status === "missing" && (
                  <p className="text-destructive">
                    {file.source_key}: no longer in the inputs folder; the last
                    imported result is kept
                  </p>
                )}
                {file.warnings.map((w) => (
                  <p key={w} className="text-muted-foreground">
                    Warning: {w}
                  </p>
                ))}
              </li>
            ))}
        </ul>
        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Last import:{" "}
            {data.last_imported_at
              ? new Date(data.last_imported_at).toLocaleString()
              : "never"}
          </span>
          <Button onClick={() => run.mutate()} disabled={run.isPending || down}>
            {run.isPending ? "Importing…" : "Re-import inputs"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Header() {
  return (
    <header
      data-slot="app-header"
      className="dark flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-header px-6 py-3 text-foreground"
    >
      <span className="font-semibold">Simulation Results</span>
      <ProjectSelect />
      <div className="ml-auto">
        <ImportBadge />
      </div>
    </header>
  );
}
