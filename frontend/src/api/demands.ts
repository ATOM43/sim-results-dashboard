import { request } from "./client";

export async function getOpenDemandCount(projectId: number) {
  const demands = await request<unknown[]>(
    `/api/demands?status=Open&project_id=${projectId}`,
  );
  return demands.length;
}
