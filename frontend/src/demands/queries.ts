import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDemand, getDemand, updateDemand } from "@/api/demands";

export const keys = {
  // The prefix of every demand query: these, the linked demands of Revisions and Compare, and the nav's open count.
  all: ["demands"] as const,
  detail: (demandId: number) => ["demands", "detail", demandId] as const,
};

export function useDemand(demandId: number) {
  return useQuery({
    queryKey: keys.detail(demandId),
    queryFn: () => getDemand(demandId),
  });
}

// Both mutations stay pending until every demand query has refetched, so each page shows the write.
export function useCreateDemand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createDemand,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateDemand(demandId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updateDemand>[1]) =>
      updateDemand(demandId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}
