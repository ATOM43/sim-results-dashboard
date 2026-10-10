import { useState, type ReactNode } from "react";
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
import { hz, mm } from "./format";
import { seriesColor, seriesDash } from "./seriesStyle";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const FULL_MAX_HZ = 200;
const activeToggle =
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

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
  /** Shown left of the zoom toggle. */
  title?: ReactNode;
};

export function FrequencyChart({
  series,
  limitMm = 15,
  assessMaxHz = 50,
  title,
}: Props) {
  const [zoom, setZoom] = useState<"full" | "assessed">("full");
  const maxHz = zoom === "full" ? FULL_MAX_HZ : assessMaxHz;
  // Headroom so neither the limit line nor the peak touches the top edge.
  const maxMm = Math.ceil(
    Math.max(
      limitMm,
      ...series.flatMap((s) => s.samples.map((p) => p.magnitude_mm)),
    ) * 1.2,
  );
  // A label above a peak that is at or just under the limit would sit on the limit line; put it below and to the right
  // instead (straight below would sit on the curve).
  const labelBelow = (peakMm: number) =>
    peakMm <= limitMm && limitMm - peakMm < maxMm * 0.15;
  const config = Object.fromEntries(
    series.map((s, i) => [
      s.label,
      { label: s.label, color: seriesColor(i, series.length) },
    ]),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-heading text-base font-medium">{title}</div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Frequency range"
          value={zoom}
          // Radix sends "" when the active item is pressed again; keep the current zoom.
          onValueChange={(v) => v && setZoom(v as typeof zoom)}
        >
          <ToggleGroupItem value="full" className={activeToggle}>
            0–{FULL_MAX_HZ} Hz
          </ToggleGroupItem>
          <ToggleGroupItem value="assessed" className={activeToggle}>
            Zoom 0–{assessMaxHz} Hz
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
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
            domain={[0, maxMm]}
            label={{
              value: "Magnitude (mm)",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <ReferenceArea
            x1={0}
            x2={assessMaxHz}
            fill="var(--assessed)"
            fillOpacity={1}
            label={{ value: "Assessed", position: "insideTopLeft" }}
          />
          <ReferenceLine
            y={limitMm}
            stroke="var(--warning-foreground)"
            strokeDasharray="6 4"
            label={{
              value: `${mm(limitMm)} limit`,
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
                strokeDasharray={seriesDash(i, series.length)}
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
                  // Several peaks sit close together and their labels would overlap; the caller lists them instead.
                  label={
                    series.length === 1
                      ? {
                          value: `${mm(s.peak.magnitude_mm)} @ ${hz(s.peak.frequency_hz)}`,
                          ...(labelBelow(s.peak.magnitude_mm)
                            ? { position: "right", dy: 16 }
                            : { position: "top" }),
                          offset: 10,
                          fill: "var(--foreground)",
                        }
                      : undefined
                  }
                />
              ),
          )}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
