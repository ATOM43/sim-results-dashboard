import { useState } from "react";
import { Link } from "react-router";
import { componentImageUrl } from "@/api/components";
import { CreateDemandDialog } from "@/demands/CreateDemandDialog";
import { originFinding, statusLabel } from "@/demands/format";
import { hz, mm, signedMm } from "@/shared/format";
import { useProjects, useSelectedProject } from "@/shared/queries";
import { RetryButton } from "@/shared/RetryButton";
import { EmptyState, ErrorState, LoadingState } from "@/shared/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { useUrlState } from "@/shared/useUrlState";
import { VerdictBadge } from "@/shared/VerdictBadge";
import {
  useComponentDemands,
  useComponentRevisions,
  useComponents,
} from "./queries";
import { ResultDetail } from "./ResultDetail";

const cardButton =
  "group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const selectedCard =
  // The card edge is a border on --border (index.css). The trailing ! lets a state override that unlayered rule.
  "h-full transition-[box-shadow,border-color] duration-150 group-[:not([aria-pressed=true]):hover]:border-primary/40! group-[:not([aria-pressed=true]):hover]:shadow-sm group-active:bg-muted group-aria-pressed:border-primary! group-aria-pressed:bg-primary/5 group-aria-pressed:ring-1! group-aria-pressed:ring-primary";

/** "+2.1 mm vs rev1 · worse": the direction is in words, the colour only repeats it. */
function Change({
  delta,
  previous,
}: {
  delta: number | null;
  previous?: string;
}) {
  if (delta === null)
    return <p className="text-muted-foreground">Baseline (first revision)</p>;
  const [word, colour] =
    delta > 0
      ? ["worse", "text-destructive"]
      : delta < 0
        ? ["better", "text-success-foreground"]
        : ["unchanged", "text-muted-foreground"];
  return (
    <p className={colour}>
      {signedMm(delta)} vs {previous} · {word}
    </p>
  );
}

