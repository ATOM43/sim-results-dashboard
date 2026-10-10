import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Matrix, Trend } from "@/api/comparison";
import type { Demand } from "@/api/demands";
import { decimal, signed } from "@/shared/format";
import { Button } from "@/shared/ui/button";
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

/** Revision columns shown until the grid is expanded. */
const latestCount = 8;
// Opaque, so scrolled cells pass underneath; follows the selected row's tint.
const pinnedColumn = "sticky z-10 bg-card group-data-[state=selected]:bg-muted";

/** The expanded grid opens at its right end, where the latest revisions are. */
function scrollToLatest(table: HTMLTableElement | null) {
  const box = table?.parentElement;
  if (box) box.scrollLeft = box.scrollWidth;
}

type Props = {
  matrix: Matrix;
  /** Revision labels that keep their column while the grid is collapsed. */
  pinned: string[];
  /** Undefined while loading: the demand column stays blank. */
  demands?: Demand[];
  selectedId: number;
  onSelect: (componentId: number) => void;
  /** Shown under the grid. */
  note?: ReactNode;
};

export function MatrixGrid({
  matrix,
  pinned,
  demands,
  selectedId,
  onSelect,
  note,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const total = matrix.revisions.length;
  // Indexes into `matrix.revisions` and every row's `cells`.
  const columns = matrix.revisions
    .map((_, index) => index)
    .filter(
      (index) =>
        expanded ||
        index >= total - latestCount ||
        pinned.includes(matrix.revisions[index].label),
    );

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
        {(expanded || columns.length < total) && (
          <Button
            variant="outline"
            size="sm"
            className="bg-card"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? `Show latest ${latestCount} revisions`
              : `Show all ${total} revisions`}
          </Button>
        )}
        <Table ref={expanded ? scrollToLatest : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead className={`${pinnedColumn} left-0`}>
                Component
              </TableHead>
              {columns.map((index) => (
                <TableHead
                  key={matrix.revisions[index].id}
                  className="font-mono"
                >
                  {matrix.revisions[index].label}
                </TableHead>
              ))}
              <TableHead className={`${pinnedColumn} right-0`}>
                Linked demand
              </TableHead>
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
                  className="group cursor-pointer"
                >
                  <TableCell className={`${pinnedColumn} left-0`}>
                    {/* The click bubbles to the row; the button makes the row reachable by keyboard. */}
                    <button
                      type="button"
                      aria-pressed={selected}
                      className="font-medium underline underline-offset-4 aria-pressed:font-bold"
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  {columns.map((index) => {
                    const cell = row.cells[index];
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
                          <span className="text-muted-foreground">
                            No data for {matrix.revisions[index].label}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className={`${pinnedColumn} right-0 space-x-2 font-mono`}
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
