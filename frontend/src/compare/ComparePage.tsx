import { Check } from "lucide-react";
import { seriesColor } from "@/shared/seriesStyle";
import { useProjects, useSelectedProject } from "@/shared/queries";
import { EmptyState, ErrorState, LoadingState } from "@/shared/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { useUrlState } from "@/shared/useUrlState";
import { ComparisonView } from "./ComparisonView";
import { MatrixGrid } from "./MatrixGrid";
import { useComparison, useMatrix, useProjectDemands } from "./queries";

const activeToggle =
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

export function ComparePage() {
  const projects = useProjects();
  const [project] = useSelectedProject();
  const [componentParam, setComponent] = useUrlState("component");
  const [revisionsParam, setRevisions] = useUrlState("revisions");
  const [baselineParam, setBaseline] = useUrlState("baseline");

  const matrix = useMatrix(project?.id);
  const demands = useProjectDemands(project?.id);
  const component =
    matrix.data?.components.find((c) => String(c.id) === componentParam) ??
    matrix.data?.components.at(0);

  // No `revisions` param: the API picks every revision with a result. An empty one means none selected.
  const requested = revisionsParam?.split(",").filter(Boolean);
  // A baseline left over from before its revision was deselected is ignored, so the API falls back to the earliest.
  const baseline =
    baselineParam && (!requested || requested.includes(baselineParam))
      ? baselineParam
      : undefined;
  const comparison = useComparison(component?.id, requested, baseline);

  if (projects.isError) return null; // the Shell banner already reports it
  if (projects.isSuccess && !project)
    return (
      <EmptyState
        title="No projects"
        description="Run an import to load simulation results."
      />
    );
  if (matrix.isError) return <ErrorState message={matrix.error.message} />;
  if (!matrix.data || !project) return <LoadingState />;
  if (!component)
    return (
      <EmptyState
        title="No components"
        description={`${project.name} has no components yet.`}
      />
    );

  const entries = comparison.data?.revisions ?? [];
  const selected = requested ?? entries.map((entry) => entry.revision_label);
  // Same colours as the chart, which only draws the revisions that have a result.
  const drawn = entries.filter((entry) => entry.result);
  const colour = (label: string) => {
    const index = drawn.findIndex((entry) => entry.revision_label === label);
    return index < 0 ? undefined : seriesColor(index, drawn.length);
  };

  return (
    // w-0 min-w-full: wide tables scroll inside their card instead of stretching the Shell's flex row.
    <div className="w-0 min-w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground">
            {project.name} / {component.name} / compare
          </p>
          <h1 className="text-2xl font-semibold">
            Compare revisions · {component.name}
          </h1>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Component"
          className="flex-wrap"
          value={String(component.id)}
          // Radix sends "" when the active item is pressed again; keep the current component.
          onValueChange={(v) => v && setComponent(v)}
        >
          {matrix.data.components.map((c) => (
            <ToggleGroupItem
              key={c.id}
              value={String(c.id)}
              className={activeToggle}
            >
              {c.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-muted-foreground">Revisions</span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          aria-label="Revisions"
          className="flex-wrap"
          value={selected}
          // Until the API has answered with its default selection, a click would replace it rather than toggle.
          disabled={!requested && !comparison.data}
          // Written in revision order, which also drops labels the project does not have.
          onValueChange={(next) =>
            setRevisions(
              matrix.data.revisions
                .map((revision) => revision.label)
                .filter((label) => next.includes(label))
                .join(","),
            )
          }
        >
          {matrix.data.revisions.map(({ id, label }) => (
            <ToggleGroupItem
              key={id}
              value={label}
              className="group rounded-full font-mono"
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full border border-muted-foreground"
                style={{ background: colour(label) }}
              />
              {label}
              <Check
                aria-hidden
                className="invisible group-data-[state=on]:visible"
              />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-muted-foreground">Baseline</span>
        <Select
          value={comparison.data?.baseline_revision_label ?? ""}
          onValueChange={setBaseline}
          disabled={selected.length === 0}
        >
          <SelectTrigger aria-label="Baseline" className="font-mono">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {selected.map((label) => (
              <SelectItem key={label} value={label} className="font-mono">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {requested?.length === 0 ? (
        <EmptyState
          title="No revisions selected"
          description="Select at least one revision to compare."
        />
      ) : comparison.isError ? (
        <ErrorState message={comparison.error.message} />
      ) : !comparison.data ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No results"
          description={`${component.name} has no result in any revision.`}
        />
      ) : (
        <ComparisonView comparison={comparison.data} />
      )}

      <MatrixGrid
        matrix={matrix.data}
        demands={demands.data}
        selectedId={component.id}
        onSelect={(id) => setComponent(String(id))}
        note={
          <>
            {demands.isError && <ErrorState message={demands.error.message} />}
            {requested?.length !== 0 && comparison.data?.grid_mismatch && (
              <p className="text-muted-foreground">
                Note: {comparison.data.component.name} —{" "}
                {comparison.data.grid_note}. Peaks are compared at measured
                samples only; curves are not resampled.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
