import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getComparison, getMatrix } from "@/api/comparison";
import { getProjectDemands } from "@/api/demands";

export const keys = {
  comparison: (componentId?: number, revisions?: string[], baseline?: string) =>
    ["comparison", componentId, revisions, baseline] as const,
  matrix: (projectId?: number) => ["matrix", projectId] as const,
  // Under "demands", like the shared open-count query, so one invalidation covers both.
  projectDemands: (projectId?: number) =>
    ["demands", "project", projectId] as const,
};

/** Idle until a component is known, and while no revision is selected (an empty list). */
export function useComparison(
  componentId: number | undefined,
  revisions?: string[],
  baseline?: string,
) {
  return useQuery({
    queryKey: keys.comparison(componentId, revisions, baseline),
    queryFn: () => getComparison(componentId!, revisions, baseline),
    enabled: componentId !== undefined && revisions?.length !== 0,
    // Keep the view in place while a toggled revision or baseline loads.
    placeholderData: keepPreviousData,
  });
}

/** Idle until a project is known. */
export function useMatrix(projectId: number | undefined) {
  return useQuery({
    queryKey: keys.matrix(projectId),
    queryFn: () => getMatrix(projectId!),
    enabled: projectId !== undefined,
  });
}

/** Idle until a project is known. */
export function useProjectDemands(projectId: number | undefined) {
  return useQuery({
    queryKey: keys.projectDemands(projectId),
    queryFn: () => getProjectDemands(projectId!),
    enabled: projectId !== undefined,
  });
}
