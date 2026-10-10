import { request } from "./client";

export async function getOpenDemandCount(projectId: number) {
  const demands = await request<unknown[]>(
    `/api/demands?status=Open&project_id=${projectId}`,
  );
  return demands.length;
}

export type Demand = {
  id: number;
  description: string;
  status: "Open" | "In Progress" | "Resolved";
  component: { id: number; name: string };
  origin_type: "finding" | "manual";
  origin_revision_label: string | null;
  origin_value_mm: number | null;
  origin_frequency_hz: number | null;
  origin_limit_mm: number | null;
};

export function getComponentDemands(componentId: number) {
  return request<Demand[]>(`/api/demands?component_id=${componentId}`);
}

export function getProjectDemands(projectId: number) {
  return request<Demand[]>(`/api/demands?project_id=${projectId}`);
}
