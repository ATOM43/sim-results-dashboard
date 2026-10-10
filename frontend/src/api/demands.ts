import { request } from "./client";
import type { Verdict } from "./components";

export async function getOpenDemandCount(projectId: number) {
  const demands = await request<unknown[]>(
    `/api/demands?status=Open&project_id=${projectId}`,
  );
  return demands.length;
}

export type DemandStatus = "Open" | "In Progress" | "Resolved";

export type DemandHistoryEntry = {
  revision_id: number;
  revision_label: string;
  /** The three below are null when the component has no result in this revision. */
  result_id: number | null;
  peak_magnitude_mm: number | null;
  verdict: Verdict | null;
};

export type Demand = {
  id: number;
  description: string;
  status: DemandStatus;
  component: { id: number; name: string };
  project: { id: number; name: string };
  origin_type: "finding" | "manual";
  origin_revision_label: string | null;
  origin_value_mm: number | null;
  origin_frequency_hz: number | null;
  origin_limit_mm: number | null;
  origin_source_key: string | null;
  created_at: string;
  history: DemandHistoryEntry[];
  latest_result: DemandHistoryEntry | null;
  latest_passes_but_open: boolean;
};

export type DemandCreate =
  | { origin_result_id: number; description: string }
  | { origin_type: "manual"; component_id: number; description: string };

export function getComponentDemands(componentId: number) {
  return request<Demand[]>(`/api/demands?component_id=${componentId}`);
}

export function getProjectDemands(projectId: number) {
  return request<Demand[]>(`/api/demands?project_id=${projectId}`);
}

export function getDemand(demandId: number) {
  return request<Demand>(`/api/demands/${demandId}`);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** The API always creates a demand as Open. */
export function createDemand(body: DemandCreate) {
  return request<Demand>("/api/demands", json("POST", body));
}

export function updateDemand(
  demandId: number,
  body: { description: string; status: DemandStatus },
) {
  return request<Demand>(`/api/demands/${demandId}`, json("PATCH", body));
}
