import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Matrix, Trend } from "@/api/comparison";
import type { Demand } from "@/api/demands";
import { decimal, signed } from "@/shared/format";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { VerdictBadge } from "@/shared/VerdictBadge";

// A higher peak is worse: the arrow follows the value, the colour only repeats the direction.
const trends: Record<Trend, [arrow: string, colour: string]> = {
  degraded: ["↑", "text-destructive"],
  improved: ["↓", "text-success-foreground"],
  unchanged: ["→", "text-muted-foreground"],
};

type Props = {
  matrix: Matrix;
  /** Undefined while loading: the demand column stays blank. */
  demands?: Demand[];
  selectedId: number;
  onSelect: (componentId: number) => void;
  /** Shown under the grid. */
  note?: ReactNode;
};

export function MatrixGrid({
  matrix,
  demands,
  selectedId,
  onSelect,
  note,
}: Props) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-medium">
            All components across revisions
          </h2>
          <p className="text-muted-foreground">
            Assessed peak in mm · arrow = change vs previous revision · select a
            row to compare it
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              {matrix.revisions.map((revision) => (
                <TableHead key={revision.id} className="font-mono">
                  {revision.label}
                </TableHead>
              ))}
              <TableHead>Linked demand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.components.map((row) => {
              const selected = row.id === selectedId;
              return (
                <TableRow
                  key={row.id}
                  data-state={selected ? "selected" : undefined}
                  onClick={() => onSelect(row.id)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    {/* The click bubbles to the row; the button makes the row reachable by keyboard. */}
                    <button
                      type="button"
                      aria-pressed={selected}
                      className="font-medium underline underline-offset-4 aria-pressed:font-bold"
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  {row.cells.map((cell, index) => {
                    // The API's trend is against the previous revision that has a result, so the delta is too.
                    const previous = row.cells
                      .slice(0, index)
                      .findLast((c) => c !== null);
                    return (
                      <TableCell key={matrix.revisions[index].id}>
                        {cell ? (
                          <span className="flex items-center gap-2 font-mono">
                            {decimal(cell.peak_magnitude_mm)}
                            <VerdictBadge verdict={cell.verdict} />
                            {cell.trend && previous && (
                              <span
                                className={trends[cell.trend][1]}
                                title={cell.trend}
                              >
                                {trends[cell.trend][0]}{" "}
                                {signed(
                                  cell.peak_magnitude_mm -
                                    previous.peak_magnitude_mm,
                                )}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">no data</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className="space-x-2 font-mono"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {demands
                      ?.filter((demand) => demand.component.id === row.id)
                      .map((demand) => (
                        <Link
                          key={demand.id}
                          to={{
                            pathname: "/demands",
                            search: `?project=${matrix.project.id}`,
                          }}
                          className="underline underline-offset-4"
                        >
                          D-{demand.id}
                        </Link>
                      ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {note}
      </CardContent>
    </Card>
  );
}
