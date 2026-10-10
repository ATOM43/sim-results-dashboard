import { useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { DemandCreate } from "@/api/demands";
import {
  useComponentRevisions,
  useComponents,
  useResult,
} from "@/revisions/queries";
import { hz, mm } from "@/shared/format";
import { ErrorState, LoadingState } from "@/shared/states";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { VerdictBadge } from "@/shared/VerdictBadge";
import { useCreateDemand } from "./queries";

type Project = { id: number; name: string };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono break-all">{children}</dd>
    </div>
  );
}

/** The shared body of both dialogs. `origin` is undefined until the demand can be created. */
function Form({
  project,
  breadcrumb,
  title,
  component,
  fromSortKey,
  origin,
  onClose,
  children,
}: {
  project: Project;
  onClose: () => void;
  breadcrumb: string;
  title: string;
  component?: { id: number; name: string };
  /** Tracking starts at this revision; undefined means the earliest one. */
  fromSortKey?: number;
  origin?: { origin_result_id: number } | { component_id: number };
  children: ReactNode;
}) {
  const id = useId();
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const create = useCreateDemand();
  const revisions = useComponentRevisions(component?.id);
  const tracked = revisions.data
    ?.filter((r) => fromSortKey === undefined || r.sort_key >= fromSortKey)
    .map((r) => r.revision_label);
  const name = component?.name ?? "the component";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!origin) return;
    const body: DemandCreate =
      "component_id" in origin
        ? { origin_type: "manual", ...origin, description }
        : { ...origin, description };
    create.mutate(body, {
      // The bare demands list: filters that could hide the new row are dropped.
      onSuccess: (demand) => {
        onClose();
        navigate(`/demands?project=${project.id}&demand=${demand.id}`);
      },
    });
  };

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogDescription>{breadcrumb}</DialogDescription>
        <DialogTitle className="text-lg">{title}</DialogTitle>
      </DialogHeader>
      {children}
      <div className="space-y-2">
        <Label htmlFor={id}>
          Description — what should be investigated or changed
        </Label>
        <Textarea
          id={id}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div>
        <p className="font-medium">Will track</p>
        <p className="text-muted-foreground">
          {component
            ? `${name} in ${tracked?.length ? tracked.join(", ") : "…"} and every later revision`
            : "Choose a component"}
        </p>
      </div>
      <p className="rounded-lg bg-muted p-3 text-muted-foreground">
        This demand follows {name} through new revisions and shows each result.
        A later passing result updates the latest result but never resolves the
        demand — an engineer decides that.
      </p>
      {create.isError && (
        <ErrorState
          title="Could not create the demand"
          message={create.error.message}
        />
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          disabled={create.isPending || !origin || !description.trim()}
        >
          Create demand
        </Button>
      </DialogFooter>
    </form>
  );
}

function FromFinding({
  project,
  resultId,
  onClose,
}: {
  project: Project;
  resultId: number;
  onClose: () => void;
}) {
  const result = useResult(resultId);
  if (!result.data)
    return (
      <>
        <DialogTitle>Create demand from finding</DialogTitle>
        {result.isError ? (
          <ErrorState message={result.error.message} />
        ) : (
          <LoadingState />
        )}
      </>
    );

  const r = result.data;
  const over = r.peak_magnitude_mm - r.limit_mm;
  const assessed = `0–${r.assess_max_hz} Hz`;
  return (
    <Form
      project={project}
      onClose={onClose}
      breadcrumb={`${project.name} / ${r.component.name} / ${r.revision.label}`}
      title="Create demand from finding"
      component={r.component}
      fromSortKey={r.revision.sort_key}
      origin={{ origin_result_id: r.id }}
    >
      <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
        <h3 className="flex flex-wrap items-center gap-2 font-medium">
          <VerdictBadge verdict={r.verdict} />
          Triggering finding (saved with the demand)
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Component">{r.component.name}</Field>
          <Field label="Source revision">
            {r.revision.label} · {r.source.source_key}
          </Field>
          <Field label="Metric">Peak magnitude, {assessed}</Field>
          <Field label="Value">
            {mm(r.peak_magnitude_mm)} at {hz(r.peak_frequency_hz)}
          </Field>
          <Field label="Limit">
            {mm(r.limit_mm)} ({assessed} incl.)
          </Field>
          <Field label="Exceedance">
            <span className="text-destructive">
              {mm(over)} · {((over / r.limit_mm) * 100).toFixed(1)} % over
            </span>
          </Field>
        </dl>
      </section>
    </Form>
  );
}

function Manual({
  project,
  defaultComponentId,
  onClose,
}: {
  project: Project;
  defaultComponentId?: number;
  onClose: () => void;
}) {
  const id = useId();
  const components = useComponents(project.id);
  const [componentId, setComponentId] = useState(
    defaultComponentId ? String(defaultComponentId) : "",
  );
  const component = components.data?.find((c) => String(c.id) === componentId);

  return (
    <Form
      project={project}
      onClose={onClose}
      breadcrumb={`${project.name} / demands`}
      title="New manual demand"
      component={component}
      origin={component && { component_id: component.id }}
    >
      {components.isError && <ErrorState message={components.error.message} />}
      <div className="space-y-2">
        <Label htmlFor={id}>Component</Label>
        <Select
          name="component"
          value={componentId}
          onValueChange={setComponentId}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Choose a component" />
          </SelectTrigger>
          <SelectContent>
            {components.data?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Form>
  );
}

/** With `resultId` the demand is raised from that FAIL result; without it, manually for a chosen component. */
export function CreateDemandDialog({
  open,
  onOpenChange,
  project,
  resultId,
  defaultComponentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  resultId?: number;
  defaultComponentId?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {resultId !== undefined ? (
          <FromFinding
            project={project}
            resultId={resultId}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <Manual
            project={project}
            defaultComponentId={defaultComponentId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
