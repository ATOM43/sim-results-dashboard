import {
  useApiError,
  useImportStatus,
  useProjects,
  useSelectedProject,
} from "./queries";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <SelectTrigger aria-label="Project" className="min-w-40">
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
  if (!data || down) {
    return (
      <Badge variant="outline">
        Import: {isPending && !down ? "loading…" : "unavailable"}
      </Badge>
    );
  }

  const { imported, failed, missing } = data.counts;
  const bad = failed + missing > 0;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Badge asChild variant="outline" className={bad ? warning : undefined}>
          <button type="button">
            {bad
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
            {data.last_imported_at &&
              ` · last import ${new Date(data.last_imported_at).toLocaleString()}`}
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}

export function Header() {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-6 py-3">
      <span className="font-semibold">Simulation Results</span>
      <ProjectSelect />
      <div className="ml-auto">
        <ImportBadge />
      </div>
    </header>
  );
}
