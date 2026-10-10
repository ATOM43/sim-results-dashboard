import { request } from "./client";
import type { Verdict } from "./components";

export type ComponentRevision = {
  revision_id: number;
  revision_label: string;
  sort_key: number;
  /** Null when the component has no result in this revision. */
  result: {
    result_id: number;
    peak_magnitude_mm: number;
    peak_frequency_hz: number;
    verdict: Verdict;
    margin_mm: number;
    delta_vs_previous_mm: number | null;
    source_status: string;
    warnings: string[];
  } | null;
};

export function getComponentRevisions(componentId: number) {
  return request<ComponentRevision[]>(
    `/api/components/${componentId}/revisions`,
  );
}
