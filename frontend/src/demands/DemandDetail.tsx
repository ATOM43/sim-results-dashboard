import { useId, useState } from "react";
import type { Demand, DemandStatus } from "@/api/demands";
import { useComponentRevisions } from "@/revisions/queries";
import { hz, mm, signedMm } from "@/shared/format";
import { ErrorState, LoadingState } from "@/shared/states";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
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
import { originFinding, statusLabel, statuses } from "./format";
import { useDemand, useUpdateDemand } from "./queries";

const created = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function EditCard({ demand }: { demand: Demand }) {
  const id = useId();
  const [description, setDescription] = useState(demand.description);
  const [status, setStatus] = useState(demand.status);
  const update = useUpdateDemand(demand.id);
  const finding = originFinding(demand);

  return (
    <Card>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ description, status });
          }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-lg font-semibold">
              <span className="font-mono">D-{demand.id}</span> ·{" "}
              {demand.component.name}
            </h2>
            <p className="text-muted-foreground">
              Created {created.format(new Date(demand.created_at))}
              {demand.origin_type === "finding"
                ? ` from ${demand.origin_revision_label} finding`
                : " · manual"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <Textarea
              id={`${id}-description`}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1 space-y-2">
              <Label htmlFor={`${id}-status`}>Status</Label>
              <Select
                name="status"
                value={status}
                onValueChange={(value) => setStatus(value as DemandStatus)}
              >
                <SelectTrigger id={`${id}-status`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={update.isPending || !description.trim()}
            >
              Save changes
            </Button>
          </div>
          {update.isError && (
            <ErrorState
              title="Could not save the demand"
              message={update.error.message}
            />
          )}
          {update.isSuccess && (
            <p role="status" className="text-muted-foreground">
              Saved.
            </p>
          )}
          <div className="space-y-1 rounded-lg border bg-muted/50 p-3">
            <p className="text-muted-foreground">Origin finding (frozen)</p>
            {finding ? (
              <>
                <p className="font-mono">
                  {demand.origin_revision_label} · {finding}
                </p>
                <p className="text-muted-foreground">
                  Source file {demand.origin_source_key} · stays fixed if newer
                  revisions arrive or the file is re-imported.
                </p>
              </>
            ) : (
              <p>Manual demand — no origin finding.</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ demand }: { demand: Demand }) {
  // The history carries no peak frequency; the component's revisions do.
  const revisions = useComponentRevisions(demand.component.id);
  const origin = demand.origin_value_mm;
  const firstPass = demand.history.find((entry) => entry.verdict === "PASS");

  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          History of {demand.component.name}
          {demand.origin_revision_label &&
            ` since ${demand.origin_revision_label}`}
        </h2>
        <ul className="divide-y">
          {demand.history.map((entry) => {
            const peak = entry.peak_magnitude_mm;
            const frequency = revisions.data?.find(
              (r) => r.revision_id === entry.revision_id,
            )?.result?.peak_frequency_hz;
            const delta =
              peak === null || origin === null ? null : peak - origin;
            const isOrigin =
              entry.revision_label === demand.origin_revision_label;
            return (
              <li
                key={entry.revision_id}
                className="grid grid-cols-[3.5rem_4.5rem_1fr] items-start gap-2 py-2"
              >
                <span className="font-mono font-semibold">
                  {entry.revision_label}
                </span>
                {entry.verdict === null || peak === null ? (
                  <p className="col-span-2 text-muted-foreground">
                    No data for {entry.revision_label}
                  </p>
                ) : (
                  <>
                    <VerdictBadge verdict={entry.verdict} />
                    <div>
                      <p className="font-mono">
                        {mm(peak)}
                        {frequency !== undefined && ` at ${hz(frequency)}`}
                      </p>
                      {isOrigin ? (
                        <p className="text-muted-foreground">
                          Origin finding — demand created
                        </p>
                      ) : (
                        <p
                          className={
                            delta === null || delta === 0
                              ? "text-muted-foreground"
                              : delta > 0
                                ? "text-destructive"
                                : "text-success-foreground"
                          }
                        >
                          {[
                            delta !== null && `${signedMm(delta)} vs origin`,
                            entry === firstPass && "first passing result",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {demand.latest_passes_but_open && (
          <p className="text-muted-foreground">
            The latest result passes, but the demand stays{" "}
            {statusLabel[demand.status]} until an engineer marks it Resolved.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function DemandDetail({ demandId }: { demandId: number }) {
  const demand = useDemand(demandId);
  if (demand.isError) return <ErrorState message={demand.error.message} />;
  if (!demand.data) return <LoadingState />;

  return (
    <div className="grid gap-4">
      {/* Keyed so the form starts from the newly selected demand. */}
      <EditCard key={demand.data.id} demand={demand.data} />
      <HistoryCard demand={demand.data} />
    </div>
  );
}
