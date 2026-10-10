import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Demand, DemandStatus } from "@/api/demands";
import { useProjectDemands } from "@/compare/queries";
import { useComponents } from "@/revisions/queries";
import { decimal, mm, signedMm } from "@/shared/format";
import { useProjects, useSelectedProject } from "@/shared/queries";
import { RetryButton } from "@/shared/RetryButton";
import { EmptyState, ErrorState, LoadingState } from "@/shared/states";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { useUrlState } from "@/shared/useUrlState";
import { VerdictBadge } from "@/shared/VerdictBadge";
import { CreateDemandDialog } from "./CreateDemandDialog";
import { DemandDetail } from "./DemandDetail";
import { originFinding, statusLabel, statuses } from "./format";
import { useDemandList } from "./queries";

// border-border: the vendor toggle and input draw their edge on the paler --input token.
const activeToggle =
  "border-border bg-card data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary-hover data-[state=on]:hover:text-primary-foreground";
const pass = "border-success-border bg-success text-success-foreground";
// The label carries the status; the colour only repeats it.
const statusStyle: Record<DemandStatus, string | undefined> = {
  Open: undefined,
  "In Progress": "border-warning-border bg-warning text-warning-foreground",
  Resolved: pass,
};
const link = "underline underline-offset-4";
const cell = "align-top whitespace-normal";

/** Under the latest result: a pass that still awaits review, or a result worse than the one before it. */
function latestNote(demand: Demand) {
  if (demand.latest_passes_but_open)
    return "Passes now · awaiting engineering review";
  const [previous, latest] = demand.history
    .filter((entry) => entry.peak_magnitude_mm !== null)
    .slice(-2);
  if (!latest) return null;
  const delta = latest.peak_magnitude_mm! - previous.peak_magnitude_mm!;
  return delta > 0
    ? `Worse than ${previous.revision_label} (${signedMm(delta)})`
    : null;
}