function LinkedDemands({
  componentId,
  projectId,
}: {
  componentId: number;
  projectId: number;
}) {
  const demands = useComponentDemands(componentId);
  if (demands.isError)
    return (
      <ErrorState message={demands.error.message} action={<RetryButton />} />
    );

  return demands.data?.map((demand) => {
    const finding = originFinding(demand);
    return (
      <Card key={demand.id} size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-muted-foreground">Linked demand</p>
            <p className="font-medium">
              <span className="font-mono">D-{demand.id}</span> ·{" "}
              {demand.description}
            </p>
            <p className="text-muted-foreground">
              Origin:{" "}
              {finding
                ? `${demand.origin_revision_label} · ${finding}`
                : "manual"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{statusLabel[demand.status]}</Badge>
            <Link
              to={`/demands?project=${projectId}&demand=${demand.id}`}
              className="underline underline-offset-4"
            >
              Open in demands →
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  });
}

/** Brings the selected revision into its scrolling list. Not scrollIntoView: that would also scroll the page. */
function keepInList(button: HTMLElement | null) {
  const list = button?.parentElement;
  if (!button || !list) return;
  const top = button.offsetTop;
  if (
    top < list.scrollTop ||
    top + button.offsetHeight > list.scrollTop + list.clientHeight
  )
    list.scrollTop = top - (list.clientHeight - button.offsetHeight) / 2;
}

export function RevisionsPage() {
  const projects = useProjects();
  const [project] = useSelectedProject();
  const [componentParam, setComponent] = useUrlState("component");
  const [revParam, setRev] = useUrlState("rev");
  const [creating, setCreating] = useState(false);

  const components = useComponents(project?.id);
  const component =
    components.data?.find((c) => String(c.id) === componentParam) ??
    components.data?.at(0);

  const revisions = useComponentRevisions(component?.id);
  // Default: the latest revision that has a result for this component.
  const revision =
    revisions.data?.find((r) => r.revision_label === revParam) ??
    revisions.data?.findLast((r) => r.result) ??
    revisions.data?.at(-1);

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
  if (components.isError)
    return <ErrorState message={components.error.message} />;
  if (!components.data || !project) return <LoadingState />;
  if (!component)
    return (
      <EmptyState
        title="No components"
        description={`${project.name} has no components yet.`}
      />
    );

  const search = `?project=${project.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground">
            {[project.name, component.name, revision?.revision_label]
              .filter(Boolean)
              .join(" / ")}
          </p>
          <h1 className="text-2xl font-semibold">
            {component.name}
            {revision && ` · ${revision.revision_label}`}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link
              to={{
                pathname: "/compare",
                search: `${search}&component=${component.id}`,
              }}
            >
              Compare revisions →
            </Link>
          </Button>
          {revision?.result?.verdict === "FAIL" && (
            <>
              <Button size="lg" onClick={() => setCreating(true)}>
                + Create demand from this finding
              </Button>
              <CreateDemandDialog
                open={creating}
                onOpenChange={setCreating}
                project={project}
                resultId={revision.result.result_id}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {components.data.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === component.id}
            onClick={() => setComponent(String(c.id))}
            className={cardButton}
          >
            <Card size="sm" className={selectedCard}>
              <CardContent className="flex items-center gap-3">
                <Avatar className="size-14 rounded-md after:rounded-md">
                  <AvatarImage
                    src={componentImageUrl(c.id)}
                    alt=""
                    className="rounded-md object-contain"
                  />
                  <AvatarFallback className="rounded-md text-lg">
                    {c.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="font-heading text-base font-medium">{c.name}</p>
                  {c.latest ? (
                    <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <VerdictBadge verdict={c.latest.verdict} />
                      Latest {c.latest.revision_label} ·{" "}
                      {mm(c.latest.peak_magnitude_mm)}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">No results</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {revisions.isError ? (
        <ErrorState message={revisions.error.message} />
      ) : !revisions.data ? (
        <LoadingState />
      ) : !revision ? (
        <EmptyState
          title="No revisions"
          description={`${component.name} has no revisions yet.`}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Revisions of {component.name}
            </h2>
            {/* relative: offsetTop of the buttons is measured from the list. -m-1 p-1: room for the selected ring inside the scroll clip. */}
            <div className="relative -m-1 max-h-[70vh] space-y-3 overflow-y-auto p-1">
              {revisions.data.map((entry, index) => {
                const { revision_id, revision_label, result } = entry;
                // The API's change is against the previous revision that has a result, so name that one.
                const previousLabel = revisions.data
                  .slice(0, index)
                  .findLast((r) => r.result)?.revision_label;
                return (
                  <button
                    key={revision_id}
                    type="button"
                    aria-pressed={revision_id === revision.revision_id}
                    ref={
                      revision_id === revision.revision_id
                        ? keepInList
                        : undefined
                    }
                    onClick={() => setRev(revision_label)}
                    className={`${cardButton} block w-full`}
                  >
                    <Card size="sm" className={selectedCard}>
                      <CardContent className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-semibold">
                            {revision_label}
                          </span>
                          {result && <VerdictBadge verdict={result.verdict} />}
                        </div>
                        {result ? (
                          <>
                            <p>
                              <span className="font-mono">
                                {mm(result.peak_magnitude_mm)}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                at{" "}
                                <span className="font-mono">
                                  {hz(result.peak_frequency_hz)}
                                </span>
                              </span>
                            </p>
                            <Change
                              delta={result.delta_vs_previous_mm}
                              previous={previousLabel}
                            />
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            No data for {revision_label}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="min-w-0 space-y-4">
            {revision.result ? (
              <ResultDetail resultId={revision.result.result_id} />
            ) : (
              <EmptyState
                title={`No data for ${revision.revision_label}`}
                description={`${component.name} has no result in this revision. This is not a pass.`}
              />
            )}
            <LinkedDemands componentId={component.id} projectId={project.id} />
          </div>
        </div>
      )}
    </div>
  );
}
