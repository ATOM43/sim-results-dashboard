import { Link } from "react-router";
import type { Comparison, ComparisonEntry, Trend } from "@/api/comparison";
import { FrequencyChart } from "@/shared/FrequencyChart";
import { decimal, hz, mm, signedMm } from "@/shared/format";
import { seriesColor, seriesDash } from "@/shared/seriesStyle";
import { Alert, AlertDescription } from "@/shared/ui/alert";
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

/** "4.9 mm over" / "1.2 mm headroom". */
const marginWords = (marginMm: number) =>
  marginMm < 0 ? `${mm(-marginMm)} over` : `${mm(marginMm)} headroom`;

/** One sentence per change between consecutive results, then where the latest selected revision stands. */
function whatChanged(entries: ComparisonEntry[]) {
  const changes: string[] = [];
  let previous: ComparisonEntry["result"] = null;
  for (const { revision_label, result } of entries) {
    if (!result) continue;
    if (previous && result.delta_vs_previous_mm !== null) {
      const delta = Math.abs(result.delta_vs_previous_mm);
      const flipped =
        result.verdict === previous.verdict
          ? ""
          : ` and now ${result.verdict === "PASS" ? "passes" : "fails"}`;
      changes.push(
        `${revision_label} ${result.trend}${delta ? ` by ${mm(delta)}` : ""}${flipped}`,
      );
    }
    previous = result;
  }
  const latest = entries.at(-1);
  if (!latest) return "";
  const label = `Latest (${latest.revision_label})`;
  const standing = !latest.result
    ? `${label} has no data.`
    : latest.result.verdict === "PASS"
      ? `${label} passes with ${marginWords(latest.result.margin_mm)}.`
      : `${label} fails, ${marginWords(latest.result.margin_mm)} the limit.`;
  return changes.length ? `${changes.join("; ")}. ${standing}` : standing;
}

/** Against the baseline: neutral, "higher"/"lower" only. Whether that is good is the Δ vs previous column's call. */
const vsBaseline = (value: number | null) =>
  value === null
    ? "—"
    : `${signedMm(value)} · ${value > 0 ? "higher" : value < 0 ? "lower" : "same"}`;

/** Against the previous revision: signed and worded, so the direction never depends on the colour. */
function Delta({
  value,
  trend,
}: {
  value: number | null;
  trend: Trend | null;
}) {
  if (value === null) return "—";
  return (
    <span
      className={
        value > 0
          ? "text-destructive"
          : value < 0
            ? "text-success-foreground"
            : undefined
      }
    >
      {signedMm(value)} · {trend}
    </span>
  );
}

/** `overlay`: the labels drawn in the chart and its legend; the summary and the metric table cover every revision. */
export function ComparisonView({
  comparison,
  overlay,
}: {
  comparison: Comparison;
  overlay: string[];
}) {
  const { component, revisions: entries } = comparison;
  const baseline = comparison.baseline_revision_label;
  const shown = entries.filter((e) => overlay.includes(e.revision_label));
  // Chart series are the shown revisions that have a result; `style` maps a label to its line.
  const withResult = shown.filter((entry) => entry.result);
  const style = new Map(
    withResult.map((entry, index) => [
      entry.revision_label,
      {
        stroke: seriesColor(index, withResult.length),
        strokeDasharray: seriesDash(index, withResult.length),
      },
    ]),
  );
  const latestVerdict = entries.at(-1)?.result?.verdict;

  return (
    <>
      <Alert
        className={
          latestVerdict === "FAIL"
            ? "border-l-4 border-destructive/30 border-l-destructive bg-destructive/5"
            : latestVerdict === "PASS"
              ? "border-l-4 border-success-border border-l-success-strong bg-success/40"
              : "border-l-4 border-l-muted-foreground bg-muted"
        }
      >
        <AlertDescription className="text-current">
          <span className="font-semibold">What changed:</span>{" "}
          {whatChanged(entries)}
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <FrequencyChart
            title={`Frequency response overlay · ${component.name}`}
            series={withResult.map(({ revision_label, result }) => ({
              label: revision_label,
              samples: result!.samples,
              peak: {
                magnitude_mm: result!.peak_magnitude_mm,
                frequency_hz: result!.peak_frequency_hz,
              },
            }))}
          />
          <section className="min-w-0 space-y-3">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Legend · assessed peak
            </h2>
            {/* One column beside the chart; wraps into several when the legend sits below it. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-3">
              {shown.map(({ revision_id, revision_label, result }) => (
                <Card key={revision_id} size="sm">
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      {result && (
                        <svg aria-hidden width="28" height="4">
                          <line
                            x2="28"
                            y1="2"
                            y2="2"
                            strokeWidth="2"
                            {...style.get(revision_label)}
                          />
                        </svg>
                      )}
                      <span className="text-base font-semibold">
                        {revision_label}
                      </span>
                      {result && (
                        <span className="ml-auto">
                          <VerdictBadge verdict={result.verdict} />
                        </span>
                      )}
                    </div>
                    {result ? (
                      <p className="font-mono">
                        {mm(result.peak_magnitude_mm)} at{" "}
                        {hz(result.peak_frequency_hz)}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        No data for {revision_label}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-muted-foreground">
              Dots mark each revision’s highest sample within 0–50 Hz. Darker =
              newer revision.
            </p>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-heading text-base font-medium">
            Metric changes · {component.name}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revision</TableHead>
                <TableHead>Assessed peak [mm]</TableHead>
                <TableHead>Peak frequency [Hz]</TableHead>
                <TableHead>Δ vs baseline {baseline}</TableHead>
                <TableHead>Δ vs previous</TableHead>
                <TableHead>Margin to limit</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(({ revision_id, revision_label, result }) => (
                <TableRow key={revision_id} className="font-mono">
                  <TableCell className="font-semibold">
                    {revision_label}
                  </TableCell>
                  {result ? (
                    <>
                      <TableCell>{decimal(result.peak_magnitude_mm)}</TableCell>
                      <TableCell>{decimal(result.peak_frequency_hz)}</TableCell>
                      <TableCell>
                        {revision_label === baseline ? (
                          <span className="text-muted-foreground">
                            — baseline
                          </span>
                        ) : (
                          vsBaseline(result.delta_vs_baseline_mm)
                        )}
                      </TableCell>
                      <TableCell>
                        <Delta
                          value={result.delta_vs_previous_mm}
                          trend={result.trend}
                        />
                      </TableCell>
                      <TableCell>{marginWords(result.margin_mm)}</TableCell>
                      <TableCell>
                        <VerdictBadge verdict={result.verdict} />
                      </TableCell>
                      <TableCell className="font-sans">
                        <Link
                          to={{
                            pathname: "/revisions",
                            search: `?project=${comparison.project.id}&component=${component.id}&rev=${encodeURIComponent(revision_label)}`,
                          }}
                          className="underline underline-offset-4"
                        >
                          View result
                        </Link>
                      </TableCell>
                    </>
                  ) : (
                    // Spelled out, so a missing result never reads as a pass.
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No data for {revision_label}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
