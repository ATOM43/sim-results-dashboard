import { useQuery } from "@tanstack/react-query";
import { getComponents } from "@/api/components";
import { getComponentDemands } from "@/api/demands";
import { getResult } from "@/api/results";
import { getComponentRevisions } from "@/api/revisions";

export const keys = {
  components: (projectId?: number) => ["components", projectId] as const,
  componentRevisions: (componentId?: number) =>
    ["revisions", componentId] as const,
  result: (resultId: number) => ["result", resultId] as const,
  // Under "demands", like the shared open-count query, so one invalidation covers both.
  componentDemands: (componentId: number) =>
    ["demands", "component", componentId] as const,
};

/** Idle until a project is known. */
export function useComponents(projectId: number | undefined) {
  return useQuery({
    queryKey: keys.components(projectId),
    queryFn: () => getComponents(projectId!),
    enabled: projectId !== undefined,
  });
}

/** Idle until a component is known. */
export function useComponentRevisions(componentId: number | undefined) {
  return useQuery({
    queryKey: keys.componentRevisions(componentId),
    queryFn: () => getComponentRevisions(componentId!),
    enabled: componentId !== undefined,
  });
}

export function useResult(resultId: number) {
  return useQuery({
    queryKey: keys.result(resultId),
    queryFn: () => getResult(resultId),
  });
}

export function useComponentDemands(componentId: number) {
  return useQuery({
    queryKey: keys.componentDemands(componentId),
    queryFn: () => getComponentDemands(componentId),
  });
}
