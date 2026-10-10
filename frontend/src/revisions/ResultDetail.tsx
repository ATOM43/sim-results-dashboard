import { FrequencyChart } from "@/shared/FrequencyChart";
import { hz, mm, signedMm } from "@/shared/format";
import { ErrorState, LoadingState } from "@/shared/states";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Card, CardContent } from "@/shared/ui/card";
import { VerdictBadge } from "@/shared/VerdictBadge";
import { useResult } from "./queries";

function Tile({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note: string;
  className?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-muted-foreground">{label}</p>
        <p
          className={`font-mono text-xl font-semibold break-all ${className ?? ""}`}
        >
          {value}
        </p>
        <p className="text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

export function ResultDetail({ resultId }: { resultId: number }) {
  const result = useResult(resultId);
  if (result.isError) return <ErrorState message={result.error.message} />;
  if (!result.data) return <LoadingState />;

  const r = result.data;
  const fail = r.verdict === "FAIL";
  const assessed = `0–${r.assess_max_hz} Hz`;
  const marginPercent = (Math.abs(r.margin_mm) / r.limit_mm) * 100;
  const sameSample =
    r.overall_peak_frequency_hz === r.peak_frequency_hz &&
    r.overall_peak_magnitude_mm === r.peak_magnitude_mm;

  return (
    <div className="space-y-4">
      <Alert
        className={
          fail
            ? "border-destructive/30 bg-destructive/10"
            : "border-success-border bg-success text-success-foreground"
        }
      >
        <AlertDescription className="flex flex-wrap items-center gap-2 text-current">
          <VerdictBadge verdict={r.verdict} />
          <span className="font-medium">
            Peak {mm(r.peak_magnitude_mm)} at {hz(r.peak_frequency_hz)}{" "}
            {fail ? "exceeds" : "passes"} the {mm(r.limit_mm)} limit over{" "}
            {assessed}.
          </span>
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-2">
          <FrequencyChart
            title={`Frequency response · ${r.component.name} · ${r.revision.label}`}
            series={[
              {
                label: r.revision.label,
                samples: r.samples,
                peak: {
                  magnitude_mm: r.peak_magnitude_mm,
                  frequency_hz: r.peak_frequency_hz,
                },
              },
            ]}
            limitMm={r.limit_mm}
            assessMaxHz={r.assess_max_hz}
          />
          <p className="text-muted-foreground">
            Lines join measured samples; values between samples are not
            interpolated for the assessment. Filled dots are assessed samples,
            hollow dots are above {r.assess_max_hz} Hz.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label={`Assessed peak (${assessed})`}
          value={mm(r.peak_magnitude_mm)}
          note={`at ${hz(r.peak_frequency_hz)}`}
        />
        <Tile
          label={`Margin to ${mm(r.limit_mm)} limit`}
          value={signedMm(r.margin_mm)}
          className={r.margin_mm < 0 ? "text-destructive" : undefined}
          note={
            r.margin_mm === 0
              ? "at the limit"
              : `${marginPercent.toFixed(1)} % ${r.margin_mm < 0 ? "above" : "below"} the limit`
          }
        />
        <Tile
          label={`Overall peak (0–${r.max_frequency_hz} Hz)`}
          value={mm(r.overall_peak_magnitude_mm)}
          note={
            sameSample
              ? "Same sample as the assessed peak"
              : `at ${hz(r.overall_peak_frequency_hz)}`
          }
        />
        <Tile
          label="Source data"
          value={r.source.source_key}
          className="text-sm"
          note={`${r.sample_count} samples · ${r.min_frequency_hz}–${r.max_frequency_hz} Hz · ${r.samples.filter((s) => s.assessed).length} assessed`}
        />
      </div>
      {r.source.warnings.map((w) => (
        <p key={w} className="text-muted-foreground">
          Warning: {w}
        </p>
      ))}
    </div>
  );
}
