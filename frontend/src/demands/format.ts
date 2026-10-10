import type { Demand, DemandStatus } from "@/api/demands";
import { hz, mm } from "@/shared/format";

export const statuses: DemandStatus[] = ["Open", "In Progress", "Resolved"];

export const statusLabel: Record<DemandStatus, string> = {
  Open: "Open",
  "In Progress": "In progress",
  Resolved: "Resolved",
};

/** "Peak 19.9 mm at 37.6 Hz · limit 15.0 mm" from the frozen origin; null for a manual demand. */
export function originFinding(demand: Demand) {
  const {
    origin_value_mm: value,
    origin_frequency_hz: frequency,
    origin_limit_mm: limit,
  } = demand;
  return value === null || frequency === null || limit === null
    ? null
    : `Peak ${mm(value)} at ${hz(frequency)} · limit ${mm(limit)}`;
}