export function DemandsPage() {
  const projects = useProjects();
  const [project] = useSelectedProject();
  const [params] = useSearchParams();
  const [statusParam, setStatus] = useUrlState("status");
  const [componentParam, setComponent] = useUrlState("component");
  const [q, setQ] = useUrlState("q", { replace: true });
  const [creating, setCreating] = useState(false);

  const status = statuses.find((s) => s === statusParam);
  const componentId = Number(componentParam) || undefined;
  const components = useComponents(project?.id);
  // Unfiltered, for the status counts; the same query Compare uses.
  const all = useProjectDemands(project?.id);
  const list = useDemandList(project?.id, status, componentId);

  if (projects.isError)
    return (
      <ErrorState message={projects.error.message} action={<RetryButton />} />
    );
  if (projects.isSuccess && !project)
    return (
      <EmptyState
        title="No projects"
        description="Run an import to load simulation results."
      />
    );
  if (!project) return <LoadingState />;

  const needle = (q ?? "").trim().toLowerCase();
  const rows = list.data?.filter((d) =>
    `D-${d.id} ${d.description}`.toLowerCase().includes(needle),
  );
  const selectedId = Number(params.get("demand")) || rows?.at(0)?.id;
  const search = `?project=${project.id}`;
  const count = (s?: DemandStatus) =>
    all.data ? ` (${all.data.filter((d) => !s || d.status === s).length})` : "";
  const select = (id: number) => {
    const next = new URLSearchParams(params);
    next.set("demand", String(id));
    return { search: `?${next}` };
  };

  return (
    // w-0 min-w-full: the wide table scrolls inside its card instead of stretching the Shell's flex row.
    <div className="w-0 min-w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground">{project.name} / demands</p>
          <h1 className="text-2xl font-semibold">Engineering demands</h1>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="bg-card"
          onClick={() => setCreating(true)}
        >
          + New manual demand
        </Button>
        <CreateDemandDialog
          open={creating}
          onOpenChange={setCreating}
          project={project}
          defaultComponentId={componentId}
        />
      </div>

      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Input
            type="search"
            aria-label="Search"
            placeholder="Description, ID…"
            className="w-56 border-border"
            value={q ?? ""}
            onChange={(event) => setQ(event.target.value || null)}
          />
          <span className="text-muted-foreground">Status</span>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Status"
            className="flex-wrap"
            value={status ?? "all"}
            // Radix sends "" when the active item is pressed again; keep the current filter.
            onValueChange={(v) => v && setStatus(v === "all" ? null : v)}
          >
            <ToggleGroupItem value="all" className={activeToggle}>
              All{count()}
            </ToggleGroupItem>
            {statuses.map((s) => (
              <ToggleGroupItem key={s} value={s} className={activeToggle}>
                {statusLabel[s]}
                {count(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-muted-foreground">Component</span>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Component"
            className="flex-wrap"
            value={componentId ? String(componentId) : "all"}
            onValueChange={(v) => v && setComponent(v === "all" ? null : v)}
          >
            <ToggleGroupItem value="all" className={activeToggle}>
              All
            </ToggleGroupItem>
            {components.data?.map((c) => (
              <ToggleGroupItem
                key={c.id}
                value={String(c.id)}
                className={activeToggle}
              >
                {c.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      {list.isError ? (
        <ErrorState message={list.error.message} />
      ) : !rows ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState title="No demands match these filters" />
      ) : (
        <Card size="sm">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Component · project</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Origin finding</TableHead>
                  <TableHead>Result per revision</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((demand) => {
                  const { component, latest_result: latest } = demand;
                  const finding = originFinding(demand);
                  const note = latestNote(demand);
                  return (
                    <TableRow
                      key={demand.id}
                      aria-selected={demand.id === selectedId}
                      className="aria-selected:bg-muted aria-selected:shadow-[inset_3px_0_0_var(--primary)]"
                    >
                      <TableCell className="align-top font-mono">
                        <Link to={select(demand.id)} className={link}>
                          D-{demand.id}
                        </Link>
                      </TableCell>
                      <TableCell className={cell}>
                        <p className="font-medium">{component.name}</p>
                        <p className="text-muted-foreground">
                          {demand.project.name}
                        </p>
                      </TableCell>
                      <TableCell className={`${cell} min-w-48`}>
                        {demand.description}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className={statusStyle[demand.status]}
                        >
                          {statusLabel[demand.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className={`${cell} min-w-40`}>
                        {finding ? (
                          <>
                            <p className="font-mono font-semibold">
                              {demand.origin_revision_label}
                            </p>
                            <p className="text-muted-foreground">{finding}</p>
                          </>
                        ) : (
                          "Manual"
                        )}
                      </TableCell>
                      <TableCell className={`${cell} min-w-44`}>
                        <div className="flex flex-wrap gap-1">
                          {demand.history.map((entry) => (
                            <Badge
                              key={entry.revision_id}
                              variant={
                                entry.verdict === "FAIL"
                                  ? "destructive"
                                  : "outline"
                              }
                              className={`font-mono ${entry.verdict === "PASS" ? pass : ""}`}
                            >
                              {entry.revision_label}{" "}
                              {entry.peak_magnitude_mm === null
                                ? "no data"
                                : `${entry.verdict === "PASS" ? "✓" : "×"} ${decimal(entry.peak_magnitude_mm)}`}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className={`${cell} min-w-44`}>
                        {latest?.verdict &&
                        latest.peak_magnitude_mm !== null ? (
                          <p className="flex flex-wrap items-center gap-2 font-mono">
                            <VerdictBadge verdict={latest.verdict} />
                            {latest.revision_label}
                            <span className="font-semibold">
                              {mm(latest.peak_magnitude_mm)}
                            </span>
                          </p>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                        {note && (
                          <p className="mt-1 text-muted-foreground">{note}</p>
                        )}
                      </TableCell>
                      <TableCell className={cell}>
                        {demand.origin_revision_label && (
                          <Link
                            to={{
                              pathname: "/revisions",
                              search: `${search}&component=${component.id}&rev=${encodeURIComponent(demand.origin_revision_label)}`,
                            }}
                            className={`${link} block`}
                          >
                            Origin result
                          </Link>
                        )}
                        <Link
                          to={{
                            pathname: "/compare",
                            search: `${search}&component=${component.id}`,
                          }}
                          className={`${link} block`}
                        >
                          Compare revs
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedId !== undefined && <DemandDetail demandId={selectedId} />}
    </div>
  );
}
