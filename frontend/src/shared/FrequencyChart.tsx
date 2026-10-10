import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "./ui/chart";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const FULL_MAX_HZ = 200;

export type ChartSample = {
  frequency_hz: number;
  magnitude_mm: number;
  assessed: boolean;
};

export type ChartSeries = {
  label: string;
  samples: ChartSample[];
  /** Assessed peak; omit to leave the series unmarked. */
  peak?: { magnitude_mm: number; frequency_hz: number };
};

type Props = {
  /** Oldest revision first: later series are drawn darker. */
  series: ChartSeries[];
  limitMm?: number;
  assessMaxHz?: number;
};

// shortcut: five chart tokens, so series older than the newest five share the lightest; add tokens if compare ever shows more.
const seriesColor = (index: number, count: number) =>
  `var(--chart-${Math.max(1, 5 - (count - 1 - index))})`;

export function FrequencyChart({
  series,
  limitMm = 15,
  assessMaxHz = 50,
}: Props) {
  const [zoom, setZoom] = useState<"full" | "assessed">("full");
  const maxHz = zoom === "full" ? FULL_MAX_HZ : assessMaxHz;
  const config = Object.fromEntries(
    series.map((s, i) => [
      s.label,
      { label: s.label, color: seriesColor(i, series.length) },
    ]),
  );

  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Frequency range"
        value={zoom}
        // Radix sends "" when the active item is pressed again; keep the current zoom.
        onValueChange={(v) => v && setZoom(v as typeof zoom)}
      >
        <ToggleGroupItem value="full">0–{FULL_MAX_HZ} Hz</ToggleGroupItem>
        <ToggleGroupItem value="assessed">
          0–{assessMaxHz} Hz (assessed)
        </ToggleGroupItem>
      </ToggleGroup>
      <ChartContainer config={config} className="aspect-auto h-80 w-full">
        <LineChart margin={{ top: 24, right: 16, bottom: 16, left: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            type="number"
            dataKey="frequency_hz"
            domain={[0, maxHz]}
            allowDataOverflow
            label={{
              value: "Frequency (Hz)",
              position: "insideBottom",
              offset: -8,
            }}
          />
          <YAxis
            type="number"
            label={{
              value: "Magnitude (mm)",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <ReferenceArea
            x1={0}
            x2={assessMaxHz}
            fill="var(--muted)"
            fillOpacity={0.6}
            label={{ value: "Assessed", position: "insideTopLeft" }}
          />
          <ReferenceLine
            y={limitMm}
            stroke="var(--warning-foreground)"
            strokeDasharray="6 4"
            ifOverflow="extendDomain"
            label={{
              value: `${limitMm.toFixed(1)} mm limit`,
              position: "insideTopRight",
              fill: "var(--warning-foreground)",
            }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  `${payload[0]?.payload.frequency_hz} Hz`
                }
                formatter={(value, name, item) =>
                  `${name}: ${value} mm · ${item.payload.assessed ? "assessed" : "not assessed"}`
                }
              />
            }
          />
          {series.length > 1 && (
            <ChartLegend content={<ChartLegendContent nameKey="value" />} />
          )}
          {series.map((s, i) => {
            const color = seriesColor(i, series.length);
            return (
              <Line
                key={s.label}
                data={s.samples}
                dataKey="magnitude_mm"
                name={s.label}
                stroke={color}
                strokeWidth={2}
                isAnimationActive={false}
                dot={({ key, cx, cy, payload }) => (
                  <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={3}
                    stroke={color}
                    fill={payload.assessed ? color : "var(--background)"}
                    data-assessed={payload.assessed}
                  />
                )}
              />
            );
          })}
          {series.map(
            (s, i) =>
              s.peak && (
                <ReferenceDot
                  key={s.label}
                  x={s.peak.frequency_hz}
                  y={s.peak.magnitude_mm}
                  r={6}
                  fill="none"
                  stroke={seriesColor(i, series.length)}
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                  label={{
                    value: `${s.peak.magnitude_mm.toFixed(1)} mm @ ${s.peak.frequency_hz.toFixed(1)} Hz`,
                    position: "top",
                    fill: "var(--foreground)",
                  }}
                />
              ),
          )}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
