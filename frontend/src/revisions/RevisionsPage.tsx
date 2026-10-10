import { useState } from "react";
import { Link } from "react-router";
import { componentImageUrl } from "@/api/components";
import { CreateDemandDialog } from "@/demands/CreateDemandDialog";
import { hz, mm, signedMm } from "@/shared/format";
import { useProjects, useSelectedProject } from "@/shared/queries";
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
  "h-full group-aria-pressed:bg-muted/50 group-aria-pressed:ring-2 group-aria-pressed:ring-primary";

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
  search,
}: {
  componentId: number;
  search: string;
}) {
  const demands = useComponentDemands(componentId);
  if (demands.isError) return <ErrorState message={demands.error.message} />;

  return demands.data?.map((demand) => (
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
            {demand.origin_type === "manual" ||
            demand.origin_value_mm === null ||
            demand.origin_frequency_hz === null ||
            demand.origin_limit_mm === null
              ? "manual"
              : `${demand.origin_revision_label} · peak ${mm(demand.origin_value_mm)} at ${hz(demand.origin_frequency_hz)} · limit ${mm(demand.origin_limit_mm)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{demand.status}</Badge>
          <Link
            to={{ pathname: "/demands", search }}
            className="underline underline-offset-4"
          >
            Open in demands →
          </Link>
        </div>
      </CardContent>
    </Card>
  ));
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

  if (projects.isError) return null; // the Shell banner already reports it
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
          <Button asChild variant="outline" size="lg">
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
                  onClick={() => setRev(revision_label)}
                  className={`${cardButton} block w-full`}
                >
                  <Card size="sm" className={selectedCard}>
                    <CardContent className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-base font-semibold">
                          {revision_label}
                        </span>
                        {result && <VerdictBadge verdict={result.verdict} />}
                      </div>
                      {result ? (
                        <>
                          <p className="font-mono">
                            {mm(result.peak_magnitude_mm)}{" "}
                            <span className="text-muted-foreground">
                              at {hz(result.peak_frequency_hz)}
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
            <LinkedDemands componentId={component.id} search={search} />
          </div>
        </div>
      )}
    </div>
  );
}
